"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { envoyerCommande } from "@/lib/commandes";
import { round2 } from "@/lib/format";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

async function auteurNom(): Promise<string> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "Comptoir";
    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    let nom = (meta.full_name || meta.name || meta.user_name || "Membre") as string;
    const discordId = (meta.provider_id || meta.sub || "") as string;
    const admin = createAdminClient();
    if (discordId && admin) { const { data } = await admin.from("Membre").select("nomIC").eq("id", String(discordId)).maybeSingle(); if (data?.nomIC) nom = data.nomIC as string; }
    return String(nom).slice(0, 120);
  } catch { return "Comptoir"; }
}

// Crédite (entree) ou débite (sortie) le coffre PROPRE de l'armurerie + journal.
// Remonte les erreurs d'écriture (table manquante, RLS…) au lieu de les avaler,
// pour ne plus jamais afficher un « succès » alors que rien n'a bougé.
// nature : ventilation comptable d'une SORTIE — "produit" (achat qui entre en
// stock : armes, matières, ressources) ou "charge" (frais : paies, impôts…).
// Nul pour les recettes. Écriture résiliente : si la colonne « nature » n'existe
// pas encore (migration SQL non appliquée), on réinsère sans — rien ne casse.
async function _mouvementCoffre(admin: Admin, montant: number, sens: "entree" | "sortie", motif: string, auteur: string, nature?: "produit" | "charge" | null) {
  const m = Math.abs(round2(Number(montant) || 0));
  if (!m) return;
  const nat = sens === "sortie" && (nature === "produit" || nature === "charge") ? nature : null;
  const id = newId("mvt");
  // Voie ATOMIQUE : une fonction SQL met à jour le solde ET journalise en une seule
  // transaction (pas de course entre deux mouvements simultanés).
  const rpc = await admin.rpc("armurerie_coffre_mouvement", { p_id: id, p_montant: m, p_sens: sens, p_motif: s(motif, 200), p_auteur: s(auteur, 120), p_nature: nat });
  if (!rpc.error) return;
  // Fonction non installée (migration SQL pas encore passée) → repli lecture/écriture.
  const absente = rpc.error.code === "PGRST202" || /schema cache|not find|does not exist/i.test(rpc.error.message || "");
  if (!absente) throw new Error(rpc.error.message);
  const { data, error: eLire } = await admin.from("ArmurerieCoffre").select("solde").eq("id", "vanhorn").maybeSingle();
  if (eLire) throw new Error(eLire.message);
  const actuel = data ? Number((data as { solde: number }).solde) || 0 : 0;
  const nouveau = Math.max(0, sens === "sortie" ? actuel - m : actuel + m);
  const { error: eUp } = await admin.from("ArmurerieCoffre").upsert({ id: "vanhorn", solde: nouveau, updatedAt: new Date().toISOString() }, { onConflict: "id" });
  if (eUp) throw new Error(eUp.message);
  const base: Record<string, unknown> = { id, sens, montant: m, motif: s(motif, 200), auteur: s(auteur, 120), createdAt: new Date().toISOString() };
  const avecNat: Record<string, unknown> = nat ? { ...base, nature: nat } : base;
  let ins = await admin.from("ArmurerieMouvementCoffre").insert(avecNat);
  if (ins.error && nat && /nature/i.test(ins.error.message)) ins = await admin.from("ArmurerieMouvementCoffre").insert(base);
  if (ins.error) throw new Error(ins.error.message);
}

// Comptoir de l'armurerie de Van Horn — registre PRIVÉ de l'entreprise, écrit
// directement dans Supabase (tables neuves, jamais touchées par le bot). Seul
// l'envoi d'un contrat au client passe par le bot (message privé Discord).

export type ArmResult = { ok: boolean; error?: string; id?: string };

