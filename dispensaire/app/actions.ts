"use server";

import { db, newId } from "@/lib/supabase";
import { debutSemaine, LIMITE_BANDAGES, type Salarie, type FactureRow } from "@/lib/data";

type R = { ok: boolean; error?: string };
const str = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Insert tolérant : si une colonne n'existe pas (vieux schéma), on la retire et on réessaie.
async function insertR(sb: NonNullable<ReturnType<typeof db>>, table: string, row: Record<string, unknown>): Promise<R> {
  const r: Record<string, unknown> = { ...row };
  for (let i = 0; i < 8; i++) {
    const { error } = await sb.from(table).insert(r);
    if (!error) return { ok: true };
    const m = /column "?([a-zA-Z0-9_]+)"?.*does not exist/i.exec(error.message || "");
    if (m && m[1] in r && Object.keys(r).length > 2) { delete r[m[1]]; continue; }
    return { ok: false, error: "Enregistrement impossible — exécute (ou ré-exécute) sql/init.sql dans Supabase." };
  }
  return { ok: false, error: "Enregistrement impossible." };
}

// ═══ Prise / fin de service (chrono des heures) ══════════════════
export async function prendreService(salarieNom: string): Promise<R> {
  const nom = str(salarieNom, 120);
  if (nom.length < 2) return { ok: false, error: "Indique ton nom." };
  const sb = db(); if (!sb) return { ok: false, error: "Base non configurée." };
  const { data: ouvert } = await sb.from("DispPointage").select("id").eq("salarieNom", nom).is("fin", null).limit(1);
  if (Array.isArray(ouvert) && ouvert.length) return { ok: false, error: "Tu es déjà en service." };
  return insertR(sb, "DispPointage", { id: newId("ptg"), salarieNom: nom, debut: new Date().toISOString() });
}

export async function finService(pointageId: string): Promise<R> {
  const sb = db(); if (!sb) return { ok: false, error: "Base non configurée." };
  const { data } = await sb.from("DispPointage").select("debut").eq("id", pointageId).maybeSingle();
  if (!data) return { ok: false, error: "Pointage introuvable." };
  const debut = new Date(String((data as { debut: string }).debut)).getTime();
  const minutes = Math.max(0, Math.round((Date.now() - debut) / 60000));
  const { error } = await sb.from("DispPointage").update({ fin: new Date().toISOString(), minutes }).eq("id", pointageId);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}

// ═══ Stockage : article + traçabilité ════════════════════════════
export async function ajouterArticle(p: { nom: string; categorie: string; lieu?: string; quantite?: number; seuil?: number; unite?: string }): Promise<R> {
  const nom = str(p.nom, 120);
  if (nom.length < 1) return { ok: false, error: "Nom requis." };
  const sb = db(); if (!sb) return { ok: false, error: "Base non configurée." };
  return insertR(sb, "DispStock", {
    id: newId("stk"), nom, categorie: str(p.categorie, 40) || "Matière",
    lieu: str(p.lieu, 80) || null, quantite: Math.max(0, Math.round(num(p.quantite))),
    seuil: Math.max(0, Math.round(num(p.seuil))), unite: str(p.unite, 20) || null,
    createdAt: new Date().toISOString(),
  });
}

export async function majArticle(id: string, p: { nom?: string; categorie?: string; lieu?: string; seuil?: number; unite?: string }): Promise<R> {
  const sb = db(); if (!sb) return { ok: false, error: "Base non configurée." };
  const patch: Record<string, unknown> = {};
  if (p.nom !== undefined) patch.nom = str(p.nom, 120);
  if (p.categorie !== undefined) patch.categorie = str(p.categorie, 40);
  if (p.lieu !== undefined) patch.lieu = str(p.lieu, 80) || null;
  if (p.seuil !== undefined) patch.seuil = Math.max(0, Math.round(num(p.seuil)));
  if (p.unite !== undefined) patch.unite = str(p.unite, 20) || null;
  const { error } = await sb.from("DispStock").update(patch).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}

export async function supprimerArticle(id: string): Promise<R> {
  const sb = db(); if (!sb) return { ok: false, error: "Base non configurée." };
  await sb.from("DispMouvement").delete().eq("stockId", id);
  const { error } = await sb.from("DispStock").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}

