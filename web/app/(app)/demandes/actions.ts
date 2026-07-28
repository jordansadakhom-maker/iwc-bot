"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/queries";
import { STATUTS_DEMANDE, PRIORITES_DEMANDE, TYPES_DEMANDE, typeDemandeDef, statutDemandeDef, genererRefDemandeLocale } from "@/lib/demandes-const";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
export type DemandeResult = { ok: boolean; error?: string; id?: string };

const s = (v: unknown, max = 4000) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
function newId(p = "dem") { return `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

// Identité de l'auteur : ID Discord + nom d'affichage.
async function acteur(): Promise<{ id: string | null; nom: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { id: null, nom: "Membre" };
    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    const id = String(meta.provider_id || meta.sub || "") || null;
    let nom = String(meta.full_name || meta.name || meta.user_name || user.email || "Membre");
    const admin = createAdminClient();
    if (id && admin) { const { data } = await admin.from("Membre").select("nomIC").eq("id", id).maybeSingle(); if (data?.nomIC) nom = String(data.nomIC); }
    return { id, nom };
  } catch { return { id: null, nom: "Membre" }; }
}

async function connecte(): Promise<boolean> {
  try { return !!(await getSessionProfile()); } catch { return false; }
}

// Journalise un évènement du dossier (historique inviolable).
async function journal(admin: Admin, demandeId: string, type: string, par: string | null, details?: Record<string, unknown>) {
  try { await admin.from("DemandeEvent").insert({ id: newId("dev"), demandeId, type, par, details: details ?? null }); } catch { /* best-effort */ }
}

// Crée une notification (centre du site + relève Discord par le bot). ref = dédup.
async function notifier(admin: Admin, o: { type: string; titre: string; corps?: string | null; demandeId: string; roleCible?: string | null; membreId?: string | null; ref: string }) {
  try {
    await admin.from("Notification").insert({
      id: newId("ntf"), type: o.type, titre: o.titre, corps: o.corps ?? null,
      lien: `/demandes/${o.demandeId}`, cibleId: o.demandeId,
      roleCible: o.roleCible ?? null, membreId: o.membreId ?? null, ref: o.ref, lu: false,
    });
  } catch { /* best-effort */ }
}

const okType = (t: unknown) => (TYPES_DEMANDE.some((x) => x.key === t) ? String(t) : "autre");
const okPrio = (p: unknown) => (PRIORITES_DEMANDE.some((x) => x.key === p) ? String(p) : "normale");
const okStatut = (st: unknown) => (STATUTS_DEMANDE.some((x) => x.key === st) ? String(st) : null);

// ── Créer une demande ────────────────────────────────────────────────────────
export async function creerDemande(data: Record<string, unknown>): Promise<DemandeResult> {
  if (!(await connecte())) return { ok: false, error: "Connexion requise." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const titre = s(data.titre, 200);
  if (!titre) return { ok: false, error: "Donne un titre à la demande." };
  const type = okType(data.type);
  const roleCible = s(data.roleCible, 40) ?? typeDemandeDef(type).roleCible;
  const { id: auteurId, nom: auteurNom } = await acteur();
  const id = newId();
  // Numéro lisible via la fonction SQL (repli local si absente).
  let ref: string | null = null;
  try { const { data: r } = await admin.rpc("next_demande_ref"); if (r) ref = String(r); } catch { /* repli */ }
  if (!ref) ref = genererRefDemandeLocale(new Date().getFullYear(), Math.random().toString(36).slice(2));
  const row = {
    id, ref, type, titre, resume: s(data.resume, 4000), priorite: okPrio(data.priorite),
    statut: "nouvelle", auteurId, auteurNom, roleCible,
    cibleId: s(data.cibleId, 120), lien: s(data.lien, 300), updatedBy: auteurNom,
  };
  const { error } = await admin.from("Demande").insert(row);
  if (error) return { ok: false, error: "Création impossible (le SQL des demandes a-t-il été lancé ?)." };
  // Message initial = le contenu de la demande, dans la conversation.
  const corps = s(data.resume, 4000);
  if (corps) { try { await admin.from("DemandeMessage").insert({ id: newId("msg"), demandeId: id, auteurId, auteurNom, corps }); } catch { /* ignore */ } }
  await journal(admin, id, "creation", auteurNom, { type, priorite: row.priorite });
  await notifier(admin, { type: "demande", titre: `${typeDemandeDef(type).icon} ${titre}`, corps: `${auteurNom} · ${typeDemandeDef(type).label}`, demandeId: id, roleCible, ref: `demande-${id}` });
  return { ok: true, id };
}

// ── Répondre (message dans la conversation) ─────────────────────────────────
export async function repondreDemande(demandeId: string, corps: string, pieces?: { nom: string; url: string }[]): Promise<DemandeResult> {
  if (!(await connecte())) return { ok: false, error: "Connexion requise." };
  const admin = createAdminClient();
  if (!admin || !demandeId) return { ok: false, error: "Demande introuvable." };
  const texte = s(corps, 8000);
  if (!texte && !(pieces && pieces.length)) return { ok: false, error: "Message vide." };
  const { id: auteurId, nom: auteurNom } = await acteur();
  const { error } = await admin.from("DemandeMessage").insert({ id: newId("msg"), demandeId, auteurId, auteurNom, corps: texte ?? "", pieces: Array.isArray(pieces) ? pieces.slice(0, 20) : [] });
  if (error) return { ok: false, error: "Envoi impossible." };
  await admin.from("Demande").update({ updatedAt: new Date().toISOString(), updatedBy: auteurNom }).eq("id", demandeId);
  await journal(admin, demandeId, "message", auteurNom);
  return { ok: true };
}

// ── Prendre en charge / transférer / libérer ────────────────────────────────
export async function prendreEnCharge(demandeId: string): Promise<DemandeResult> {
  if (!(await connecte())) return { ok: false, error: "Connexion requise." };
  const admin = createAdminClient();
  if (!admin || !demandeId) return { ok: false, error: "Demande introuvable." };
  const { id: assigneId, nom: assigneNom } = await acteur();
  const now = new Date().toISOString();
  const { error } = await admin.from("Demande").update({ assigneId, assigneNom, assigneAt: now, statut: "en_cours", updatedAt: now, updatedBy: assigneNom }).eq("id", demandeId);
  if (error) return { ok: false, error: "Action impossible." };
  await journal(admin, demandeId, "prise_en_charge", assigneNom);
  return { ok: true };
}

export async function transfererDemande(demandeId: string, versId: string, versNom: string): Promise<DemandeResult> {
  if (!(await connecte())) return { ok: false, error: "Connexion requise." };
  const admin = createAdminClient();
  if (!admin || !demandeId) return { ok: false, error: "Demande introuvable." };
  const { nom: par } = await acteur();
  const now = new Date().toISOString();
  const nom = s(versNom, 120);
  const { error } = await admin.from("Demande").update({ assigneId: s(versId, 60), assigneNom: nom, assigneAt: now, updatedAt: now, updatedBy: par }).eq("id", demandeId);
  if (error) return { ok: false, error: "Transfert impossible." };
  await journal(admin, demandeId, "transfert", par, { vers: nom });
  if (s(versId, 60)) await notifier(admin, { type: "demande-transfert", titre: `📨 Demande transférée`, corps: `Réassignée à ${nom || "toi"}`, demandeId, membreId: s(versId, 60), ref: `demande-transfert-${demandeId}-${Date.now()}` });
  return { ok: true };
}

export async function libererDemande(demandeId: string): Promise<DemandeResult> {
  if (!(await connecte())) return { ok: false, error: "Connexion requise." };
  const admin = createAdminClient();
  if (!admin || !demandeId) return { ok: false, error: "Demande introuvable." };
  const { nom: par } = await acteur();
  const now = new Date().toISOString();
  const { error } = await admin.from("Demande").update({ assigneId: null, assigneNom: null, assigneAt: null, updatedAt: now, updatedBy: par }).eq("id", demandeId);
  if (error) return { ok: false, error: "Action impossible." };
  await journal(admin, demandeId, "transfert", par, { vers: null });
  return { ok: true };
}

// ── Changer le statut ────────────────────────────────────────────────────────
export async function changerStatutDemande(demandeId: string, statut: string): Promise<DemandeResult> {
  if (!(await connecte())) return { ok: false, error: "Connexion requise." };
  const admin = createAdminClient();
  if (!admin || !demandeId) return { ok: false, error: "Demande introuvable." };
  const st = okStatut(statut);
  if (!st) return { ok: false, error: "Statut invalide." };
  const { nom: par } = await acteur();
  const now = new Date().toISOString();
  const clos = st === "terminee" || st === "refusee" || st === "archivee";
  const patch: Record<string, unknown> = { statut: st, updatedAt: now, updatedBy: par, closedAt: clos ? now : null };
  const { data: avant } = await admin.from("Demande").select("auteurId,titre").eq("id", demandeId).maybeSingle();
  const { error } = await admin.from("Demande").update(patch).eq("id", demandeId);
  if (error) return { ok: false, error: "Changement impossible." };
  await journal(admin, demandeId, clos ? "cloture" : "statut", par, { statut: st });
  // Notifie l'auteur du changement de statut (sur le site + Discord via le bot).
  const auteurId = avant?.auteurId ? String(avant.auteurId) : null;
  if (auteurId) await notifier(admin, { type: "demande-statut", titre: `🔁 ${statutDemandeDef(st).label}`, corps: `${avant?.titre || "Votre demande"}`, demandeId, membreId: auteurId, ref: `demande-statut-${demandeId}-${st}` });
  return { ok: true };
}