function s(v: unknown, max = 300): string | null { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; }
function newId(prefix: string) { return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

// ── Clients ──────────────────────────────────────────────────────
export async function creerClient(d: { nom: string; telegramme?: string; discordId?: string; carteIdentite?: string; statut?: string; notes?: string }): Promise<ArmResult> {
  if (!d.nom || d.nom.trim().length < 2) return { ok: false, error: "Indique le nom du client." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const id = newId("cli");
  const { error } = await admin.from("ArmurerieClient").insert({
    id, nom: s(d.nom, 120), telegramme: s(d.telegramme, 60), discordId: s(d.discordId, 40),
    carteIdentite: s(d.carteIdentite, 500), statut: s(d.statut, 40) || "actif", notes: s(d.notes, 2000),
  });
  if (error) return { ok: false, error: tableErr(error.message, "clients") };
  return { ok: true, id };
}
export async function majClient(id: string, patch: Record<string, unknown>): Promise<ArmResult> {
  if (!id) return { ok: false, error: "Client introuvable." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const up: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const k of ["nom", "telegramme", "discordId", "carteIdentite", "statut", "notes"]) if (k in patch) up[k] = s(patch[k], 2000);
  const { error } = await admin.from("ArmurerieClient").update(up).eq("id", id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  return { ok: true };
}
export async function supprimerClient(id: string): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { error } = await admin.from("ArmurerieClient").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}

// ── Ventes (registre officiel — Décret N°2) ──────────────────────
export async function creerVente(d: { clientId?: string; acquereur: string; dateVente?: string; marque?: string; modele?: string; categorie?: string; numeroSerie?: string; vendeur?: string; telegramme?: string; prix?: number; quantite?: number; prixUnitaire?: number; notes?: string; photo?: string }): Promise<ArmResult> {
  if (!d.acquereur || d.acquereur.trim().length < 2) return { ok: false, error: "Nom de l'acquéreur requis (Décret N°2)." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const id = newId("vte");
  const qte = Math.max(1, Math.round(Number(d.quantite) || 1));
  const pu = d.prixUnitaire != null ? Math.max(0, round2(Number(d.prixUnitaire) || 0)) : null;
  const total = pu != null ? round2(pu * qte) : Math.max(0, round2(Number(d.prix) || 0));
  const row: Record<string, unknown> = {
    id, clientId: s(d.clientId, 60), acquereur: s(d.acquereur, 120),
    dateVente: s(d.dateVente, 40) || new Date().toLocaleDateString("fr-FR"),
    marque: s(d.marque, 80), modele: s(d.modele, 80), categorie: s(d.categorie, 60),
    numeroSerie: s(d.numeroSerie, 80) || null, vendeur: s(d.vendeur, 120), telegramme: s(d.telegramme, 60),
    quantite: qte, prixUnitaire: pu != null ? pu : (qte ? round2(total / qte) : total),
    prix: total, notes: s(d.notes, 1000), statut: "enregistree",
  };
  if (d.photo) row.photo = s(d.photo, 600);
  let ins = await admin.from("ArmurerieVente").insert(row);
  for (let i = 0; i < 3 && ins.error && /photo|quantite|prixUnitaire/i.test(ins.error.message); i++) {
    const m = ins.error.message;
    if (/photo/i.test(m)) delete row.photo; else if (/quantite/i.test(m)) delete row.quantite; else if (/prixUnitaire/i.test(m)) delete row.prixUnitaire;
    ins = await admin.from("ArmurerieVente").insert(row);
  }
  if (ins.error) return { ok: false, error: tableErr(ins.error.message, "ventes") };
  // Crédite automatiquement le coffre de l'armurerie du montant de la vente.
  const prix = total;
  if (prix > 0) {
    const arme = [s(d.marque, 80), s(d.modele, 80)].filter(Boolean).join(" ") || "arme";
    try { await _mouvementCoffre(admin, prix, "entree", `Vente — ${arme} à ${s(d.acquereur, 120)}`, s(d.vendeur, 120) || (await auteurNom())); } catch {}
  }
  return { ok: true, id };
}

// Dépôt / retrait manuel sur le coffre de l'armurerie.
export async function ajusterCoffreArmurerie(montant: number, mode: "depot" | "retrait", motif: string): Promise<ArmResult> {
  const m = Math.abs(round2(Number(montant) || 0));
  if (m <= 0) return { ok: false, error: "Montant invalide." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  try {
    await _mouvementCoffre(admin, m, mode === "retrait" ? "sortie" : "entree", s(motif, 200) || (mode === "retrait" ? "Retrait" : "Dépôt"), await auteurNom());
    return { ok: true };
  } catch (e) {
    const msg = (e as Error).message || "";
    if (/ArmurerieCoffre|does not exist|relation/i.test(msg)) return { ok: false, error: "La table du coffre n'est pas encore créée — exécute le SQL de l'armurerie." };
    return { ok: false, error: "Enregistrement impossible pour le moment." };
  }
}
export async function majVente(id: string, patch: Record<string, unknown>): Promise<ArmResult> {
  if (!id) return { ok: false, error: "Vente introuvable." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const up: Record<string, unknown> = {};
  for (const k of ["acquereur", "dateVente", "marque", "modele", "categorie", "numeroSerie", "vendeur", "telegramme", "notes", "statut", "clientId"]) if (k in patch) up[k] = s(patch[k], 1000);
  if ("quantite" in patch) up.quantite = Math.max(1, Math.round(Number(patch.quantite) || 1));
  if ("prixUnitaire" in patch) up.prixUnitaire = Math.max(0, round2(Number(patch.prixUnitaire) || 0));
  // Total = PU × quantité si l'un des deux est fourni ; sinon prix explicite.
  if ("prixUnitaire" in patch || "quantite" in patch) {
    const pu = Number((up.prixUnitaire ?? patch.prixUnitaire) as number) || 0;
    const qt = Number((up.quantite ?? patch.quantite) as number) || 1;
    up.prix = Math.max(0, round2(pu * qt));
  } else if ("prix" in patch) up.prix = Math.max(0, round2(Number(patch.prix) || 0));
  if ("photo" in patch) up.photo = patch.photo ? s(patch.photo, 600) : null;
  let res = await admin.from("ArmurerieVente").update(up).eq("id", id);
  for (let i = 0; i < 3 && res.error && /photo|quantite|prixUnitaire/i.test(res.error.message); i++) {
    const m = res.error.message;
    if (/photo/i.test(m)) delete up.photo; else if (/quantite/i.test(m)) delete up.quantite; else if (/prixUnitaire/i.test(m)) delete up.prixUnitaire;
    res = await admin.from("ArmurerieVente").update(up).eq("id", id);
  }
  return res.error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}
export async function supprimerVente(id: string): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { error } = await admin.from("ArmurerieVente").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}

// ── Contrats de vente ────────────────────────────────────────────
export async function creerContrat(d: { clientId?: string; clientNom: string; clientDiscordId?: string; arme?: string; numeroSerie?: string; prix?: number; conditions?: string }): Promise<ArmResult> {
  if (!d.clientNom || d.clientNom.trim().length < 2) return { ok: false, error: "Indique le nom du client." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const id = newId("ctr");
  const { error } = await admin.from("ArmurerieContrat").insert({
    id, clientId: s(d.clientId, 60), clientNom: s(d.clientNom, 120), clientDiscordId: s(d.clientDiscordId, 40),
    arme: s(d.arme, 120), numeroSerie: s(d.numeroSerie, 80), prix: Math.max(0, round2(Number(d.prix) || 0)),
    conditions: s(d.conditions, 2000), statut: "brouillon",
  });
  if (error) return { ok: false, error: tableErr(error.message, "contrats") };
  return { ok: true, id };
}

// Envoie le contrat au client par message privé Discord (via le bot) et le marque « envoyé ».
export async function envoyerContrat(id: string): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { data, error } = await admin.from("ArmurerieContrat").select("*").eq("id", id).maybeSingle();
  if (error || !data) return { ok: false, error: "Contrat introuvable." };
  if (!data.clientDiscordId) return { ok: false, error: "Renseigne l'ID Discord du client pour l'envoi." };
  const cmd = await envoyerCommande("armurerie.contrat", {
    contratId: id, clientDiscordId: data.clientDiscordId, clientNom: data.clientNom,
    arme: data.arme, numeroSerie: data.numeroSerie, prix: data.prix, conditions: data.conditions,
  });
  if (!cmd.ok) return { ok: false, error: cmd.error };
  await admin.from("ArmurerieContrat").update({ statut: "envoye", envoyeAt: new Date().toISOString() }).eq("id", id);
  return { ok: true };
}
export async function marquerContrat(id: string, statut: "signe" | "refuse" | "brouillon"): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const up: Record<string, unknown> = { statut };
  if (statut === "signe") up.signeAt = new Date().toISOString();
  const { error } = await admin.from("ArmurerieContrat").update(up).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}
export async function supprimerContrat(id: string): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { error } = await admin.from("ArmurerieContrat").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}
// Honorer un contrat signé → l'inscrit comme VENTE (registre + facture + coffre +
// compta + impôts + décompte des ressources) et marque le contrat « honoré ».
export async function honorerContrat(id: string): Promise<ArmResult & { total?: number; ticket?: string }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { data, error } = await admin.from("ArmurerieContrat").select("*").eq("id", id).maybeSingle();
  if (error || !data) return { ok: false, error: "Contrat introuvable." };
  const c = data as Record<string, unknown>;
  if (c.statut === "honore") return { ok: false, error: "Contrat déjà honoré." };
  const arme = String(c.arme || "").trim() || "Arme";
  // Associer l'arme à un produit du catalogue (pour décompter stock & ressources).
  let produitId: string | undefined, categorie: string | undefined, aLaDemande = false;
  try {
    const { data: prods } = await admin.from("ArmurerieProduit").select("id,nom,categorie,aLaDemande");
    const rs = ((prods || []) as { id: string; nom: string }[]).map((p) => ({ id: String(p.id), nom: String(p.nom) }));
    const m = _matchRes(arme, rs);
    if (m) { const full = (prods as { id: string; categorie?: string; aLaDemande?: boolean }[]).find((p) => String(p.id) === m.id); if (full) { produitId = full.id; categorie = full.categorie; aLaDemande = !!full.aLaDemande; } }
  } catch { /* le produit n'a pas pu être associé — vente en texte libre */ }
  const ligne: LigneCaisse = { produitId, nom: arme, categorie, prix: Math.max(0, round2(Number(c.prix) || 0)), qte: 1, aLaDemande };
  const res = await validerCaisse([ligne], c.clientId ? "" : String(c.clientNom || ""), `Contrat honoré${c.conditions ? " — " + String(c.conditions) : ""}`.slice(0, 1000), (c.clientId as string) || undefined, { serie: (c.numeroSerie as string) || undefined });
  if (!res.ok) return res;
  await admin.from("ArmurerieContrat").update({ statut: "honore" }).eq("id", id);
  return { ok: true, total: res.total, ticket: res.ticket };
}

function tableErr(msg: string, quoi: string): string {
  if (/does not exist|relation|Armurerie/i.test(msg)) return `La table des ${quoi} n'est pas encore créée — exécute armurerie-vh.sql dans Supabase.`;
  return "Enregistrement impossible pour le moment.";
}

// ── Produits (catalogue de la Caisse) ────────────────────────────
type LigneRecette = { ingredient: string; qte: number };
function _nettoyerRecette(recette: unknown): LigneRecette[] {
  const arr = Array.isArray(recette) ? recette : [];
  const out: LigneRecette[] = [];
  for (const l of arr) {
    const o = (l || {}) as Record<string, unknown>;
    const ingredient = String(o.ingredient ?? "").trim().slice(0, 80);
    const qte = Math.max(0, Math.round(Number(o.qte) || 0));
    if (ingredient && qte) out.push({ ingredient, qte });
  }
  return out;
}
export async function creerProduit(d: { nom: string; categorie?: string; prix?: number; cout?: number; stock?: number; aLaDemande?: boolean; niveau?: number; recette?: LigneRecette[] }): Promise<ArmResult> {
  if (!d.nom || d.nom.trim().length < 1) return { ok: false, error: "Nom du produit requis." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const id = newId("prd");
  const row: Record<string, unknown> = {
    id, nom: s(d.nom, 120), categorie: s(d.categorie, 60) || "Divers",
    prix: Math.max(0, round2(Number(d.prix) || 0)), cout: Math.max(0, round2(Number(d.cout) || 0)),
    stock: Math.max(0, Math.round(Number(d.stock) || 0)), aLaDemande: !!d.aLaDemande,
    niveau: Math.max(0, Math.min(3, Math.round(Number(d.niveau) || 0))), recette: _nettoyerRecette(d.recette),
  };
  let { error } = await admin.from("ArmurerieProduit").insert(row);
  // Colonne « recette » pas encore migrée ? on réinsère sans — le produit se crée quand même.
  if (error && /recette/i.test(error.message)) { delete row.recette; ({ error } = await admin.from("ArmurerieProduit").insert(row)); }
  if (error) return { ok: false, error: tableErr(error.message, "produits") };
  return { ok: true, id };
}
export async function majProduit(id: string, patch: Record<string, unknown>): Promise<ArmResult> {
  if (!id) return { ok: false, error: "Produit introuvable." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const up: Record<string, unknown> = {};
  if ("nom" in patch) up.nom = s(patch.nom, 120);
  if ("categorie" in patch) up.categorie = s(patch.categorie, 60);
  if ("prix" in patch) up.prix = Math.max(0, round2(Number(patch.prix) || 0));
  if ("cout" in patch) up.cout = Math.max(0, round2(Number(patch.cout) || 0));
  if ("stock" in patch) up.stock = Math.max(0, Math.round(Number(patch.stock) || 0));
  if ("aLaDemande" in patch) up.aLaDemande = !!patch.aLaDemande;
  if ("niveau" in patch) up.niveau = Math.max(0, Math.min(3, Math.round(Number(patch.niveau) || 0)));
  if ("recette" in patch) up.recette = _nettoyerRecette(patch.recette);
  let { error } = await admin.from("ArmurerieProduit").update(up).eq("id", id);
  if (error && "recette" in up && /recette/i.test(error.message)) { delete up.recette; ({ error } = await admin.from("ArmurerieProduit").update(up).eq("id", id)); }
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}
export async function supprimerProduit(id: string): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { error } = await admin.from("ArmurerieProduit").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}

// Stock officiel de l'armurerie, catégorisé (Armes / Accessoires / Munitions /
// Composants / Ressources). Prix de vente/base connus ; 0 = à renseigner.
const CATALOGUE: { nom: string; cat: string; prix: number; niveau?: number }[] = [
  // ── ARMES ──
  { nom: "Couteau de lancé", cat: "Armes", prix: 4, niveau: 0 },
  { nom: "Couteau", cat: "Armes", prix: 5, niveau: 0 },
  { nom: "Machette", cat: "Armes", prix: 0, niveau: 0 },
  { nom: "Hachette", cat: "Armes", prix: 6, niveau: 0 },
  { nom: "Hachette de chasseur", cat: "Armes", prix: 4, niveau: 0 },
  { nom: "Arc", cat: "Armes", prix: 10, niveau: 0 },
  { nom: "Revolver Cattleman", cat: "Armes", prix: 17, niveau: 0 },
  { nom: "Revolver Cattleman Mexican", cat: "Armes", prix: 20, niveau: 1 },
  { nom: "Revolver Double Action", cat: "Armes", prix: 20, niveau: 0 },
  { nom: "Revolver Schofield", cat: "Armes", prix: 50, niveau: 1 },
  { nom: "Revolver Navy", cat: "Armes", prix: 80, niveau: 1 },
  { nom: "Navy Crossover", cat: "Armes", prix: 0, niveau: 0 },
  { nom: "Revolver LeMat", cat: "Armes", prix: 90, niveau: 2 },
  { nom: "Pistolet Volcanic", cat: "Armes", prix: 60, niveau: 1 },
  { nom: "Pistolet semi-automatique", cat: "Armes", prix: 70, niveau: 2 },
  { nom: "Pistolet Mauser", cat: "Armes", prix: 75, niveau: 1 },
  { nom: "Pistolet 1899", cat: "Armes", prix: 85, niveau: 2 },
  { nom: "Canon scié", cat: "Armes", prix: 70, niveau: 3 },
  { nom: "Carabine à répétition", cat: "Armes", prix: 50, niveau: 2 },
  { nom: "Carabine Litchfield", cat: "Armes", prix: 130, niveau: 2 },
  { nom: "Carabine Evans", cat: "Armes", prix: 140, niveau: 2 },
  { nom: "Carabine Lancaster", cat: "Armes", prix: 150, niveau: 2 },
  { nom: "Fusil à petit gibier", cat: "Armes", prix: 50, niveau: 0 },
  { nom: "Fusil double canon", cat: "Armes", prix: 200, niveau: 2 },
  { nom: "Fusil à répétition", cat: "Armes", prix: 215, niveau: 2 },
  { nom: "Fusil springfield", cat: "Armes", prix: 230, niveau: 3 },
  { nom: "Fusil semi-automatique", cat: "Armes", prix: 250, niveau: 1 },
  { nom: "Fusil à pompe", cat: "Armes", prix: 275, niveau: 2 },
  { nom: "Fusil à verrou", cat: "Armes", prix: 300, niveau: 3 },
  // ── ACCESSOIRES ──
  { nom: "Ceinture de couteau de lancé", cat: "Accessoires", prix: 10, niveau: 0 },
  { nom: "Ceinture pour hachette", cat: "Accessoires", prix: 8, niveau: 0 },
  { nom: "Ceinture pour hachette de chasseur", cat: "Accessoires", prix: 10, niveau: 0 },
  { nom: "Menottes", cat: "Accessoires", prix: 3, niveau: 0 },
  { nom: "Jumelles", cat: "Accessoires", prix: 5, niveau: 0 },
  { nom: "Jumelles amélioré", cat: "Accessoires", prix: 10, niveau: 1 },
  { nom: "Caméra", cat: "Accessoires", prix: 0, niveau: 0 },
  { nom: "Caméra amélioré", cat: "Accessoires", prix: 0, niveau: 1 },
  { nom: "Lasso", cat: "Accessoires", prix: 5, niveau: 0 },
  { nom: "Lasso amélioré", cat: "Accessoires", prix: 10, niveau: 1 },
  { nom: "Lanterne", cat: "Accessoires", prix: 5, niveau: 0 },
  // ── MUNITIONS ──
  { nom: "Boîte de munitions de Carabine", cat: "Munitions", prix: 5, niveau: 0 },
  { nom: "Boîte de munitions de Fusil", cat: "Munitions", prix: 5, niveau: 0 },
  { nom: "Boîte de munitions de Pistolet", cat: "Munitions", prix: 5, niveau: 0 },
  { nom: "Boîte de munitions de Pompe", cat: "Munitions", prix: 5, niveau: 0 },
  { nom: "Boîte de munitions de Revolver", cat: "Munitions", prix: 5, niveau: 0 },
  { nom: "Boîte de munitions de petit gibier", cat: "Munitions", prix: 5, niveau: 0 },
  { nom: "Flèches", cat: "Munitions", prix: 0, niveau: 0 },
  // ── COMPOSANTS ──
  { nom: "Laiton", cat: "Composants", prix: 3.52, niveau: 0 },
  { nom: "Composants d'armes", cat: "Composants", prix: 0, niveau: 0 },
  { nom: "Pièce d'arme", cat: "Composants", prix: 0, niveau: 0 },
  { nom: "Poudre", cat: "Composants", prix: 0, niveau: 0 },
  // ── RESSOURCES ──
  { nom: "Lingot de fer", cat: "Ressources", prix: 0, niveau: 0 },
  { nom: "Lingot de cuivre", cat: "Ressources", prix: 0, niveau: 0 },
  { nom: "Lingot de zinc", cat: "Ressources", prix: 0, niveau: 0 },
  { nom: "Plomb", cat: "Ressources", prix: 0, niveau: 0 },
  { nom: "Soufre", cat: "Ressources", prix: 0, niveau: 0 },
  { nom: "Charbon", cat: "Ressources", prix: 0.11, niveau: 0 },
  { nom: "Bois", cat: "Ressources", prix: 0.22, niveau: 0 },
  { nom: "Bois amélioré", cat: "Ressources", prix: 2, niveau: 0 },
  { nom: "Pièce de bois", cat: "Ressources", prix: 0, niveau: 0 },
  { nom: "Verre", cat: "Ressources", prix: 0, niveau: 0 },
  { nom: "Corde", cat: "Ressources", prix: 0.48, niveau: 0 },
  { nom: "Cuir", cat: "Ressources", prix: 0, niveau: 0 },
];
// Ajoute les produits ABSENTS (par nom normalisé) ET recatégorise ceux qui
// existent déjà selon le catalogue canonique (catégorie SEULE — prix/stock/recette
// intacts). Re-cliquable sans doublon.
export async function importerCatalogue(): Promise<ArmResult & { n?: number; recat?: number }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { data: existants } = await admin.from("ArmurerieProduit").select("id,nom,categorie");
  const parNom = new Map((existants || []).map((p) => [_norm(String((p as { nom: string }).nom)), p as { id: string; nom: string; categorie: string }]));
  // 1) recatégoriser l'existant
  let recat = 0;
  for (const c of CATALOGUE) {
    const ex = parNom.get(_norm(c.nom));
    if (ex && ex.categorie !== c.cat) { const { error } = await admin.from("ArmurerieProduit").update({ categorie: c.cat }).eq("id", ex.id); if (!error) recat++; }
  }
  // 2) ajouter les manquants
  const manquants = CATALOGUE.filter((p) => !parNom.has(_norm(p.nom)));
  if (manquants.length) {
    const rows = manquants.map((p) => ({ id: newId("prd"), nom: p.nom, categorie: p.cat, prix: round2(p.prix), cout: 0, stock: 0, aLaDemande: false, niveau: p.niveau || 0 }));
    const { error } = await admin.from("ArmurerieProduit").insert(rows);
    if (error) return { ok: false, error: tableErr(error.message, "produits") };
  }
  return { ok: true, n: manquants.length, recat };
}

// ── Recettes de craft (ingrédients requis par arme/objet) ────────
// Noms d'ingrédients canoniques : Bois, Pièce d'arme, Charbon, Lingot fer,
// Lingot zinc, Verre, Cordes. [nom produit, [[ingrédient, quantité], …]]
const RECETTES: [string, [string, number][]][] = [
  // ── Intermédiaires & matières ──
  ["Pièce d'arme", [["Bois", 3], ["Lingot fer", 4], ["Lingot zinc", 4]]],
  ["Laiton", [["Lingot fer", 1], ["Lingot zinc", 1]]],
  // ── Munitions ──
  ["Boîte de munitions de Pistolet", [["Lingot fer", 1], ["Poudre", 1]]],
  ["Boîte de munitions de Revolver", [["Lingot plomb", 1], ["Poudre", 1]]],
  ["Boîte de munitions de Carabine", [["Lingot plomb", 1], ["Poudre", 1]]],
  ["Boîte de munitions de Fusil", [["Lingot plomb", 1], ["Poudre", 1]]],
  ["Boîte de munitions de Pompe", [["Lingot plomb", 1], ["Poudre", 1]]],
  // ── Outils & objets ──
  ["Ceinture Couteau de lancé", [["Bois", 5], ["Lingot fer", 3]]],
  ["Couteau", [["Bois", 2], ["Lingot fer", 2]]],
  ["Couteau de lancé", [["Bois", 2], ["Lingot fer", 2]]],
  ["Hachette", [["Bois", 2], ["Lingot fer", 3]]],
  ["Hachette de chasseur", [["Bois", 2], ["Lingot fer", 3]]],
  ["Ceinture Hachette", [["Bois", 3], ["Lingot fer", 5]]],
  ["Ceinture Hachette de chasseur", [["Bois", 3], ["Lingot fer", 5]]],
  ["Machette", [["Bois", 2], ["Lingot fer", 5]]],
  ["Menottes", [["Lingot fer", 1]]],
  ["Lanterne", [["Bois", 1], ["Lingot fer", 1], ["Verre", 1]]],
  ["Lasso", [["Cordes", 4], ["Bois", 4]]],
  ["Lasso Amélioré", [["Cordes", 5], ["Bois", 10]]],
  ["Jumelles", [["Lingot fer", 1], ["Lingot zinc", 1], ["Verre", 1]]],
  ["Jumelles Améliorées", [["Lingot fer", 1], ["Lingot zinc", 2], ["Verre", 2]]],
  // ── Revolvers ──
  ["Revolver Cattleman", [["Bois", 3], ["Pièce d'arme", 3], ["Lingot fer", 1]]],
  ["Revolver Double Action", [["Bois", 3], ["Pièce d'arme", 3], ["Lingot fer", 5]]],
  ["Revolver Schofield", [["Bois", 6], ["Pièce d'arme", 6], ["Charbon", 4], ["Lingot fer", 6]]],
  ["Revolver Navy", [["Bois", 10], ["Pièce d'arme", 10], ["Charbon", 10], ["Lingot fer", 10]]],
  ["Revolver LeMat", [["Bois", 10], ["Pièce d'arme", 10], ["Charbon", 4], ["Lingot fer", 6]]],
  // ── Pistolets ──
  ["Pistolet Volcanic", [["Bois", 8], ["Pièce d'arme", 6], ["Charbon", 4], ["Lingot fer", 4]]],
  ["Pistolet Mauser", [["Bois", 10], ["Pièce d'arme", 6], ["Charbon", 4], ["Lingot fer", 4]]],
  ["Pistolet 1899", [["Bois", 10], ["Pièce d'arme", 8], ["Charbon", 4], ["Lingot fer", 4]]],
  ["Pistolet semi-automatique", [["Bois", 10], ["Pièce d'arme", 4], ["Charbon", 4], ["Lingot fer", 4]]],
  ["Canon scié", [["Bois", 5], ["Pièce d'arme", 5], ["Charbon", 2], ["Lingot fer", 3]]],
  // ── Carabines ──
  ["Carabine à répétition", [["Bois", 4], ["Pièce d'arme", 4], ["Charbon", 4], ["Lingot fer", 4]]],
  ["Carabine Litchfield", [["Bois", 20], ["Pièce d'arme", 10], ["Charbon", 6], ["Lingot fer", 6]]],
  ["Carabine Evans", [["Bois", 20], ["Pièce d'arme", 10], ["Charbon", 8], ["Lingot fer", 8]]],
  ["Carabine Lancaster", [["Bois", 20], ["Pièce d'arme", 10], ["Charbon", 8], ["Lingot fer", 8]]],
  // ── Fusils ──
  ["Fusil à petit gibier", [["Bois", 5], ["Pièce d'arme", 5], ["Charbon", 5], ["Lingot fer", 5]]],
  ["Fusil double canon", [["Bois", 20], ["Pièce d'arme", 10], ["Charbon", 20], ["Lingot fer", 20]]],
  ["Fusil à répétition", [["Bois", 15], ["Pièce d'arme", 30], ["Charbon", 15], ["Lingot fer", 15]]],
  ["Fusil springfield", [["Bois", 15], ["Pièce d'arme", 15], ["Charbon", 15], ["Lingot fer", 15]]],
  ["Fusil semi-automatique", [["Bois", 20], ["Pièce d'arme", 20], ["Charbon", 25], ["Lingot fer", 25]]],
  ["Fusil à pompe", [["Bois", 20], ["Pièce d'arme", 20], ["Charbon", 30], ["Lingot fer", 30]]],
  ["Fusil à verrou", [["Bois", 35], ["Pièce d'arme", 20], ["Charbon", 20], ["Lingot fer", 20]]],
];
const _norm = (x: string) => String(x).toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
export async function importerRecettes(): Promise<ArmResult & { n?: number }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { data: prods, error: e0 } = await admin.from("ArmurerieProduit").select("id,nom");
  if (e0) return { ok: false, error: erpErr(e0.message) };
  const byNorm = new Map((prods || []).map((p) => [_norm((p as { nom: string }).nom), (p as { id: string }).id]));
  let n = 0;
  for (const [nom, ing] of RECETTES) {
    const id = byNorm.get(_norm(nom));
    if (!id) continue;
    const recette = ing.map(([ingredient, qte]) => ({ ingredient, qte }));
    const { error } = await admin.from("ArmurerieProduit").update({ recette }).eq("id", id);
    if (!error) n++;
  }
  return { ok: true, n };
}