export async function ajusterStock(stockId: string, delta: number, auteur: string, motif?: string): Promise<R> {
  const d = Math.round(num(delta));
  if (!d) return { ok: false, error: "Aucun changement." };
  const sb = db(); if (!sb) return { ok: false, error: "Base non configurée." };
  const { data } = await sb.from("DispStock").select("nom,quantite").eq("id", stockId).maybeSingle();
  if (!data) return { ok: false, error: "Article introuvable." };
  const avant = num((data as { quantite: number }).quantite);
  const apres = Math.max(0, avant + d);
  await sb.from("DispStock").update({ quantite: apres }).eq("id", stockId);
  await insertR(sb, "DispMouvement", {
    id: newId("mvt"), stockId, stockNom: String((data as { nom: string }).nom || ""),
    delta: apres - avant, quantiteApres: apres, auteur: str(auteur, 120) || "—",
    motif: motif ? str(motif, 200) : null, createdAt: new Date().toISOString(),
  });
  return { ok: true };
}

// ═══ Facturation F.D.O. : shérifs par bureau ═════════════════════
export async function ajouterSherif(p: { bureau?: string; nom: string; prixSoin?: number }): Promise<R> {
  const nom = str(p.nom, 120);
  if (nom.length < 1) return { ok: false, error: "Nom requis." };
  const sb = db(); if (!sb) return { ok: false, error: "Base non configurée." };
  return insertR(sb, "DispSherif", { id: newId("shf"), bureau: str(p.bureau, 80) || null, nom, prixSoin: Math.max(0, num(p.prixSoin)), createdAt: new Date().toISOString() });
}
export async function majSherif(id: string, p: { bureau?: string; nom?: string; prixSoin?: number }): Promise<R> {
  const sb = db(); if (!sb) return { ok: false, error: "Base non configurée." };
  const patch: Record<string, unknown> = {};
  if (p.bureau !== undefined) patch.bureau = str(p.bureau, 80) || null;
  if (p.nom !== undefined) patch.nom = str(p.nom, 120);
  if (p.prixSoin !== undefined) patch.prixSoin = Math.max(0, num(p.prixSoin));
  const { error } = await sb.from("DispSherif").update(patch).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}
export async function supprimerSherif(id: string): Promise<R> {
  const sb = db(); if (!sb) return { ok: false, error: "Base non configurée." };
  const { error } = await sb.from("DispSherif").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}

// ═══ Répertoire des entreprises ══════════════════════════════════
export async function ajouterRepertoire(p: { entreprise: string; categorie?: string; contact?: string; telegramme?: string; notes?: string }): Promise<R> {
  const entreprise = str(p.entreprise, 120);
  if (entreprise.length < 1) return { ok: false, error: "Nom d'entreprise requis." };
  const sb = db(); if (!sb) return { ok: false, error: "Base non configurée." };
  return insertR(sb, "DispRepertoire", { id: newId("rep"), entreprise, categorie: str(p.categorie, 60) || null, contact: str(p.contact, 120) || null, telegramme: str(p.telegramme, 60) || null, notes: str(p.notes, 400) || null, createdAt: new Date().toISOString() });
}
export async function majRepertoire(id: string, p: { entreprise?: string; categorie?: string; contact?: string; telegramme?: string; notes?: string }): Promise<R> {
  const sb = db(); if (!sb) return { ok: false, error: "Base non configurée." };
  const patch: Record<string, unknown> = {};
  if (p.entreprise !== undefined) patch.entreprise = str(p.entreprise, 120);
  if (p.categorie !== undefined) patch.categorie = str(p.categorie, 60) || null;
  if (p.contact !== undefined) patch.contact = str(p.contact, 120) || null;
  if (p.telegramme !== undefined) patch.telegramme = str(p.telegramme, 60) || null;
  if (p.notes !== undefined) patch.notes = str(p.notes, 400) || null;
  const { error } = await sb.from("DispRepertoire").update(patch).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}
export async function supprimerRepertoire(id: string): Promise<R> {
  const sb = db(); if (!sb) return { ok: false, error: "Base non configurée." };
  const { error } = await sb.from("DispRepertoire").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}

// ═══ Documents importants ════════════════════════════════════════
export async function ajouterDocument(p: { titre: string; categorie?: string; url?: string; notes?: string }): Promise<R> {
  const titre = str(p.titre, 160);
  if (titre.length < 1) return { ok: false, error: "Titre requis." };
  const sb = db(); if (!sb) return { ok: false, error: "Base non configurée." };
  return insertR(sb, "DispDocument", { id: newId("doc"), titre, categorie: str(p.categorie, 60) || null, url: str(p.url, 500) || null, notes: str(p.notes, 600) || null, createdAt: new Date().toISOString() });
}
export async function supprimerDocument(id: string): Promise<R> {
  const sb = db(); if (!sb) return { ok: false, error: "Base non configurée." };
  const { error } = await sb.from("DispDocument").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}

