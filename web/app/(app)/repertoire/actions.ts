"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAcces, getSessionProfile } from "@/lib/queries";

// ═══════════════════════════════════════════════════════════════
//  Répertoire des contacts (Dispensaire de Saint-Denis) — écriture
//  web-native. Toute modification est tracée (DispensaireHistorique).
//  Consultation : tous. Écriture : autorisés (direction/médecin).
// ═══════════════════════════════════════════════════════════════

export type DispResult = { ok: boolean; error?: string; id?: string };
export type FicheImport = Partial<Record<ChampContact, string>> & { nom: string; categorie?: string };

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
type ChampContact =
  | "nom" | "categorieId" | "responsable" | "description" | "adresse" | "telegramme"
  | "contactSecondaire" | "horaires" | "notes" | "typeService" | "produits" | "tarifs" | "banque" | "moyensContact";

const LABELS: Record<string, string> = {
  nom: "Nom", categorieId: "Catégorie", responsable: "Responsable", description: "Description", adresse: "Adresse",
  telegramme: "Télégramme", contactSecondaire: "Contact secondaire", horaires: "Horaires", notes: "Notes",
  typeService: "Type de service", produits: "Produits", tarifs: "Tarifs", banque: "Infos bancaires", moyensContact: "Moyens de contact",
};
const CHAMPS: ChampContact[] = ["nom", "categorieId", "responsable", "description", "adresse", "telegramme", "contactSecondaire", "horaires", "notes", "typeService", "produits", "tarifs", "banque", "moyensContact"];