// ── Impôts : accumulation automatique du cycle fiscal en cours ───
// À chaque vente, on ajoute le CA au cycle « dû » en cours (ou on en ouvre un
// nouveau, en héritant du dernier taux, 10 % par défaut) et on recalcule l'impôt.
async function _accumulerImpot(admin: Admin, montant: number) {
  const m = round2(montant);
  if (m <= 0) return;
  const { data: enCours } = await admin.from("ArmurerieImpot").select("*").eq("statut", "du").order("createdAt", { ascending: false }).limit(1).maybeSingle();
  if (enCours) {
    const e = enCours as { id: string; chiffreAffaires: number; taux: number };
    const ca = round2((Number(e.chiffreAffaires) || 0) + m);
    const taux = Number(e.taux) || 0;
    await admin.from("ArmurerieImpot").update({ chiffreAffaires: ca, montant: round2((ca * taux) / 100) }).eq("id", e.id);
  } else {
    const { data: dernier } = await admin.from("ArmurerieImpot").select("taux").order("createdAt", { ascending: false }).limit(1).maybeSingle();
    const taux = dernier ? (Number((dernier as { taux: number }).taux) || 0) : 10;
    await admin.from("ArmurerieImpot").insert({ id: newId("imp"), libelle: "Ventes (cycle en cours)", chiffreAffaires: m, taux, montant: round2((m * taux) / 100), statut: "du" });
  }
}