// ═══ Ventes de bandages (limite 10 / semaine / patient) ══════════
export async function vendreBandage(p: { patient: string; quantite: number; auteur: string }): Promise<R & { total?: number; alerte?: boolean }> {
  const patient = str(p.patient, 120);
  const q = Math.max(1, Math.round(num(p.quantite)));
  if (patient.length < 2) return { ok: false, error: "Nom du patient requis." };
  const sb = db(); if (!sb) return { ok: false, error: "Base non configurée." };
  const { data } = await sb.from("DispVenteBandage").select("quantite").ilike("patient", patient).gte("createdAt", debutSemaine().toISOString());
  const dejaVendu = ((data as { quantite: number }[]) || []).reduce((a, r) => a + num(r.quantite), 0);
  if (dejaVendu + q > LIMITE_BANDAGES) return { ok: false, error: `Limite atteinte : ${patient} a déjà ${dejaVendu}/${LIMITE_BANDAGES} bandages cette semaine.`, total: dejaVendu };
  const r = await insertR(sb, "DispVenteBandage", { id: newId("bnd"), patient, quantite: q, auteur: str(p.auteur, 120) || "—", createdAt: new Date().toISOString() });
  if (!r.ok) return r;
  const total = dejaVendu + q;
  return { ok: true, total, alerte: total >= LIMITE_BANDAGES };
}

// ═══ Certificats médicaux (dépôt Discord + archive) ══════════════
export async function envoyerCertificat(p: { patient: string; praticien: string; type: string; dateActe: string; diagnostic: string; prescription: string; observations: string }): Promise<R> {
  const patient = str(p.patient, 120);
  if (patient.length < 2) return { ok: false, error: "Nom du patient requis." };
  const sb = db();
  // Archive (best-effort) si la base est reliée.
  if (sb) {
    await insertR(sb, "DispCertificat", {
      id: newId("cert"), patient, praticien: str(p.praticien, 120) || null, type: str(p.type, 60) || null,
      diagnostic: str(p.diagnostic, 1000) || null, prescription: str(p.prescription, 1000) || null,
      observations: str(p.observations, 1000) || null, dateActe: str(p.dateActe, 20) || null, createdAt: new Date().toISOString(),
    });
  }
  // Dépôt Discord via webhook (optionnel).
  const hook = process.env.DISP_DISCORD_WEBHOOK;
  if (hook) {
    const L = (t: string, v: string) => (v ? `**${t} :** ${v}\n` : "");
    const contenu =
      `📜 **Certificat médical — Dispensaire de Saint-Denis**\n` +
      L("Type", str(p.type, 60)) + L("Patient", patient) + L("Praticien", str(p.praticien, 120)) +
      L("Date de l'acte", str(p.dateActe, 20)) + L("Diagnostic", str(p.diagnostic, 1000)) +
      L("Prescription / soins", str(p.prescription, 1000)) + L("Observations", str(p.observations, 1000));
    try {
      const res = await fetch(hook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: contenu.slice(0, 1900), username: "Dispensaire de Saint-Denis" }) });
      if (!res.ok) return { ok: false, error: `Discord a refusé l'envoi (code ${res.status}). Certificat archivé quand même.` };
    } catch {
      return { ok: false, error: "Envoi Discord impossible (réseau). Certificat archivé quand même." };
    }
    return { ok: true };
  }
  return { ok: sb ? true : false, error: sb ? undefined : "Base non configurée." };
}

// ═══ Onglets protégés (code chef) ════════════════════════════════
function okChef(code: string): R {
  const attendu = process.env.DISP_CODE_CHEF;
  if (!attendu) return { ok: false, error: "Onglet protégé : définis DISP_CODE_CHEF dans les variables du site." };
  if (str(code, 120) !== attendu) return { ok: false, error: "Code incorrect." };
  return { ok: true };
}

