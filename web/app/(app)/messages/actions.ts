"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getActeur } from "@/lib/authz";
import { emettreEvenement } from "@/lib/evenements";
import { apercu, versConversation, versMessage, type ConversationListe, type Conversation, type Message } from "@/lib/conversations";

const s = (v: unknown, max = 300) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
const POLES = new Set(["iwc", "confrerie"]);

// Notification d'équipe (même forme que les triggers existants : sans membreId
// ni roleCible → visible de tous dans le centre). Best-effort, ne bloque rien.
async function notifierEquipe(admin: ReturnType<typeof createAdminClient>, n: { titre: string; corps: string; lien: string; cibleId: string; ref: string }) {
  if (!admin) return;
  try {
    await admin.from("Notification").insert({
      id: crypto.randomUUID(), type: "message", titre: n.titre.slice(0, 200), corps: n.corps.slice(0, 200),
      lien: n.lien, cibleId: n.cibleId, ref: n.ref, createdAt: new Date().toISOString(),
    });
  } catch { /* best-effort */ }
}

export async function listerConversations(): Promise<{ connecte: boolean; moiId: string | null; conversations: ConversationListe[] }> {
  const a = await getActeur();
  if (!a) return { connecte: false, moiId: null, conversations: [] };
  const admin = createAdminClient();
  if (!admin) return { connecte: false, moiId: a.did, conversations: [] };
  const { data, error } = await admin.from("Conversation").select("*").order("lastMessageAt", { ascending: false }).limit(300);
  if (error) return { connecte: true, moiId: a.did, conversations: [] };
  const convs = ((data || []) as Record<string, unknown>[]).map(versConversation);

  // État de lecture du membre courant (une requête, jointure en mémoire).
  const vues = new Map<string, string>();
  try {
    const { data: vd } = await admin.from("ConversationVue").select("conversationId,vuAt").eq("membreId", a.did);
    for (const v of (vd || []) as Record<string, unknown>[]) vues.set(String(v.conversationId), String(v.vuAt));
  } catch { /* table absente → tout non-lu, sans planter */ }

  const enrichies: ConversationListe[] = convs.map((c) => {
    const vueAt = vues.get(c.id) ?? null;
    const last = new Date(c.lastMessageAt).getTime();
    const vue = vueAt ? new Date(vueAt).getTime() : NaN;
    const nonLu = !vueAt ? true : Number.isFinite(last) && Number.isFinite(vue) ? last > vue : false;
    return { ...c, nonLu };
  });
  return { connecte: true, moiId: a.did, conversations: enrichies };
}

export async function ouvrirConversation(id: string): Promise<{ ok: boolean; conversation: Conversation | null; messages: Message[]; error?: string }> {
  const a = await getActeur();
  if (!a) return { ok: false, conversation: null, messages: [], error: "Accès refusé." };
  const admin = createAdminClient();
  if (!admin || !id) return { ok: false, conversation: null, messages: [], error: "Conversation introuvable." };
  const { data: cd, error: ce } = await admin.from("Conversation").select("*").eq("id", id).maybeSingle();
  if (ce || !cd) return { ok: false, conversation: null, messages: [], error: "Conversation introuvable." };
  const { data: md } = await admin.from("Message").select("*").eq("conversationId", id).order("createdAt", { ascending: true }).limit(500);
  const messages = ((md || []) as Record<string, unknown>[]).map(versMessage);
  // Marque comme lue pour le membre courant (upsert sur la clé composite).
  try {
    await admin.from("ConversationVue").upsert(
      { conversationId: id, membreId: a.did, vuAt: new Date().toISOString() },
      { onConflict: "conversationId,membreId" },
    );
  } catch { /* best-effort */ }
  return { ok: true, conversation: versConversation(cd as Record<string, unknown>), messages };
}

export async function creerConversation(data: { sujet: string; corps: string; pole?: string }): Promise<{ ok: boolean; id?: string; error?: string }> {
  const a = await getActeur();
  if (!a) return { ok: false, error: "Accès refusé — réservé aux membres connectés." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const sujet = s(data.sujet, 200);
  const corps = s(data.corps, 4000);
  if (!sujet) return { ok: false, error: "Donne un sujet à la conversation." };
  if (!corps) return { ok: false, error: "Écris un premier message." };
  const pole = data.pole && POLES.has(data.pole) ? data.pole : null;
  const now = new Date().toISOString();
  const id = `conv-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const { error } = await admin.from("Conversation").insert({
    id, sujet, pole, statut: "ouverte", creePar: a.nomIC, creeParId: a.did,
    lastMessageAt: now, lastApercu: apercu(corps), lastAuteur: a.nomIC, createdAt: now, updatedAt: now,
  });
  if (error) { console.error("creerConversation:", error.message); return { ok: false, error: "Création impossible (les tables Conversation existent-elles ?)." }; }

  const mid = `msg-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await admin.from("Message").insert({ id: mid, conversationId: id, auteurId: a.did, auteurNom: a.nomIC, corps, createdAt: now });
  // Le créateur a déjà "lu" son propre fil.
  try { await admin.from("ConversationVue").upsert({ conversationId: id, membreId: a.did, vuAt: now }, { onConflict: "conversationId,membreId" }); } catch { /* best-effort */ }

  await notifierEquipe(admin, { titre: `Nouvelle conversation — ${sujet}`, corps: `${a.nomIC} : ${apercu(corps, 140)}`, lien: `/messages?c=${id}`, cibleId: id, ref: `conv-new-${id}` });
  await emettreEvenement({ aggregate: "conversation", type: "conversation.creee", cibleId: id, cibleLibelle: sujet, pole });
  return { ok: true, id };
}

export async function envoyerMessage(conversationId: string, corps: string): Promise<{ ok: boolean; error?: string }> {
  const a = await getActeur();
  if (!a) return { ok: false, error: "Accès refusé." };
  const admin = createAdminClient();
  if (!admin || !conversationId) return { ok: false, error: "Conversation introuvable." };
  const c = s(corps, 4000);
  if (!c) return { ok: false, error: "Message vide." };
  const now = new Date().toISOString();
  const mid = `msg-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const { error } = await admin.from("Message").insert({ id: mid, conversationId, auteurId: a.did, auteurNom: a.nomIC, corps: c, createdAt: now });
  if (error) return { ok: false, error: "Envoi impossible." };
  await admin.from("Conversation").update({ lastMessageAt: now, lastApercu: apercu(c), lastAuteur: a.nomIC, updatedAt: now }).eq("id", conversationId);
  // L'auteur reste à jour de son propre message.
  try { await admin.from("ConversationVue").upsert({ conversationId, membreId: a.did, vuAt: now }, { onConflict: "conversationId,membreId" }); } catch { /* best-effort */ }
  await emettreEvenement({ aggregate: "conversation", type: "message.envoye", cibleId: conversationId });
  return { ok: true };
}

export async function archiverConversation(id: string, archive: boolean): Promise<{ ok: boolean; error?: string }> {
  const a = await getActeur();
  if (!a) return { ok: false, error: "Accès refusé." };
  const admin = createAdminClient();
  if (!admin || !id) return { ok: false, error: "Conversation introuvable." };
  const { error } = await admin.from("Conversation").update({ statut: archive ? "archivee" : "ouverte", updatedAt: new Date().toISOString() }).eq("id", id);
  return { ok: !error, error: error ? "Enregistrement impossible." : undefined };
}