// ── Caisse (point de vente) — tout est automatisé à l'encaissement ─
export type LigneCaisse = { produitId?: string; nom: string; categorie?: string; prix: number; cout?: number; qte: number; aLaDemande?: boolean };
export async function validerCaisse(lignes: LigneCaisse[], client: string, notes: string, clientId?: string, opts?: { serie?: string; photo?: string }): Promise<ArmResult & { total?: number; ticket?: string; ficheCreee?: boolean }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const items = (Array.isArray(lignes) ? lignes : []).filter((l) => l && Number(l.qte) > 0);
  if (!items.length) return { ok: false, error: "Le panier est vide." };
  const vendeur = await auteurNom();
  const dateV = new Date().toLocaleDateString("fr-FR");
  const serie = s(opts?.serie, 60);
  const photo = opts?.photo ? s(opts.photo, 600) : null;

  // Client fiché → on rattache la vente (photo + télégramme au registre) ; sinon passage.
  let cid: string | null = clientId ? s(clientId, 60) : null;
  let cli = s(client, 120) || "Client de passage";
  let cliTel: string | null = null;
  if (cid) {
    const { data: c } = await admin.from("ArmurerieClient").select("nom,telegramme").eq("id", cid).maybeSingle();
    if (c) { cli = (c as { nom: string }).nom || cli; cliTel = (c as { telegramme: string | null }).telegramme ?? null; }
    else cid = null;
  }
  // Pas de client fiché mais un NOM saisi (ou lu sur la carte) → on crée/retrouve
  // automatiquement sa fiche à l'encaissement, pour que le dossier + la facture y
  // apparaissent. La photo déposée sert de carte d'identité rangée.
  let ficheCreee = false;
  if (!cid && cli && !/^client de passage$/i.test(cli)) {
    const { data: dup } = await admin.from("ArmurerieClient").select("id,nom,telegramme").ilike("nom", cli).limit(1);
    const found = Array.isArray(dup) && dup.length ? (dup[0] as { id: string; nom: string; telegramme: string | null }) : null;
    if (found) { cid = found.id; cli = found.nom || cli; cliTel = found.telegramme ?? cliTel; }
    else {
      const newCid = newId("cli");
      const row: Record<string, unknown> = { id: newCid, nom: cli, statut: "actif" };
      if (notes) row.notes = s(notes, 2000);
      if (photo) row.carteIdentite = photo; // la photo déposée = sa carte d'identité
      let insC = await admin.from("ArmurerieClient").insert(row);
      // Repli si la colonne carteIdentite n'est pas migrée.
      if (insC.error && /carteIdentite/i.test(insC.error.message)) { delete row.carteIdentite; insC = await admin.from("ArmurerieClient").insert(row); }
      if (!insC.error) { cid = newCid; ficheCreee = true; }
    }
  }

  let total = 0;
  const ticket = "FAC-" + Date.now().toString(36).toUpperCase().slice(-6); // n° de facture commun aux lignes de ce règlement
  try {
    for (const l of items) {
      const q = Math.max(1, Math.round(Number(l.qte) || 1));
      const montant = Math.max(0, round2((Number(l.prix) || 0) * q));
      total += montant;
      const row: Record<string, unknown> = {
        id: newId("vte"), clientId: cid, acquereur: cli, dateVente: dateV, marque: s(l.nom, 80), modele: null,
        categorie: s(l.categorie, 60), numeroSerie: serie || null, ticket,
        quantite: q, prixUnitaire: round2(Number(l.prix) || 0),
        vendeur, telegramme: cliTel, prix: montant, notes: s(notes, 1000), statut: "enregistree",
      };
      if (photo) row.photo = photo; // photo de l'acquéreur (si colonne migrée)
      let insV = await admin.from("ArmurerieVente").insert(row);
      // Repli si des colonnes récentes (ticket, photo, quantite, prixUnitaire) ne sont pas migrées.
      for (let i = 0; i < 4 && insV.error && /ticket|photo|quantite|prixUnitaire/i.test(insV.error.message); i++) {
        const m = insV.error.message;
        if (/ticket/i.test(m)) delete row.ticket;
        else if (/photo/i.test(m)) delete row.photo;
        else if (/quantite/i.test(m)) delete row.quantite;
        else if (/prixUnitaire/i.test(m)) delete row.prixUnitaire;
        insV = await admin.from("ArmurerieVente").insert(row);
      }
      if (l.produitId) {
        const { data } = await admin.from("ArmurerieProduit").select("stock,recette").eq("id", l.produitId).maybeSingle();
        const ps = data ? Number((data as { stock?: number }).stock) || 0 : 0;
        if (data && !l.aLaDemande) await admin.from("ArmurerieProduit").update({ stock: Math.max(0, ps - q) }).eq("id", l.produitId);
        // Fabrication à la demande : la part non couverte par le stock fini consomme
        // les ressources de la recette (le stock déjà fabriqué, lui, ne re-consomme rien).
        const toFab = l.aLaDemande ? q : Math.max(0, q - ps);
        const recette = data && Array.isArray((data as { recette?: unknown }).recette) ? (data as { recette: { ingredient?: string; qte?: number }[] }).recette : [];
        if (toFab > 0 && recette.length) { try { await _consommerRecetteLignes(admin, recette, toFab); } catch { /* la vente reste enregistrée même si le décompte des ressources échoue */ } }
      }
      // Comptabilité : le crédit du coffre alimente automatiquement le grand livre.
      try { await _mouvementCoffre(admin, montant, "entree", `Vente : ${s(l.nom, 80)} ×${q} — ${cli}`, vendeur); } catch { /* vente enregistrée même si le coffre n'est pas prêt */ }
    }
    total = round2(total);
    // Facture automatique (système de factures de la compagnie, via le bot).
    try {
      const resume = items.map((l) => `${s(l.nom, 40)} ×${Math.max(1, Math.round(Number(l.qte) || 1))}`).join(", ");
      await envoyerCommande("facture.create", { objet: `Vente armurerie — ${resume}`.slice(0, 300), montant: total, clientNom: cli, type: "Armurerie" });
    } catch { /* best-effort */ }
    // Impôts : accumulation automatique du cycle fiscal en cours.
    try { await _accumulerImpot(admin, total); } catch { /* best-effort */ }
    return { ok: true, total, ticket, ficheCreee };
  } catch (e) {
    const msg = (e as Error).message || "";
    return { ok: false, error: /Armurerie|does not exist/i.test(msg) ? "Tables armurerie manquantes — exécute armurerie-vh.sql." : "Vente impossible pour le moment." };
  }
}