const s = (v: unknown, max = 4000) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
function newId(p: string) { return `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

async function qui() { try { const p = await getSessionProfile(); return p?.nom || "Équipe"; } catch { return "Équipe"; } }
async function autorise() { try { const a = await getAcces(); return a.peutMedical; } catch { return true; } }

async function tracer(admin: Admin, rows: { contactId: string; contactNom: string; action: string; champ?: string; ancien?: string | null; nouveau?: string | null; par: string }[]) {
  if (!rows.length) return;
  try { await admin.from("DispensaireHistorique").insert(rows.map((r) => ({ id: newId("dh"), contactId: r.contactId, contactNom: r.contactNom, action: r.action, champ: r.champ ?? null, ancien: r.ancien ?? null, nouveau: r.nouveau ?? null, par: r.par }))); } catch { /* best-effort */ }
}

function nettoyer(data: Record<string, unknown>) {
  const row: Record<string, unknown> = {};
  for (const c of CHAMPS) if (c in data) row[c] = c === "nom" ? s(data[c], 200) : s(data[c], c === "notes" || c === "description" ? 4000 : 500);
  return row;
}

// ── Contacts ─────────────────────────────────────────────────────
export async function creerContact(data: Record<string, unknown>): Promise<DispResult> {
  if (!(await autorise())) return { ok: false, error: "Tu n'as pas les droits pour ajouter un contact." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const row = nettoyer(data);
  if (!row.nom) return { ok: false, error: "Donne un nom au contact." };
  const id = newId("dc");
  const par = await qui();
  const { error } = await admin.from("DispensaireContact").insert({ id, ...row, source: "site", updatedBy: par, updatedAt: new Date().toISOString() });
  if (error) return { ok: false, error: "Création impossible (la table existe-t-elle ?)." };
  await tracer(admin, [{ contactId: id, contactNom: String(row.nom), action: "creation", par }]);
  return { ok: true, id };
}

export async function majContact(id: string, patch: Record<string, unknown>): Promise<DispResult> {
  if (!(await autorise())) return { ok: false, error: "Tu n'as pas les droits pour modifier ce contact." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Contact introuvable." };
  const { data: ex } = await admin.from("DispensaireContact").select("*").eq("id", id).maybeSingle();
  if (!ex) return { ok: false, error: "Contact introuvable." };
  const row = nettoyer(patch);
  if ("nom" in row && !row.nom) return { ok: false, error: "Le nom ne peut pas être vide." };
  const par = await qui();
  const exRow = ex as Record<string, unknown>;
  const diffs = Object.keys(row).filter((k) => String((exRow[k] as string) ?? "") !== String((row[k] as string) ?? ""));
  if (!diffs.length) return { ok: true };
  const { error } = await admin.from("DispensaireContact").update({ ...row, updatedBy: par, updatedAt: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  await tracer(admin, diffs.map((k) => ({ contactId: id, contactNom: String(row.nom ?? exRow.nom ?? ""), action: "modification", champ: LABELS[k] || k, ancien: (exRow[k] as string) ?? null, nouveau: (row[k] as string) ?? null, par })));
  return { ok: true };
}

export async function supprimerContact(id: string): Promise<DispResult> {
  if (!(await autorise())) return { ok: false, error: "Tu n'as pas les droits pour supprimer ce contact." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const { data: ex } = await admin.from("DispensaireContact").select("id,nom").eq("id", id).maybeSingle();
  if (!ex) return { ok: true };
  const { error } = await admin.from("DispensaireContact").delete().eq("id", id);
  if (error) return { ok: false, error: "Suppression impossible." };
  await tracer(admin, [{ contactId: id, contactNom: String((ex as { nom: string }).nom || ""), action: "suppression", par: await qui() }]);
  return { ok: true };
}

export async function deplacerContact(id: string, categorieId: string | null): Promise<DispResult> {
  return majContact(id, { categorieId: categorieId ?? "" });
}

// ── Catégories ───────────────────────────────────────────────────
export async function creerCategorie(nom: string): Promise<DispResult> {
  if (!(await autorise())) return { ok: false, error: "Droits insuffisants." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const n = s(nom, 80);
  if (!n) return { ok: false, error: "Donne un nom à la catégorie." };
  const id = "cat-" + (norm(n).slice(0, 24) || "x") + "-" + Math.random().toString(36).slice(2, 5);
  const { data: cs } = await admin.from("DispensaireCategorie").select("ordre");
  const ordre = ((cs || []) as { ordre: number }[]).reduce((m, c) => Math.max(m, Number(c.ordre) || 0), 0) + 1;
  const { error } = await admin.from("DispensaireCategorie").insert({ id, nom: n, ordre });
  return error ? { ok: false, error: "Création impossible." } : { ok: true, id };
}

export async function majCategorie(id: string, nom: string): Promise<DispResult> {
  if (!(await autorise())) return { ok: false, error: "Droits insuffisants." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const n = s(nom, 80);
  if (!id || !n) return { ok: false, error: "Nom manquant." };
  const { error } = await admin.from("DispensaireCategorie").update({ nom: n }).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}

export async function supprimerCategorie(id: string): Promise<DispResult> {
  if (!(await autorise())) return { ok: false, error: "Droits insuffisants." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Catégorie introuvable." };
  // Les fiches de cette catégorie basculent en « sans catégorie » (jamais perdues).
  try { await admin.from("DispensaireContact").update({ categorieId: null }).eq("categorieId", id); } catch { /* best-effort */ }
  const { error } = await admin.from("DispensaireCategorie").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}

// ── Import (fiches parsées → base, avec dédoublonnage + rapport) ──
export type ImportRapport = { ok: boolean; importes: number; doublons: number; erreurs: number; aVerifier: string[]; error?: string };
export async function importerContacts(fiches: FicheImport[]): Promise<ImportRapport> {
  if (!(await autorise())) return { ok: false, importes: 0, doublons: 0, erreurs: 0, aVerifier: [], error: "Droits insuffisants." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, importes: 0, doublons: 0, erreurs: 0, aVerifier: [], error: "Service momentanément indisponible." };
  const list = Array.isArray(fiches) ? fiches.slice(0, 1000) : [];
  if (!list.length) return { ok: false, importes: 0, doublons: 0, erreurs: 0, aVerifier: [], error: "Aucune fiche à importer." };

  const { data: exData } = await admin.from("DispensaireContact").select("nom");
  const vus = new Set(((exData || []) as { nom: string }[]).map((c) => norm(c.nom)));
  const { data: catData } = await admin.from("DispensaireCategorie").select("id,nom");
  const catParNom = new Map(((catData || []) as { id: string; nom: string }[]).map((c) => [norm(c.nom), c.id]));

  const par = await qui();
  let importes = 0, doublons = 0, erreurs = 0;
  const aVerifier: string[] = [];
  const rows: Record<string, unknown>[] = [];
  const traces: { contactId: string; contactNom: string; action: string; par: string }[] = [];

  for (const f of list) {
    const nom = s(f.nom, 200);
    if (!nom) { erreurs++; continue; }
    const k = norm(nom);
    if (vus.has(k)) { doublons++; continue; }
    vus.add(k);
    const row = nettoyer(f as Record<string, unknown>);
    if (f.categorie) { const cid = catParNom.get(norm(f.categorie)); if (cid) row.categorieId = cid; }
    const id = newId("dc");
    rows.push({ id, ...row, nom, source: "discord", updatedBy: par, updatedAt: new Date().toISOString() });
    traces.push({ contactId: id, contactNom: nom, action: "import", par });
    importes++;
    // Fiche « à vérifier » si elle n'a quasiment que le nom.
    if (Object.keys(row).filter((c) => c !== "nom" && row[c]).length === 0) aVerifier.push(nom);
  }

  if (rows.length) {
    const { error } = await admin.from("DispensaireContact").insert(rows);
    if (error) return { ok: false, importes: 0, doublons, erreurs: erreurs + rows.length, aVerifier: [], error: "Insertion impossible." };
    await tracer(admin, traces);
  }
  return { ok: true, importes, doublons, erreurs, aVerifier: aVerifier.slice(0, 50) };
}
