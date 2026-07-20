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

export async function definirStock(stockId: string, quantite: number, auteur: string): Promise<R> {
  const q = Math.max(0, Math.round(num(quantite)));
  const sb = db(); if (!sb) return { ok: false, error: "Base non configurée." };
  const { data } = await sb.from("DispStock").select("nom,quantite").eq("id", stockId).maybeSingle();
  if (!data) return { ok: false, error: "Article introuvable." };
  const avant = num((data as { quantite: number }).quantite);
  if (avant === q) return { ok: true };
  await sb.from("DispStock").update({ quantite: q }).eq("id", stockId);
  await insertR(sb, "DispMouvement", { id: newId("mvt"), stockId, stockNom: String((data as { nom: string }).nom || ""), delta: q - avant, quantiteApres: q, auteur: str(auteur, 120) || "—", motif: "correction manuelle", createdAt: new Date().toISOString() });
  return { ok: true };
}

// ═══ Lecture d'une photo d'inventaire par l'IA ═══════════════════
async function _vision(base64: string, mediaType: string, system: string, userText: string, maxTokens = 900): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("no-key");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-5", max_tokens: maxTokens, system,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
        { type: "text", text: userText },
      ] }],
    }),
  });
  if (!res.ok) throw new Error("api-" + res.status);
  const j = await res.json();
  return String((((j as { content?: { text?: string }[] }).content) || []).map((c) => c.text || "").join(""));
}

export async function lireStockPhoto(base64: string, mediaType: string): Promise<{ ok: boolean; error?: string; items?: { nom: string; quantite: number }[] }> {
  if (!base64) return { ok: false, error: "Photo manquante." };
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "Lecture par photo non configurée — ajoute la variable ANTHROPIC_API_KEY sur Vercel." };
  const system = 'Tu lis une photo d\'inventaire (coffre de jeu ou panneau web). Tu renvoies UNIQUEMENT un tableau JSON d\'objets {"nom":string,"quantite":number} : un par article visible avec sa quantité en stock. Ignore prix, coûts, poids (kg) et recettes. « x123 » ou « Stock : 123 » signifie quantité 123. Aucune autre sortie que le JSON.';
  let txt = "";
  try { txt = await _vision(base64, mediaType, system, "Liste en JSON les articles et leurs quantités visibles sur cette photo.", 1100); }
  catch (e) { const m = String((e as Error).message || ""); return { ok: false, error: m.startsWith("api-") ? "L'IA a refusé la lecture (" + m + ")." : "Lecture impossible." }; }
  const match = /\[[\s\S]*\]/.exec(txt);
  let arr: unknown = [];
  try { arr = JSON.parse(match ? match[0] : txt); } catch { return { ok: false, error: "Lecture illisible — réessaie avec une photo plus nette." }; }
  const items = (Array.isArray(arr) ? arr : []).map((x) => { const o = x as Record<string, unknown>; return { nom: str(o.nom, 120), quantite: Math.max(0, Math.round(num(o.quantite))) }; }).filter((i) => i.nom.length > 0);
  if (!items.length) return { ok: false, error: "Aucun article détecté sur la photo." };
  return { ok: true, items };
}

const _STOP = new Set(["de", "du", "la", "le", "les", "des", "d", "l", "un", "une", "a", "en"]);
const _norm = (v: string) => v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ");
const _toks = (v: string) => _norm(v).split(/\s+/).filter((w) => w && !_STOP.has(w));
function _match(nom: string, rows: { id: string; nom: string }[]): { id: string; nom: string } | null {
  const a = _toks(nom); if (!a.length) return null;
  let best: { id: string; nom: string } | null = null, bestScore = 0;
  for (const r of rows) { const b = _toks(r.nom); if (!b.length) continue; const inter = a.filter((w) => b.includes(w)).length; const score = inter / Math.max(a.length, b.length); if (score > bestScore) { bestScore = score; best = r; } }
  return bestScore >= 0.5 ? best : null;
}

export async function appliquerScanStock(items: { nom: string; quantite: number }[], mode: "add" | "set", auteur: string): Promise<{ ok: boolean; error?: string; appliques?: number; crees?: number }> {
  const sb = db(); if (!sb) return { ok: false, error: "Base non configurée." };
  const list = (items || []).map((i) => ({ nom: str(i.nom, 120), quantite: Math.max(0, Math.round(num(i.quantite))) })).filter((i) => i.nom);
  if (!list.length) return { ok: false, error: "Rien à appliquer." };
  const { data } = await sb.from("DispStock").select("id,nom,quantite");
  const rows = ((data as Record<string, unknown>[]) || []).map((r) => ({ id: String(r.id), nom: String(r.nom || ""), quantite: num(r.quantite) }));
  let appliques = 0, crees = 0;
  const qui = str(auteur, 120) || "scan";
  for (const it of list) {
    const m = _match(it.nom, rows);
    if (m) {
      const ref = rows.find((r) => r.id === m.id)!;
      const apres = Math.max(0, mode === "add" ? ref.quantite + it.quantite : it.quantite);
      await sb.from("DispStock").update({ quantite: apres }).eq("id", m.id);
      await insertR(sb, "DispMouvement", { id: newId("mvt"), stockId: m.id, stockNom: m.nom, delta: apres - ref.quantite, quantiteApres: apres, auteur: qui, motif: "scan photo", createdAt: new Date().toISOString() });
      ref.quantite = apres; appliques++;
    } else {
      const id = newId("stk");
      await insertR(sb, "DispStock", { id, nom: it.nom, categorie: "Matière", quantite: it.quantite, seuil: 0, createdAt: new Date().toISOString() });
      await insertR(sb, "DispMouvement", { id: newId("mvt"), stockId: id, stockNom: it.nom, delta: it.quantite, quantiteApres: it.quantite, auteur: qui, motif: "scan photo (nouvel article)", createdAt: new Date().toISOString() });
      rows.push({ id, nom: it.nom, quantite: it.quantite }); crees++;
    }
  }
  return { ok: true, appliques, crees };
}