// Appelle Claude (vision) sur une image (téléchargée puis envoyée en base64,
// robuste et indépendant de la version d'API) et renvoie le texte produit.
async function _vision(url: string, system: string, userText: string, maxTokens = 400): Promise<{ ok: boolean; txt?: string; error?: string }> {
  if (!/^https?:\/\//.test(String(url || ""))) return { ok: false, error: "Photo invalide." };
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "Lecture automatique indisponible (variable ANTHROPIC_API_KEY absente sur Vercel)." };
  try {
    const img = await fetch(url);
    if (!img.ok) return { ok: false, error: "Photo inaccessible." };
    const ct = img.headers.get("content-type") || "";
    const media = /png/i.test(ct) ? "image/png" : /webp/i.test(ct) ? "image/webp" : /gif/i.test(ct) ? "image/gif" : "image/jpeg";
    const b64 = Buffer.from(await img.arrayBuffer()).toString("base64");
    if (!b64 || b64.length > 6_000_000) return { ok: false, error: "Photo trop lourde ou illisible." };
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-5", max_tokens: maxTokens, system,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: media, data: b64 } },
          { type: "text", text: userText },
        ] }],
      }),
    });
    if (!res.ok) { const t = await res.text().catch(() => ""); console.error("_vision:", res.status, t.slice(0, 200)); return { ok: false, error: "Lecture impossible pour le moment." }; }
    const data = await res.json();
    const txt = ((data?.content || []) as { type: string; text?: string }[]).filter((b) => b.type === "text").map((b) => b.text || "").join("");
    return { ok: true, txt };
  } catch (e) { console.error("_vision:", (e as Error).message); return { ok: false, error: "Lecture injoignable pour le moment." }; }
}

// Lecture IA d'une carte d'identité (RDR2/Louisiane) : extrait nom, prénom, etc.
export async function lireCarteIdentite(url: string): Promise<{ ok: boolean; nom?: string; prenom?: string; dateNaissance?: string; residence?: string; error?: string }> {
  const r = await _vision(url, "Tu lis une carte d'identité de jeu de rôle (RDR2, État de Louisiane). Réponds UNIQUEMENT par un JSON compact, sans texte autour : {\"nom\":\"\",\"prenom\":\"\",\"dateNaissance\":\"\",\"pays\":\"\",\"residence\":\"\"}. Recopie exactement ce qui est écrit ; laisse la valeur vide si un champ est illisible ou absent.", "Lis cette carte d'identité et renvoie le JSON.");
  if (!r.ok) return { ok: false, error: r.error };
  const m = (r.txt || "").match(/\{[\s\S]*\}/);
  if (!m) return { ok: false, error: "Carte illisible — saisis le nom à la main." };
  try {
    const j = JSON.parse(m[0]) as Record<string, unknown>;
    return { ok: true, nom: s(j.nom, 80) || "", prenom: s(j.prenom, 80) || "", dateNaissance: s(j.dateNaissance, 40) || "", residence: s(j.residence, 120) || "" };
  } catch { return { ok: false, error: "Carte illisible — saisis le nom à la main." }; }
}

// Lecture IA du numéro de série d'une arme sur une capture.
export async function lireNumeroSerie(url: string): Promise<{ ok: boolean; serie?: string; error?: string }> {
  const r = await _vision(url, "Tu lis une capture d'écran de jeu (RDR2/RedM) où figure le NUMÉRO DE SÉRIE d'une arme. Réponds UNIQUEMENT par un JSON compact : {\"serie\":\"\"}. Recopie exactement le numéro de série (lettres/chiffres, garde tirets et espaces). Laisse vide si tu ne le trouves pas.", "Lis le numéro de série de l'arme et renvoie le JSON.");
  if (!r.ok) return { ok: false, error: r.error };
  const m = (r.txt || "").match(/\{[\s\S]*\}/);
  if (!m) return { ok: false, error: "Numéro illisible — saisis-le à la main." };
  try {
    const j = JSON.parse(m[0]) as Record<string, unknown>;
    const serie = s(j.serie, 60) || "";
    return serie ? { ok: true, serie } : { ok: false, error: "Numéro non détecté — saisis-le à la main." };
  } catch { return { ok: false, error: "Numéro illisible — saisis-le à la main." }; }
}

// Lecture IA d'une capture de coffre / inventaire (RDR2/RedM) : liste chaque objet
// visible avec sa quantité (le nombre après « x »). Sert à réactualiser le stock des
// ressources sans saisie à la main.
export async function lireCoffreRessources(url: string): Promise<{ ok: boolean; lignes?: { nom: string; quantite: number }[]; error?: string }> {
  const r = await _vision(
    url,
    "Tu regardes une capture d'écran qui liste des matières / objets avec leur STOCK. Ça peut être : (a) un coffre/inventaire de jeu (RDR2/RedM) où le stock est noté « x123 », ou (b) un panneau web de gestion (type Reckless RP) où le stock est noté « Stock : 123 », « 123 en stock », ou un simple nombre à côté du nom. Pour CHAQUE ligne, relève le NOM exact de la matière et sa QUANTITÉ EN STOCK. Réponds UNIQUEMENT par un JSON compact, sans texte autour : {\"lignes\":[{\"nom\":\"Nom exact\",\"quantite\":123}]}. Recopie le nom EXACTEMENT. IMPORTANT : relève bien le STOCK — surtout PAS une quantité de recette (« QTÉ / UNITÉ », « ×6 »), PAS un coût unitaire, PAS un prix de vente, PAS un poids en kg. Ne liste QUE ce qui est réellement visible — n'invente rien.",
    "Relève chaque matière et son STOCK (pas les quantités de recette ni les prix), et renvoie le JSON.",
    1024,
  );
  if (!r.ok) return { ok: false, error: r.error };
  const m = (r.txt || "").match(/\{[\s\S]*\}/);
  if (!m) return { ok: false, error: "Capture illisible — réessaie avec une image plus nette." };
  try {
    const j = JSON.parse(m[0]) as { lignes?: unknown };
    const arr = Array.isArray(j.lignes) ? j.lignes : [];
    const lignes = arr
      .map((x) => { const o = (x || {}) as Record<string, unknown>; return { nom: s(o.nom, 80) || "", quantite: Math.max(0, Math.round(Number(o.quantite) || 0)) }; })
      .filter((l) => l.nom);
    return lignes.length ? { ok: true, lignes } : { ok: false, error: "Aucun objet détecté sur la capture." };
  } catch { return { ok: false, error: "Capture illisible — réessaie avec une image plus nette." }; }
}

// ═══════════════════════════════════════════════════════════════
//  MODULE ERP — employés, pointage, paies, impôts, comptabilité,
//  bloc-notes, tâches. Tables neuves (armurerie-erp.sql), site-native.
// ═══════════════════════════════════════════════════════════════
const nowISO = () => new Date().toISOString();
function erpErr(msg: string): string {
  if (/does not exist|relation|Armurerie/i.test(msg)) return "Cette section n'est pas encore prête — exécute armurerie-erp.sql dans Supabase.";
  return "Enregistrement impossible pour le moment.";
}

