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
async function _mouvementCoffre(admin: Admin, montant: number, sens: "entree" | "sortie", motif: string, auteur: string) {
  const m = Math.abs(round2(Number(montant) || 0));
  if (!m) return;
  const { data, error: eLire } = await admin.from("ArmurerieCoffre").select("solde").eq("id", "vanhorn").maybeSingle();
  if (eLire) throw new Error(eLire.message);
  const actuel = data ? Number((data as { solde: number }).solde) || 0 : 0;
  const nouveau = Math.max(0, sens === "sortie" ? actuel - m : actuel + m);
  const { error: eUp } = await admin.from("ArmurerieCoffre").upsert({ id: "vanhorn", solde: nouveau, updatedAt: new Date().toISOString() }, { onConflict: "id" });
  if (eUp) throw new Error(eUp.message);
  const { error: eJ } = await admin.from("ArmurerieMouvementCoffre").insert({ id: newId("mvt"), sens, montant: m, motif: s(motif, 200), auteur: s(auteur, 120), createdAt: new Date().toISOString() });
  if (eJ) throw new Error(eJ.message);
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
export async function creerVente(d: { clientId?: string; acquereur: string; dateVente?: string; marque?: string; modele?: string; categorie?: string; numeroSerie?: string; vendeur?: string; telegramme?: string; prix?: number; notes?: string }): Promise<ArmResult> {
  if (!d.acquereur || d.acquereur.trim().length < 2) return { ok: false, error: "Nom de l'acquéreur requis (Décret N°2)." };
  if (!d.numeroSerie || d.numeroSerie.trim().length < 1) return { ok: false, error: "Le n° de série est obligatoire (Décret N°2)." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const id = newId("vte");
  const { error } = await admin.from("ArmurerieVente").insert({
    id, clientId: s(d.clientId, 60), acquereur: s(d.acquereur, 120),
    dateVente: s(d.dateVente, 40) || new Date().toLocaleDateString("fr-FR"),
    marque: s(d.marque, 80), modele: s(d.modele, 80), categorie: s(d.categorie, 60),
    numeroSerie: s(d.numeroSerie, 80), vendeur: s(d.vendeur, 120), telegramme: s(d.telegramme, 60),
    prix: Math.max(0, round2(Number(d.prix) || 0)), notes: s(d.notes, 1000), statut: "enregistree",
  });
  if (error) return { ok: false, error: tableErr(error.message, "ventes") };
  // Crédite automatiquement le coffre de l'armurerie du montant de la vente.
  const prix = Math.max(0, round2(Number(d.prix) || 0));
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
  if ("prix" in patch) up.prix = Math.max(0, round2(Number(patch.prix) || 0));
  const { error } = await admin.from("ArmurerieVente").update(up).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
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
  const { error } = await admin.from("ArmurerieProduit").insert({
    id, nom: s(d.nom, 120), categorie: s(d.categorie, 60) || "Divers",
    prix: Math.max(0, round2(Number(d.prix) || 0)), cout: Math.max(0, round2(Number(d.cout) || 0)),
    stock: Math.max(0, Math.round(Number(d.stock) || 0)), aLaDemande: !!d.aLaDemande,
    niveau: Math.max(0, Math.min(3, Math.round(Number(d.niveau) || 0))), recette: _nettoyerRecette(d.recette),
  });
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
  const { error } = await admin.from("ArmurerieProduit").update(up).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}
export async function supprimerProduit(id: string): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { error } = await admin.from("ArmurerieProduit").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}

// Catalogue officiel de l'armurerie (prix de vente client) — importé en un clic.
const CATALOGUE: { nom: string; cat: string; prix: number; niveau?: number }[] = [
  // Revolvers
  { nom: "Revolver Cattleman", cat: "Revolvers", prix: 17, niveau: 0 },
  { nom: "Revolver Cattleman Mexican", cat: "Revolvers", prix: 20, niveau: 1 },
  { nom: "Revolver Double Action", cat: "Revolvers", prix: 20, niveau: 0 },
  { nom: "Revolver Schofield", cat: "Revolvers", prix: 50, niveau: 1 },
  { nom: "Revolver Navy", cat: "Revolvers", prix: 80, niveau: 1 },
  { nom: "Revolver LeMat", cat: "Revolvers", prix: 90, niveau: 2 },
  // Pistolets
  { nom: "Pistolet Volcanic", cat: "Pistolets", prix: 60, niveau: 1 },
  { nom: "Pistolet semi-automatique", cat: "Pistolets", prix: 70, niveau: 2 },
  { nom: "Canon scié", cat: "Pistolets", prix: 70, niveau: 3 },
  { nom: "Pistolet Mauser", cat: "Pistolets", prix: 75, niveau: 1 },
  { nom: "Pistolet 1899", cat: "Pistolets", prix: 85, niveau: 2 },
  // Carabines
  { nom: "Carabine à répétition", cat: "Carabines", prix: 50, niveau: 2 },
  { nom: "Carabine Litchfield", cat: "Carabines", prix: 130, niveau: 2 },
  { nom: "Carabine Evans", cat: "Carabines", prix: 140, niveau: 2 },
  { nom: "Carabine Lancaster", cat: "Carabines", prix: 150, niveau: 2 },
  // Fusils
  { nom: "Fusil à petit gibier", cat: "Fusils", prix: 50, niveau: 0 },
  { nom: "Fusil double canon", cat: "Fusils", prix: 200, niveau: 2 },
  { nom: "Fusil double canon exotique", cat: "Fusils", prix: 200, niveau: 2 },
  { nom: "Fusil à répétition", cat: "Fusils", prix: 215, niveau: 2 },
  { nom: "Fusil springfield", cat: "Fusils", prix: 230, niveau: 3 },
  { nom: "Fusil semi-automatique", cat: "Fusils", prix: 250, niveau: 1 },
  { nom: "Fusil à pompe", cat: "Fusils", prix: 275, niveau: 2 },
  { nom: "Fusil à verrou", cat: "Fusils", prix: 300, niveau: 3 },
  { nom: "Fusil éléphant", cat: "Fusils", prix: 400, niveau: 3 },
  // Corps à corps
  { nom: "Hachette de chasseur", cat: "Corps à corps", prix: 4, niveau: 0 },
  { nom: "Couteau de lancé", cat: "Corps à corps", prix: 4, niveau: 0 },
  { nom: "Couteau", cat: "Corps à corps", prix: 5, niveau: 0 },
  { nom: "Hachette", cat: "Corps à corps", prix: 6, niveau: 0 },
  // Matériel
  { nom: "Carquois", cat: "Matériel", prix: 2, niveau: 0 },
  { nom: "Menottes", cat: "Matériel", prix: 3, niveau: 0 },
  { nom: "Jumelles", cat: "Matériel", prix: 5, niveau: 0 },
  { nom: "Lanterne", cat: "Matériel", prix: 5, niveau: 0 },
  { nom: "Lasso", cat: "Matériel", prix: 5, niveau: 0 },
  { nom: "Ceinture Hachette", cat: "Matériel", prix: 8, niveau: 0 },
  { nom: "Ceinture Couteau de lancé", cat: "Matériel", prix: 10, niveau: 0 },
  { nom: "Ceinture Hachette de chasseur", cat: "Matériel", prix: 10, niveau: 0 },
  { nom: "Jumelles Améliorées", cat: "Matériel", prix: 10, niveau: 1 },
  { nom: "Lasso Amélioré", cat: "Matériel", prix: 10, niveau: 1 },
  // Packs
  { nom: "Pack Chasseur", cat: "Packs", prix: 18, niveau: 0 },
  { nom: "Pack L'arrivant", cat: "Packs", prix: 25, niveau: 0 },
  { nom: "Pack chasseur ultime", cat: "Packs", prix: 35, niveau: 0 },
  { nom: "Pack Guerrier", cat: "Packs", prix: 95, niveau: 0 },
  // Matières & divers
  { nom: "Laiton", cat: "Matières", prix: 3.52, niveau: 0 },
  { nom: "Pièce d'arme", cat: "Matières", prix: 0, niveau: 0 },
  { nom: "Don", cat: "Divers", prix: 0, niveau: 0 },
];
export async function importerCatalogue(): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const rows = CATALOGUE.map((p) => ({ id: newId("prd"), nom: p.nom, categorie: p.cat, prix: round2(p.prix), cout: 0, stock: 0, aLaDemande: false, niveau: p.niveau || 0 }));
  const { error } = await admin.from("ArmurerieProduit").insert(rows);
  if (error) return { ok: false, error: tableErr(error.message, "produits") };
  return { ok: true };
}