// ═══ Lecture d'une carte d'identité par l'IA ═════════════════════
export async function lireCartePhoto(base64: string, mediaType: string): Promise<{ ok: boolean; error?: string; fiche?: { prenom: string; nom: string; dateNaissance: string; sexe: string; nationalite: string; numero: string } }> {
  if (!base64) return { ok: false, error: "Photo manquante." };
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "Lecture par photo non configurée — ajoute la variable ANTHROPIC_API_KEY sur Vercel." };
  const system = 'Tu lis une carte d\'identité (univers western / jeu de rôle). Renvoie UNIQUEMENT un objet JSON {"prenom":string,"nom":string,"dateNaissance":string,"sexe":string,"nationalite":string,"numero":string}. Recopie fidèlement le texte lu. Mets une chaîne vide "" pour tout champ absent ou illisible. Aucune autre sortie que le JSON.';
  let txt = "";
  try { txt = await _vision(base64, mediaType, system, "Lis cette carte d'identité et renvoie les informations en JSON.", 500); }
  catch (e) { const m = String((e as Error).message || ""); return { ok: false, error: m.startsWith("api-") ? "L'IA a refusé la lecture (" + m + ")." : "Lecture impossible." }; }
  const match = /\{[\s\S]*\}/.exec(txt);
  let o: Record<string, unknown> = {};
  try { o = JSON.parse(match ? match[0] : txt) as Record<string, unknown>; } catch { return { ok: false, error: "Carte illisible — réessaie avec une photo plus nette." }; }
  const fiche = { prenom: str(o.prenom, 80), nom: str(o.nom, 80), dateNaissance: str(o.dateNaissance, 40), sexe: str(o.sexe, 20), nationalite: str(o.nationalite, 60), numero: str(o.numero, 40) };
  if (!fiche.prenom && !fiche.nom && !fiche.numero) return { ok: false, error: "Aucune information détectée sur la carte." };
  return { ok: true, fiche };
}

// ═══ Fiches patients ═════════════════════════════════════════════
type PatientIn = { prenom?: string; nom?: string; dateNaissance?: string; sexe?: string; nationalite?: string; numero?: string; telegramme?: string; groupeSanguin?: string; allergies?: string; notes?: string };
function patientRow(p: PatientIn): Record<string, unknown> {
  return {
    prenom: str(p.prenom, 80) || null, nom: str(p.nom, 80) || null, dateNaissance: str(p.dateNaissance, 40) || null,
    sexe: str(p.sexe, 20) || null, nationalite: str(p.nationalite, 60) || null, numero: str(p.numero, 40) || null,
    telegramme: str(p.telegramme, 60) || null, groupeSanguin: str(p.groupeSanguin, 12) || null,
    allergies: str(p.allergies, 400) || null, notes: str(p.notes, 800) || null,
  };
}
export async function ajouterPatient(p: PatientIn): Promise<R> {
  if (!str(p.prenom, 80) && !str(p.nom, 80)) return { ok: false, error: "Indique au moins un nom ou prénom." };
  const sb = db(); if (!sb) return { ok: false, error: "Base non configurée." };
  return insertR(sb, "DispPatient", { id: newId("pat"), ...patientRow(p), createdAt: new Date().toISOString() });
}
export async function majPatient(id: string, p: PatientIn): Promise<R> {
  const sb = db(); if (!sb) return { ok: false, error: "Base non configurée." };
  const { error } = await sb.from("DispPatient").update(patientRow(p)).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}
export async function supprimerPatient(id: string): Promise<R> {
  const sb = db(); if (!sb) return { ok: false, error: "Base non configurée." };
  const { error } = await sb.from("DispPatient").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}

// Dossier d'un patient : certificats émis + bandages (semaine / total). Non protégé.
export type DossierCertif = { id: string; type: string | null; dateActe: string | null; diagnostic: string | null; praticien: string | null };
export async function getDossierPatient(nom: string): Promise<{ ok: boolean; certificats?: DossierCertif[]; bandagesSemaine?: number; bandagesTotal?: number }> {
  const n = str(nom, 120); if (n.length < 2) return { ok: false };
  const sb = db(); if (!sb) return { ok: false };
  const [certs, bAll, bWeek] = await Promise.all([
    sb.from("DispCertificat").select("id,type,dateActe,diagnostic,praticien,createdAt").ilike("patient", n).order("createdAt", { ascending: false }).limit(20),
    sb.from("DispVenteBandage").select("quantite").ilike("patient", n),
    sb.from("DispVenteBandage").select("quantite").ilike("patient", n).gte("createdAt", debutSemaine().toISOString()),
  ]);
  const sum = (rows: unknown) => ((rows as { quantite?: unknown }[]) || []).reduce((a, r) => a + num(r.quantite), 0);
  const certificats = ((certs.data as Record<string, unknown>[]) || []).map((r) => ({ id: String(r.id), type: r.type == null ? null : String(r.type), dateActe: r.dateActe == null ? null : String(r.dateActe), diagnostic: r.diagnostic == null ? null : String(r.diagnostic), praticien: r.praticien == null ? null : String(r.praticien) }));
  return { ok: true, certificats, bandagesSemaine: sum(bWeek.data), bandagesTotal: sum(bAll.data) };
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