// ── Employés ─────────────────────────────────────────────────────
export async function creerEmploye(d: { nom: string; discordId?: string; role?: string; commission?: number; salaireBase?: number }): Promise<ArmResult> {
  if (!d.nom || d.nom.trim().length < 2) return { ok: false, error: "Nom de l'employé requis." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const id = newId("emp");
  const { error } = await admin.from("ArmurerieEmploye").insert({
    id, nom: s(d.nom, 120), discordId: s(d.discordId, 40), role: s(d.role, 60) || "Armurier",
    commission: Math.max(0, Math.min(100, Math.round(Number(d.commission) || 0))),
    salaireBase: Math.max(0, round2(Number(d.salaireBase) || 0)), actif: true,
  });
  if (error) return { ok: false, error: erpErr(error.message) };
  return { ok: true, id };
}
export async function majEmploye(id: string, patch: Record<string, unknown>): Promise<ArmResult> {
  if (!id) return { ok: false, error: "Employé introuvable." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const up: Record<string, unknown> = { updatedAt: nowISO() };
  if ("nom" in patch) up.nom = s(patch.nom, 120);
  if ("discordId" in patch) up.discordId = s(patch.discordId, 40);
  if ("role" in patch) up.role = s(patch.role, 60);
  if ("commission" in patch) up.commission = Math.max(0, Math.min(100, Math.round(Number(patch.commission) || 0)));
  if ("salaireBase" in patch) up.salaireBase = Math.max(0, round2(Number(patch.salaireBase) || 0));
  if ("actif" in patch) up.actif = !!patch.actif;
  const { error } = await admin.from("ArmurerieEmploye").update(up).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}
export async function supprimerEmploye(id: string): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { error } = await admin.from("ArmurerieEmploye").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}

// ── Pointage (prise / fin de service) ────────────────────────────
export async function pointerService(employeId: string, employeNom: string): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  // Refuse un double pointage ouvert pour le même employé.
  const { data: ouvert } = await admin.from("ArmureriePointage").select("id").eq("employeId", employeId).is("fin", null).limit(1);
  if (Array.isArray(ouvert) && ouvert.length) return { ok: false, error: "Service déjà en cours pour cet employé." };
  const id = newId("ptg");
  const { error } = await admin.from("ArmureriePointage").insert({ id, employeId: s(employeId, 60), employeNom: s(employeNom, 120), debut: nowISO(), fin: null, minutes: 0 });
  if (error) return { ok: false, error: erpErr(error.message) };
  return { ok: true, id };
}
export async function terminerService(id: string): Promise<ArmResult> {
  if (!id) return { ok: false, error: "Pointage introuvable." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { data } = await admin.from("ArmureriePointage").select("debut").eq("id", id).maybeSingle();
  const debut = data ? new Date(String((data as { debut: string }).debut)).getTime() : Date.now();
  const minutes = Math.max(0, Math.round((Date.now() - debut) / 60000));
  const { error } = await admin.from("ArmureriePointage").update({ fin: nowISO(), minutes }).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}
export async function supprimerPointage(id: string): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { error } = await admin.from("ArmureriePointage").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}

// ── Paies (commission sur CA + fixe + prime) ─────────────────────
export async function creerPaie(d: { employeId?: string; employeNom: string; periode?: string; ventes?: number; commission?: number; base?: number; prime?: number; notes?: string }): Promise<ArmResult> {
  if (!d.employeNom || d.employeNom.trim().length < 2) return { ok: false, error: "Indique l'employé." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const commission = Math.max(0, round2(Number(d.commission) || 0));
  const base = Math.max(0, round2(Number(d.base) || 0));
  const prime = Math.max(0, round2(Number(d.prime) || 0));
  const montant = round2(commission + base + prime);
  const id = newId("pay");
  const { error } = await admin.from("ArmureriePaie").insert({
    id, employeId: s(d.employeId, 60), employeNom: s(d.employeNom, 120), periode: s(d.periode, 80),
    ventes: Math.max(0, round2(Number(d.ventes) || 0)), commission, base, prime, montant,
    statut: "du", notes: s(d.notes, 500),
  });
  if (error) return { ok: false, error: erpErr(error.message) };
  return { ok: true, id };
}
export async function payerPaie(id: string): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { data, error } = await admin.from("ArmureriePaie").select("*").eq("id", id).maybeSingle();
  if (error || !data) return { ok: false, error: "Fiche de paie introuvable." };
  const p = data as { statut: string; montant: number; employeNom: string };
  if (p.statut === "paye") return { ok: false, error: "Cette paie est déjà versée." };
  const montant = Math.max(0, round2(Number(p.montant) || 0));
  try { if (montant > 0) await _mouvementCoffre(admin, montant, "sortie", `Paie — ${p.employeNom}`, await auteurNom(), "charge"); }
  catch (e) { return { ok: false, error: erpErr((e as Error).message || "") }; }
  await admin.from("ArmureriePaie").update({ statut: "paye", payeAt: nowISO() }).eq("id", id);
  return { ok: true };
}
export async function supprimerPaie(id: string): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { error } = await admin.from("ArmureriePaie").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}

// ── Impôts (cycle fiscal : CA × taux) ────────────────────────────
export async function creerImpot(d: { libelle?: string; debut?: string; fin?: string; chiffreAffaires?: number; taux?: number; notes?: string }): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const ca = Math.max(0, round2(Number(d.chiffreAffaires) || 0));
  const taux = Math.max(0, Math.min(100, Math.round(Number(d.taux) || 0)));
  const montant = round2((ca * taux) / 100);
  const id = newId("imp");
  const { error } = await admin.from("ArmurerieImpot").insert({
    id, libelle: s(d.libelle, 80) || "Cycle fiscal", debut: s(d.debut, 40), fin: s(d.fin, 40),
    chiffreAffaires: ca, taux, montant, statut: "du", notes: s(d.notes, 500),
  });
  if (error) return { ok: false, error: erpErr(error.message) };
  return { ok: true, id };
}
export async function payerImpot(id: string): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { data, error } = await admin.from("ArmurerieImpot").select("*").eq("id", id).maybeSingle();
  if (error || !data) return { ok: false, error: "Déclaration introuvable." };
  const im = data as { statut: string; montant: number; libelle: string };
  if (im.statut === "paye") return { ok: false, error: "Cet impôt est déjà réglé." };
  const montant = Math.max(0, round2(Number(im.montant) || 0));
  try { if (montant > 0) await _mouvementCoffre(admin, montant, "sortie", `Impôt — ${im.libelle || "cycle"}`, await auteurNom(), "charge"); }
  catch (e) { return { ok: false, error: erpErr((e as Error).message || "") }; }
  await admin.from("ArmurerieImpot").update({ statut: "paye", payeAt: nowISO() }).eq("id", id);
  return { ok: true };
}
export async function supprimerImpot(id: string): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { error } = await admin.from("ArmurerieImpot").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}