// ── Recettes de craft (ingrédients requis par arme/objet) ────────
// Noms d'ingrédients canoniques : Bois, Pièce d'arme, Charbon, Lingot fer,
// Lingot zinc, Verre, Cordes. [nom produit, [[ingrédient, quantité], …]]
const RECETTES: [string, [string, number][]][] = [
  ["Ceinture Couteau de lancé", [["Bois", 5], ["Lingot fer", 3]]],
  ["Couteau", [["Bois", 2], ["Lingot fer", 2]]],
  ["Couteau de lancé", [["Bois", 2], ["Lingot fer", 2]]],
  ["Hachette", [["Bois", 3], ["Lingot fer", 5]]],
  ["Hachette de chasseur", [["Bois", 3], ["Lingot fer", 5]]],
  ["Ceinture Hachette", [["Bois", 3], ["Lingot fer", 5]]],
  ["Ceinture Hachette de chasseur", [["Bois", 3], ["Lingot fer", 5]]],
  ["Machette", [["Bois", 2], ["Lingot fer", 5]]],
  ["Lanterne", [["Bois", 1], ["Lingot fer", 1], ["Verre", 1]]],
  ["Lasso", [["Cordes", 4], ["Bois", 4]]],
  ["Lasso Amélioré", [["Cordes", 5], ["Bois", 10]]],
  ["Jumelles", [["Lingot fer", 1], ["Lingot zinc", 1], ["Verre", 1]]],
  ["Jumelles Améliorées", [["Lingot fer", 1], ["Lingot zinc", 2], ["Verre", 2]]],
  ["Revolver Cattleman", [["Bois", 3], ["Pièce d'arme", 3], ["Lingot fer", 1]]],
  ["Revolver Double Action", [["Bois", 3], ["Pièce d'arme", 3], ["Lingot fer", 5]]],
  ["Revolver Schofield", [["Bois", 6], ["Pièce d'arme", 6], ["Charbon", 4], ["Lingot fer", 6]]],
  ["Revolver Navy", [["Bois", 6], ["Pièce d'arme", 6], ["Charbon", 4], ["Lingot fer", 6]]],
  ["Revolver LeMat", [["Bois", 10], ["Pièce d'arme", 10], ["Charbon", 4], ["Lingot fer", 6]]],
  ["Pistolet Volcanic", [["Bois", 8], ["Pièce d'arme", 6], ["Charbon", 4], ["Lingot fer", 4]]],
  ["Pistolet Mauser", [["Bois", 10], ["Pièce d'arme", 6], ["Charbon", 4], ["Lingot fer", 4]]],
  ["Pistolet 1899", [["Bois", 10], ["Pièce d'arme", 8], ["Charbon", 4], ["Lingot fer", 4]]],
  ["Pistolet semi-automatique", [["Bois", 20], ["Pièce d'arme", 20], ["Charbon", 25], ["Lingot fer", 25]]],
  ["Canon scié", [["Bois", 5], ["Pièce d'arme", 5], ["Charbon", 2], ["Lingot fer", 3]]],
  ["Carabine à répétition", [["Bois", 4], ["Pièce d'arme", 4], ["Charbon", 4], ["Lingot fer", 4]]],
  ["Carabine Litchfield", [["Bois", 20], ["Pièce d'arme", 10], ["Charbon", 6], ["Lingot fer", 6]]],
  ["Carabine Evans", [["Bois", 20], ["Pièce d'arme", 10], ["Charbon", 8], ["Lingot fer", 8]]],
  ["Carabine Lancaster", [["Bois", 20], ["Pièce d'arme", 10], ["Charbon", 8], ["Lingot fer", 8]]],
  ["Fusil à petit gibier", [["Bois", 5], ["Pièce d'arme", 5], ["Charbon", 5], ["Lingot fer", 5]]],
  ["Fusil double canon", [["Bois", 20], ["Pièce d'arme", 10], ["Charbon", 20], ["Lingot fer", 20]]],
  ["Fusil double canon exotique", [["Bois", 20], ["Pièce d'arme", 10], ["Charbon", 20], ["Lingot fer", 20]]],
  ["Fusil à répétition", [["Bois", 15], ["Pièce d'arme", 30], ["Charbon", 15], ["Lingot fer", 15]]],
  ["Fusil springfield", [["Bois", 15], ["Pièce d'arme", 15], ["Charbon", 15], ["Lingot fer", 15]]],
  ["Fusil semi-automatique", [["Bois", 20], ["Pièce d'arme", 20], ["Charbon", 25], ["Lingot fer", 25]]],
  ["Fusil à pompe", [["Bois", 20], ["Pièce d'arme", 20], ["Charbon", 30], ["Lingot fer", 30]]],
  ["Fusil à verrou", [["Bois", 35], ["Pièce d'arme", 20], ["Charbon", 20], ["Lingot fer", 20]]],
  ["Fusil éléphant", [["Bois", 35], ["Pièce d'arme", 20], ["Charbon", 20], ["Lingot fer", 20]]],
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
export async function validerCaisse(lignes: LigneCaisse[], client: string, notes: string, clientId?: string): Promise<ArmResult & { total?: number }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const items = (Array.isArray(lignes) ? lignes : []).filter((l) => l && Number(l.qte) > 0);
  if (!items.length) return { ok: false, error: "Le panier est vide." };
  const vendeur = await auteurNom();
  const dateV = new Date().toLocaleDateString("fr-FR");

  // Client fiché → on rattache la vente (photo + télégramme au registre) ; sinon passage.
  let cid: string | null = clientId ? s(clientId, 60) : null;
  let cli = s(client, 120) || "Client de passage";
  let cliTel: string | null = null;
  if (cid) {
    const { data: c } = await admin.from("ArmurerieClient").select("nom,telegramme").eq("id", cid).maybeSingle();
    if (c) { cli = (c as { nom: string }).nom || cli; cliTel = (c as { telegramme: string | null }).telegramme ?? null; }
    else cid = null;
  }

  let total = 0;
  try {
    for (const l of items) {
      const q = Math.max(1, Math.round(Number(l.qte) || 1));
      const montant = Math.max(0, round2((Number(l.prix) || 0) * q));
      total += montant;
      await admin.from("ArmurerieVente").insert({
        id: newId("vte"), clientId: cid, acquereur: cli, dateVente: dateV, marque: s(l.nom, 80), modele: null,
        categorie: s(l.categorie, 60), numeroSerie: `VTE-${Date.now().toString(36).slice(-4)}`,
        vendeur, telegramme: cliTel, prix: montant, notes: s(notes, 1000), statut: "enregistree",
      });
      if (l.produitId && !l.aLaDemande) {
        const { data } = await admin.from("ArmurerieProduit").select("stock").eq("id", l.produitId).maybeSingle();
        if (data) await admin.from("ArmurerieProduit").update({ stock: Math.max(0, (Number((data as { stock: number }).stock) || 0) - q) }).eq("id", l.produitId);
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
    return { ok: true, total };
  } catch (e) {
    const msg = (e as Error).message || "";
    return { ok: false, error: /Armurerie|does not exist/i.test(msg) ? "Tables armurerie manquantes — exécute armurerie-vh.sql." : "Vente impossible pour le moment." };
  }
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
  try { if (montant > 0) await _mouvementCoffre(admin, montant, "sortie", `Paie — ${p.employeNom}`, await auteurNom()); }
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
  try { if (montant > 0) await _mouvementCoffre(admin, montant, "sortie", `Impôt — ${im.libelle || "cycle"}`, await auteurNom()); }
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
export async function ajouterEcriture(montant: number, sens: "entree" | "sortie", motif: string): Promise<ArmResult> {
  const m = Math.abs(round2(Number(montant) || 0));
  if (m <= 0) return { ok: false, error: "Montant invalide." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  try { await _mouvementCoffre(admin, m, sens, s(motif, 200) || (sens === "entree" ? "Recette" : "Dépense"), await auteurNom()); return { ok: true }; }
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
export async function creerRessource(d: { nom: string; categorie?: string; prix?: number; mine?: boolean }): Promise<ArmResult> {
  if (!d.nom || d.nom.trim().length < 1) return { ok: false, error: "Nom de la ressource requis." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const id = newId("res");
  const { error } = await admin.from("ArmurerieRessource").insert({ id, nom: s(d.nom, 120), categorie: s(d.categorie, 60) || "Divers", prix: Math.max(0, round2(Number(d.prix) || 0)), mine: !!d.mine });
  if (error) return { ok: false, error: erpErr(error.message) };
  return { ok: true, id };
}
export async function majRessource(id: string, patch: { nom?: string; categorie?: string; prix?: number; mine?: boolean }): Promise<ArmResult> {
  if (!id) return { ok: false, error: "Ressource introuvable." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const up: Record<string, unknown> = { updatedAt: nowISO() };
  if ("nom" in patch) up.nom = s(patch.nom, 120);
  if ("categorie" in patch) up.categorie = s(patch.categorie, 60);
  if ("prix" in patch) up.prix = Math.max(0, round2(Number(patch.prix) || 0));
  if ("mine" in patch) up.mine = !!patch.mine;
  const { error } = await admin.from("ArmurerieRessource").update(up).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}
export async function supprimerRessource(id: string): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { error } = await admin.from("ArmurerieRessource").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}
// Tarifs des ressources nécessaires (catégorisés). « mine: true » = remise 5 % applicable.
const RESSOURCES: { nom: string; cat: string; prix: number; mine?: boolean }[] = [
  { nom: "Charbon", cat: "Minerais", prix: 0.11, mine: true },
  { nom: "Lingots et verre", cat: "Métaux & verre", prix: 0.88, mine: true },
  { nom: "Cordes", cat: "Textile", prix: 0.48 },
  { nom: "Bois (couteau, cattleman…)", cat: "Bois", prix: 0.22 },
  { nom: "Bois amélioré (grosses armes)", cat: "Bois", prix: 2 },
  { nom: "Carquois", cat: "Composants", prix: 1 },
  { nom: "Arc", cat: "Composants", prix: 7 },
];
export async function importerRessources(): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const rows = RESSOURCES.map((r) => ({ id: newId("res"), nom: r.nom, categorie: r.cat, prix: round2(r.prix), mine: !!r.mine }));
  const { error } = await admin.from("ArmurerieRessource").insert(rows);
  if (error) return { ok: false, error: erpErr(error.message) };
  return { ok: true };
}
// Régler un achat de ressources : la remise ne s'applique QU'AUX ressources de la
// mine, puis on débite le coffre (→ dépense automatique en comptabilité).
export type LigneRessource = { nom: string; qte: number; prix: number; mine?: boolean };
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
    await _mouvementCoffre(admin, net, "sortie", motif.slice(0, 200), await auteurNom());
    return { ok: true, net, brut, remise };
  } catch (e) { return { ok: false, error: erpErr((e as Error).message || "") }; }
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