// — Personnel (RH) —
export async function chargerRH(code: string): Promise<R & { salaries?: Salarie[] }> {
  const g = okChef(code); if (!g.ok) return g;
  const sb = db(); if (!sb) return { ok: false, error: "Base non configurée." };
  const { data } = await sb.from("DispSalarie").select("*").order("actif", { ascending: false }).order("nom", { ascending: true });
  const salaries = ((data as Record<string, unknown>[]) || []).map((r) => ({
    id: String(r.id), nom: String(r.nom || "—"), niveau: r.niveau == null ? null : String(r.niveau),
    qualifications: r.qualifications == null ? null : String(r.qualifications), compteBancaire: r.compteBancaire == null ? null : String(r.compteBancaire),
    telegramme: r.telegramme == null ? null : String(r.telegramme), actif: r.actif !== false,
  }));
  return { ok: true, salaries };
}
export async function ajouterSalarie(code: string, p: { nom: string; niveau?: string; qualifications?: string; compteBancaire?: string; telegramme?: string }): Promise<R> {
  const g = okChef(code); if (!g.ok) return g;
  const nom = str(p.nom, 120);
  if (nom.length < 1) return { ok: false, error: "Nom requis." };
  const sb = db(); if (!sb) return { ok: false, error: "Base non configurée." };
  return insertR(sb, "DispSalarie", { id: newId("sal"), nom, niveau: str(p.niveau, 60) || null, qualifications: str(p.qualifications, 300) || null, compteBancaire: str(p.compteBancaire, 60) || null, telegramme: str(p.telegramme, 60) || null, actif: true, createdAt: new Date().toISOString() });
}
export async function majSalarie(code: string, id: string, p: { nom?: string; niveau?: string; qualifications?: string; compteBancaire?: string; telegramme?: string; actif?: boolean }): Promise<R> {
  const g = okChef(code); if (!g.ok) return g;
  const sb = db(); if (!sb) return { ok: false, error: "Base non configurée." };
  const patch: Record<string, unknown> = {};
  if (p.nom !== undefined) patch.nom = str(p.nom, 120);
  if (p.niveau !== undefined) patch.niveau = str(p.niveau, 60) || null;
  if (p.qualifications !== undefined) patch.qualifications = str(p.qualifications, 300) || null;
  if (p.compteBancaire !== undefined) patch.compteBancaire = str(p.compteBancaire, 60) || null;
  if (p.telegramme !== undefined) patch.telegramme = str(p.telegramme, 60) || null;
  if (p.actif !== undefined) patch.actif = !!p.actif;
  const { error } = await sb.from("DispSalarie").update(patch).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}
export async function supprimerSalarie(code: string, id: string): Promise<R> {
  const g = okChef(code); if (!g.ok) return g;
  const sb = db(); if (!sb) return { ok: false, error: "Base non configurée." };
  const { error } = await sb.from("DispSalarie").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}

// — Factures en retard —
export async function chargerFactures(code: string): Promise<R & { factures?: FactureRow[] }> {
  const g = okChef(code); if (!g.ok) return g;
  const sb = db(); if (!sb) return { ok: false, error: "Base non configurée." };
  const { data } = await sb.from("DispFacture").select("*").order("paye", { ascending: true }).order("echeance", { ascending: true });
  const factures = ((data as Record<string, unknown>[]) || []).map((r) => ({
    id: String(r.id), patient: String(r.patient || "—"), montant: num(r.montant), motif: r.motif == null ? null : String(r.motif),
    echeance: r.echeance == null ? null : String(r.echeance), paye: r.paye === true, createdAt: String(r.createdAt || ""),
  }));
  return { ok: true, factures };
}
export async function ajouterFacture(code: string, p: { patient: string; montant: number; motif?: string; echeance?: string }): Promise<R> {
  const g = okChef(code); if (!g.ok) return g;
  const patient = str(p.patient, 120);
  if (patient.length < 2) return { ok: false, error: "Nom du patient requis." };
  const sb = db(); if (!sb) return { ok: false, error: "Base non configurée." };
  return insertR(sb, "DispFacture", { id: newId("fac"), patient, montant: Math.max(0, num(p.montant)), motif: str(p.motif, 200) || null, echeance: str(p.echeance, 20) || null, paye: false, createdAt: new Date().toISOString() });
}
export async function marquerPayee(code: string, id: string, paye: boolean): Promise<R> {
  const g = okChef(code); if (!g.ok) return g;
  const sb = db(); if (!sb) return { ok: false, error: "Base non configurée." };
  const { error } = await sb.from("DispFacture").update({ paye: !!paye, payeAt: paye ? new Date().toISOString() : null }).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}
export async function supprimerFacture(code: string, id: string): Promise<R> {
  const g = okChef(code); if (!g.ok) return g;
  const sb = db(); if (!sb) return { ok: false, error: "Base non configurée." };
  const { error } = await sb.from("DispFacture").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}