// ── Comptabilité : écriture manuelle (recette / dépense) ─────────
export async function ajouterEcriture(montant: number, sens: "entree" | "sortie", motif: string, nature?: "produit" | "charge" | null): Promise<ArmResult> {
  const m = Math.abs(round2(Number(montant) || 0));
  if (m <= 0) return { ok: false, error: "Montant invalide." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const nat = sens === "sortie" ? (nature === "charge" ? "charge" : "produit") : null;
  try { await _mouvementCoffre(admin, m, sens, s(motif, 200) || (sens === "entree" ? "Recette" : "Dépense"), await auteurNom(), nat); return { ok: true }; }
  catch (e) { return { ok: false, error: erpErr((e as Error).message || "") }; }
}

// ── Bloc-notes ───────────────────────────────────────────────────
export async function creerNote(d: { titre?: string; contenu: string }): Promise<ArmResult> {
  if (!d.contenu || d.contenu.trim().length < 1) return { ok: false, error: "Écris le contenu de la note." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const id = newId("note");
  const { error } = await admin.from("ArmurerieNote").insert({ id, titre: s(d.titre, 120), contenu: s(d.contenu, 4000), epingle: false, auteur: await auteurNom() });
  if (error) return { ok: false, error: erpErr(error.message) };
  return { ok: true, id };
}
export async function majNote(id: string, patch: { titre?: string; contenu?: string; epingle?: boolean }): Promise<ArmResult> {
  if (!id) return { ok: false, error: "Note introuvable." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const up: Record<string, unknown> = { updatedAt: nowISO() };
  if ("titre" in patch) up.titre = s(patch.titre, 120);
  if ("contenu" in patch) up.contenu = s(patch.contenu, 4000);
  if ("epingle" in patch) up.epingle = !!patch.epingle;
  const { error } = await admin.from("ArmurerieNote").update(up).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}
export async function supprimerNote(id: string): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { error } = await admin.from("ArmurerieNote").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}

// ── Tâches ───────────────────────────────────────────────────────
export async function creerTache(d: { texte: string; assigneA?: string }): Promise<ArmResult> {
  if (!d.texte || d.texte.trim().length < 1) return { ok: false, error: "Décris la tâche." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const id = newId("tsk");
  const { error } = await admin.from("ArmurerieTache").insert({ id, texte: s(d.texte, 300), fait: false, assigneA: s(d.assigneA, 120), auteur: await auteurNom() });
  if (error) return { ok: false, error: erpErr(error.message) };
  return { ok: true, id };
}
export async function basculerTache(id: string, fait: boolean): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { error } = await admin.from("ArmurerieTache").update({ fait: !!fait }).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}
export async function supprimerTache(id: string): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { error } = await admin.from("ArmurerieTache").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}

// ── Ressources (matières premières nécessaires au craft) ─────────
export async function creerRessource(d: { nom: string; categorie?: string; prix?: number; mine?: boolean; stock?: number }): Promise<ArmResult> {
  if (!d.nom || d.nom.trim().length < 1) return { ok: false, error: "Nom de la ressource requis." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const id = newId("res");
  const row: Record<string, unknown> = { id, nom: s(d.nom, 120), categorie: s(d.categorie, 60) || "Divers", prix: Math.max(0, round2(Number(d.prix) || 0)), mine: !!d.mine, stock: Math.max(0, Math.round(Number(d.stock) || 0)) };
  let { error } = await admin.from("ArmurerieRessource").insert(row);
  if (error && /stock/i.test(error.message)) { delete row.stock; ({ error } = await admin.from("ArmurerieRessource").insert(row)); }
  if (error) return { ok: false, error: erpErr(error.message) };
  return { ok: true, id };
}
export async function majRessource(id: string, patch: { nom?: string; categorie?: string; prix?: number; mine?: boolean; stock?: number }): Promise<ArmResult> {
  if (!id) return { ok: false, error: "Ressource introuvable." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const up: Record<string, unknown> = { updatedAt: nowISO() };
  if ("nom" in patch) up.nom = s(patch.nom, 120);
  if ("categorie" in patch) up.categorie = s(patch.categorie, 60);
  if ("prix" in patch) up.prix = Math.max(0, round2(Number(patch.prix) || 0));
  if ("mine" in patch) up.mine = !!patch.mine;
  if ("stock" in patch) up.stock = Math.max(0, Math.round(Number(patch.stock) || 0));
  let { error } = await admin.from("ArmurerieRessource").update(up).eq("id", id);
  if (error && "stock" in up && /stock/i.test(error.message)) { delete up.stock; ({ error } = await admin.from("ArmurerieRessource").update(up).eq("id", id)); }
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}
export async function supprimerRessource(id: string): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { error } = await admin.from("ArmurerieRessource").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}
// Tarifs des ressources nécessaires (catégorisés). « mine: true » = remise 5 % applicable.
// Prix 0 = à renseigner (jamais inventé).
const RESSOURCES: { nom: string; cat: string; prix: number; mine?: boolean }[] = [
  // ── Minerais (de la mine — remise 5 %) ──
  { nom: "Charbon", cat: "Minerais", prix: 0.11, mine: true },
  { nom: "Lingot de fer", cat: "Minerais", prix: 0, mine: true },
  { nom: "Lingot de cuivre", cat: "Minerais", prix: 0, mine: true },
  { nom: "Lingot de zinc", cat: "Minerais", prix: 0, mine: true },
  { nom: "Soufre", cat: "Minerais", prix: 0, mine: true },
  // ── Métaux & verre ──
  { nom: "Verre", cat: "Métaux & verre", prix: 0 },
  // ── Bois ──
  { nom: "Bois (couteau, cattleman…)", cat: "Bois", prix: 0.22 },
  { nom: "Bois amélioré (grosses armes)", cat: "Bois", prix: 2 },
  { nom: "Pièce de bois", cat: "Bois", prix: 0 },
  // ── Textile ──
  { nom: "Cordes", cat: "Textile", prix: 0.48 },
  // ── Composants ──
  { nom: "Carquois", cat: "Composants", prix: 1 },
  { nom: "Arc", cat: "Composants", prix: 7 },
];
// Ajoute les ressources ABSENTES (par nom normalisé) — re-cliquable sans doublon,
// ne touche pas aux prix/quantités déjà saisis.
export async function importerRessources(): Promise<ArmResult & { n?: number }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { data: existants } = await admin.from("ArmurerieRessource").select("id,nom");
  const parNom = new Set((existants || []).map((r) => _norm(String((r as { nom: string }).nom))));
  const manquants = RESSOURCES.filter((r) => !parNom.has(_norm(r.nom)));
  if (manquants.length) {
    const rows = manquants.map((r) => ({ id: newId("res"), nom: r.nom, categorie: r.cat, prix: round2(r.prix), mine: !!r.mine }));
    const { error } = await admin.from("ArmurerieRessource").insert(rows);
    if (error) return { ok: false, error: erpErr(error.message) };
  }
  return { ok: true, n: manquants.length };
}
// Régler un achat de ressources : la remise ne s'applique QU'AUX ressources de la
// mine, puis on débite le coffre (→ dépense automatique en comptabilité).
export type LigneRessource = { id?: string; nom: string; qte: number; prix: number; mine?: boolean };
export async function acheterRessources(lignes: LigneRessource[], remisePct: number): Promise<ArmResult & { net?: number; brut?: number; remise?: number }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const items = (Array.isArray(lignes) ? lignes : []).filter((l) => l && Number(l.qte) > 0);
  if (!items.length) return { ok: false, error: "Sélectionne au moins une ressource." };
  const pct = Math.max(0, Math.min(100, round2(Number(remisePct) || 0)));
  const sousTotal = (l: LigneRessource) => (Number(l.qte) || 0) * (Number(l.prix) || 0);
  const brut = round2(items.reduce((s2, l) => s2 + sousTotal(l), 0));
  const brutMine = round2(items.filter((l) => l.mine).reduce((s2, l) => s2 + sousTotal(l), 0)); // base de la remise
  const remise = round2((brutMine * pct) / 100);
  const net = round2(brut - remise);
  const resume = items.map((l) => `${s(l.nom, 40)} ×${Math.max(1, Math.round(Number(l.qte) || 1))}`).join(", ");
  const motif = (remise > 0 ? `Achat ressources (remise mine −${pct}%) : ` : "Achat ressources : ") + resume;
  try {
    await _mouvementCoffre(admin, net, "sortie", motif.slice(0, 200), await auteurNom(), "produit");
    // Créditer le stock des ressources achetées (best-effort ; ignoré si colonne absente).
    try {
      const ids = items.map((i) => i.id).filter(Boolean) as string[];
      if (ids.length) {
        const { data: rs } = await admin.from("ArmurerieRessource").select("id,stock").in("id", ids);
        if (Array.isArray(rs)) {
          const byId = new Map(rs.map((r) => [String((r as { id: string }).id), Number((r as { stock?: number }).stock) || 0]));
          for (const it of items) { if (!it.id) continue; const add = Math.max(0, Math.round(Number(it.qte) || 0)); await admin.from("ArmurerieRessource").update({ stock: (byId.get(String(it.id)) || 0) + add }).eq("id", it.id); }
        }
      }
    } catch { /* stock ressource non activé — on ignore */ }
    return { ok: true, net, brut, remise };
  } catch (e) { return { ok: false, error: erpErr((e as Error).message || "") }; }
}

// Réactualiser le stock des ressources depuis une capture de coffre (lecture IA).
//  · mode "add"  → cumule (utile pour additionner plusieurs coffres)
//  · mode "set"  → remplace (la photo = le total actuel)
// Les objets détectés absents du catalogue sont créés (prix 0 = « à définir » : rien
// d'inventé). Additif : ne touche qu'au stock (et crée les manquants).
export async function appliquerStockRessources(payload: {
  mode?: "set" | "add";
  items?: { id: string; qte: number }[];
  nouvelles?: { nom: string; categorie?: string; qte: number }[];
}): Promise<ArmResult & { maj?: number; crees?: number; applied?: { id: string; avant: number }[]; creesIds?: string[] }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const mode = payload?.mode === "set" ? "set" : "add";
  const items = (Array.isArray(payload?.items) ? payload!.items : []).filter((i) => i && i.id && Number(i.qte) >= 0);
  const nouvelles = (Array.isArray(payload?.nouvelles) ? payload!.nouvelles : []).filter((n) => n && String(n.nom || "").trim() && Number(n.qte) >= 0);
  if (!items.length && !nouvelles.length) return { ok: false, error: "Rien à mettre à jour." };
  let maj = 0, crees = 0;
  const applied: { id: string; avant: number }[] = []; // pour l'annulation (retour à l'état d'avant)
  const creesIds: string[] = [];
  try {
    // Cumul des doublons d'id : plusieurs photos peuvent lister la même ressource → on somme.
    const itemAgg = new Map<string, number>();
    for (const it of items) itemAgg.set(it.id, (itemAgg.get(it.id) || 0) + Math.max(0, Math.round(Number(it.qte) || 0)));
    const itemsU = [...itemAgg.entries()].map(([id, qte]) => ({ id, qte }));
    if (itemsU.length) {
      const ids = itemsU.map((i) => i.id);
      const { data: rs } = await admin.from("ArmurerieRessource").select("id,stock").in("id", ids);
      const byId = new Map((rs || []).map((r) => [String((r as { id: string }).id), Number((r as { stock?: number }).stock) || 0]));
      for (const it of itemsU) {
        const avant = byId.get(it.id) || 0;
        const val = mode === "add" ? avant + it.qte : it.qte;
        const { error } = await admin.from("ArmurerieRessource").update({ stock: val }).eq("id", it.id);
        if (!error) { maj++; applied.push({ id: it.id, avant }); }
      }
    }
    if (nouvelles.length) {
      const rows: Record<string, unknown>[] = nouvelles.map((n) => ({
        id: newId("res"), nom: s(n.nom, 80), categorie: s(n.categorie, 60) || "Divers",
        prix: 0, mine: false, stock: Math.max(0, Math.round(Number(n.qte) || 0)),
      }));
      let ins = await admin.from("ArmurerieRessource").insert(rows);
      // Repli si la colonne « stock » n'est pas migrée : insère sans stock.
      if (ins.error && /stock/i.test(ins.error.message)) { rows.forEach((r) => delete r.stock); ins = await admin.from("ArmurerieRessource").insert(rows); }
      if (!ins.error) { crees = rows.length; for (const r of rows) creesIds.push(String(r.id)); }
    }
    return { ok: true, maj, crees, applied, creesIds };
  } catch (e) { return { ok: false, error: erpErr((e as Error).message || "") }; }
}

// Annuler le dernier scan : restaure le stock d'avant et supprime les ressources créées.
export async function annulerStockRessources(payload: { restore?: { id: string; avant: number }[]; supprimer?: string[] }): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const restore = Array.isArray(payload?.restore) ? payload!.restore.filter((r) => r && r.id) : [];
  const supprimer = Array.isArray(payload?.supprimer) ? payload!.supprimer.filter(Boolean) : [];
  try {
    for (const r of restore) await admin.from("ArmurerieRessource").update({ stock: Math.max(0, Math.round(Number(r.avant) || 0)) }).eq("id", r.id);
    if (supprimer.length) await admin.from("ArmurerieRessource").delete().in("id", supprimer);
    return { ok: true };
  } catch (e) { return { ok: false, error: erpErr((e as Error).message || "") }; }
}

// ── Fabrication : consomme les ressources en stock, ajoute le produit fini ──
const _STOP = new Set(["de", "du", "des", "d", "l", "la", "le", "les", "a", "au", "aux", "en", "pour"]);
function _tokens(x: string): string[] {
  return String(x).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((t) => t && !_STOP.has(t));
}
type ResRow = { id: string; nom: string; stock?: number };
// Trouve LA ressource correspondant à un ingrédient (match sûr, sinon null).
function _matchRes(ing: string, ressources: ResRow[]): ResRow | null {
  const n = _norm(ing);
  const exact = ressources.filter((r) => _norm(r.nom) === n);
  if (exact.length === 1) return exact[0];
  const it = _tokens(ing);
  if (!it.length) return null;
  const cand = ressources.filter((r) => { const rt = new Set(_tokens(r.nom)); return it.every((t) => rt.has(t)); });
  if (cand.length === 1) return cand[0];
  if (cand.length > 1) {
    const starts = cand.filter((r) => { const rn = _norm(r.nom); return rn.startsWith(n) || n.startsWith(rn); });
    const pool = (starts.length ? starts : cand).slice().sort((a, b) => _tokens(a.nom).length - _tokens(b.nom).length);
    if (pool.length === 1 || _tokens(pool[0].nom).length !== _tokens(pool[1].nom).length) return pool[0];
  }
  return null;
}
// Décompte des ressources d'une recette (× n unités) à la vente. Best-effort :
// ne descend jamais sous 0, ignore les ingrédients introuvables au catalogue.
async function _consommerRecetteLignes(admin: ReturnType<typeof createAdminClient>, recette: { ingredient?: string; qte?: number }[], n: number): Promise<void> {
  if (!admin) return;
  const lignes = (Array.isArray(recette) ? recette : []).filter((l) => l && String(l.ingredient || "").trim() && Number(l.qte) > 0);
  if (!lignes.length || n <= 0) return;
  const { data } = await admin.from("ArmurerieRessource").select("id,nom,stock");
  const rs: ResRow[] = (Array.isArray(data) ? data : []).map((r) => ({ id: String((r as { id: string }).id), nom: String((r as { nom: string }).nom), stock: Number((r as { stock?: number }).stock) || 0 }));
  for (const l of lignes) {
    const r = _matchRes(String(l.ingredient), rs);
    if (!r) continue;
    const besoin = Math.max(0, Math.round(Number(l.qte) * n));
    const nv = Math.max(0, (Number(r.stock) || 0) - besoin);
    await admin.from("ArmurerieRessource").update({ stock: nv }).eq("id", r.id);
    r.stock = nv; // maj du cache si la même ressource revient dans la recette
  }
}
export async function fabriquerProduit(produitId: string, qte: number): Promise<ArmResult & { q?: number; consommes?: string[]; ignores?: string[]; manques?: string[] }> {
  const q = Math.max(1, Math.round(Number(qte) || 0));
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  // Produit + recette (résilient si la colonne recette n'est pas migrée).
  let pr = await admin.from("ArmurerieProduit").select("id,nom,stock,aLaDemande,recette").eq("id", produitId).maybeSingle();
  if (pr.error && /recette/i.test(pr.error.message)) pr = await admin.from("ArmurerieProduit").select("id,nom,stock,aLaDemande").eq("id", produitId).maybeSingle();
  const prod = pr.data as { id: string; nom: string; stock: number; aLaDemande: boolean; recette?: unknown } | null;
  if (!prod) return { ok: false, error: "Produit introuvable." };
  const recette = Array.isArray(prod.recette) ? (prod.recette as { ingredient?: string; qte?: number }[]) : [];
  const lignes = recette.filter((l) => l && String(l.ingredient || "").trim() && Number(l.qte) > 0);
  if (!lignes.length) return { ok: false, error: "Ce produit n'a pas de recette — impossible de fabriquer." };
  // Ressources + stock (résilient si la colonne stock n'est pas migrée).
  let rr = await admin.from("ArmurerieRessource").select("id,nom,stock");
  const stockActif = !(rr.error && /stock/i.test(rr.error.message));
  if (!stockActif) rr = await admin.from("ArmurerieRessource").select("id,nom");
  const ressources = (rr.data || []) as ResRow[];
  // 1) Planifier : associer chaque ingrédient à sa ressource, calculer le besoin.
  const plan: { r: ResRow; besoin: number }[] = [];
  const ignores: string[] = [];
  for (const l of lignes) {
    const besoin = Math.max(0, Math.round(Number(l.qte) * q));
    if (!besoin) continue;
    const r = _matchRes(String(l.ingredient), ressources);
    if (!r) { ignores.push(`${l.ingredient} ×${besoin}`); continue; }
    if (!stockActif) { ignores.push(`${r.nom} ×${besoin}`); continue; }
    plan.push({ r, besoin });
  }
  // 2) Bloquer si une ressource suivie n'a pas assez de stock (rien n'est déduit).
  const manques = plan.filter((p) => (Number(p.r.stock) || 0) < p.besoin).map((p) => `${p.r.nom} (besoin ${p.besoin}, dispo ${Number(p.r.stock) || 0})`);
  if (manques.length) return { ok: false, error: `Fabrication impossible — stock de ressources insuffisant : ${manques.join(", ")}.`, manques };
  // 3) Appliquer : déduire les ressources, puis ajouter le produit fini.
  const consommes: string[] = [];
  for (const p of plan) {
    const dispo = Number(p.r.stock) || 0;
    const { error } = await admin.from("ArmurerieRessource").update({ stock: Math.max(0, dispo - p.besoin) }).eq("id", p.r.id);
    if (error) return { ok: false, error: `Erreur lors de la déduction de ${p.r.nom}.`, consommes };
    p.r.stock = dispo - p.besoin;
    consommes.push(`${p.r.nom} −${p.besoin}`);
  }
  if (!prod.aLaDemande) await admin.from("ArmurerieProduit").update({ stock: Math.max(0, (Number(prod.stock) || 0) + q) }).eq("id", produitId);
  return { ok: true, q, consommes, ignores, manques: [] };
}

// ── Carnet de commande (bons de commande client) ─────────────────
type LigneCmd = { objet: string; qte: number; prixUnitaire: number };
function _nettoyerLignes(lignes: unknown): { lignes: LigneCmd[]; total: number } {
  const arr = Array.isArray(lignes) ? lignes : [];
  const out: LigneCmd[] = [];
  let total = 0;
  for (const l of arr) {
    const o = (l || {}) as Record<string, unknown>;
    const objet = String(o.objet ?? "").trim().slice(0, 120);
    const qte = Math.max(0, Math.round(Number(o.qte) || 0));
    const prixUnitaire = Math.max(0, round2(Number(o.prixUnitaire) || 0));
    if (!objet && !qte) continue;
    out.push({ objet: objet || "Article", qte, prixUnitaire });
    total += qte * prixUnitaire;
  }
  return { lignes: out, total: round2(total) };
}
export async function creerCommande(d: { categorie?: string; clientNom: string; clientPrenom?: string; lignes: LigneCmd[]; statut?: string; notes?: string }): Promise<ArmResult> {
  if (!d.clientNom || d.clientNom.trim().length < 2) return { ok: false, error: "Indique le nom du client." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { lignes, total } = _nettoyerLignes(d.lignes);
  if (!lignes.length) return { ok: false, error: "Ajoute au moins un objet à la commande." };
  const id = newId("cmd");
  const { error } = await admin.from("ArmurerieCommande").insert({
    id, categorie: s(d.categorie, 80), clientNom: s(d.clientNom, 120), clientPrenom: s(d.clientPrenom, 120),
    lignes, total, statut: s(d.statut, 40) || "en_attente", notes: s(d.notes, 1000),
  });
  if (error) return { ok: false, error: tableErr(error.message, "commandes") };
  return { ok: true, id };
}
export async function majCommande(id: string, d: { categorie?: string; clientNom?: string; clientPrenom?: string; lignes?: LigneCmd[]; statut?: string; notes?: string }): Promise<ArmResult> {
  if (!id) return { ok: false, error: "Commande introuvable." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const up: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if ("categorie" in d) up.categorie = s(d.categorie, 80);
  if ("clientNom" in d) up.clientNom = s(d.clientNom, 120);
  if ("clientPrenom" in d) up.clientPrenom = s(d.clientPrenom, 120);
  if ("statut" in d) up.statut = s(d.statut, 40);
  if ("notes" in d) up.notes = s(d.notes, 1000);
  if ("lignes" in d) { const { lignes, total } = _nettoyerLignes(d.lignes); up.lignes = lignes; up.total = total; }
  const { error } = await admin.from("ArmurerieCommande").update(up).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}
export async function marquerCommande(id: string, statut: string): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { error } = await admin.from("ArmurerieCommande").update({ statut: s(statut, 40) || "en_attente", updatedAt: new Date().toISOString() }).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}
export async function supprimerCommande(id: string): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { error } = await admin.from("ArmurerieCommande").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}
