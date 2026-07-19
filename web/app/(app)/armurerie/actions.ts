"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { envoyerCommande } from "@/lib/commandes";

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
  const m = Math.abs(Math.round(Number(montant) || 0));
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
    prix: Math.max(0, Math.round(Number(d.prix) || 0)), notes: s(d.notes, 1000), statut: "enregistree",
  });
  if (error) return { ok: false, error: tableErr(error.message, "ventes") };
  // Crédite automatiquement le coffre de l'armurerie du montant de la vente.
  const prix = Math.max(0, Math.round(Number(d.prix) || 0));
  if (prix > 0) {
    const arme = [s(d.marque, 80), s(d.modele, 80)].filter(Boolean).join(" ") || "arme";
    try { await _mouvementCoffre(admin, prix, "entree", `Vente — ${arme} à ${s(d.acquereur, 120)}`, s(d.vendeur, 120) || (await auteurNom())); } catch {}
  }
  return { ok: true, id };
}

// Dépôt / retrait manuel sur le coffre de l'armurerie.
export async function ajusterCoffreArmurerie(montant: number, mode: "depot" | "retrait", motif: string): Promise<ArmResult> {
  const m = Math.abs(Math.round(Number(montant) || 0));
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
  if ("prix" in patch) up.prix = Math.max(0, Math.round(Number(patch.prix) || 0));
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
    arme: s(d.arme, 120), numeroSerie: s(d.numeroSerie, 80), prix: Math.max(0, Math.round(Number(d.prix) || 0)),
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
export async function creerProduit(d: { nom: string; categorie?: string; prix?: number; cout?: number; stock?: number; aLaDemande?: boolean }): Promise<ArmResult> {
  if (!d.nom || d.nom.trim().length < 1) return { ok: false, error: "Nom du produit requis." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const id = newId("prd");
  const { error } = await admin.from("ArmurerieProduit").insert({
    id, nom: s(d.nom, 120), categorie: s(d.categorie, 60) || "Divers",
    prix: Math.max(0, Math.round(Number(d.prix) || 0)), cout: Math.max(0, Math.round(Number(d.cout) || 0)),
    stock: Math.max(0, Math.round(Number(d.stock) || 0)), aLaDemande: !!d.aLaDemande,
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
  if ("prix" in patch) up.prix = Math.max(0, Math.round(Number(patch.prix) || 0));
  if ("cout" in patch) up.cout = Math.max(0, Math.round(Number(patch.cout) || 0));
  if ("stock" in patch) up.stock = Math.max(0, Math.round(Number(patch.stock) || 0));
  if ("aLaDemande" in patch) up.aLaDemande = !!patch.aLaDemande;
  const { error } = await admin.from("ArmurerieProduit").update(up).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}
export async function supprimerProduit(id: string): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { error } = await admin.from("ArmurerieProduit").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}

// Catalogue type RDR2 (prix de référence) — importé en un clic si le catalogue est vide.
const CATALOGUE: { nom: string; cat: string; prix: number; aLaDemande?: boolean }[] = [
  { nom: "Fusil à verrou", cat: "Fusils", prix: 300 }, { nom: "Fusil à répétition", cat: "Fusils", prix: 215 },
  { nom: "Fusil à pompe", cat: "Fusils", prix: 275 }, { nom: "Fusil double canon", cat: "Fusils", prix: 200 },
  { nom: "Fusil springfield", cat: "Fusils", prix: 230 }, { nom: "Fusil éléphant", cat: "Fusils", prix: 400 },
  { nom: "Carabine Litchfield", cat: "Carabines", prix: 130 }, { nom: "Carabine Lancaster", cat: "Carabines", prix: 150 },
  { nom: "Carabine Evans", cat: "Carabines", prix: 140 }, { nom: "Carabine à répétition", cat: "Carabines", prix: 50 },
  { nom: "Pistolet Mauser", cat: "Pistolets", prix: 75 }, { nom: "Pistolet Volcanic", cat: "Pistolets", prix: 60 },
  { nom: "Pistolet 1899", cat: "Pistolets", prix: 85 }, { nom: "Canon scié", cat: "Pistolets", prix: 70 },
  { nom: "Revolver Cattleman", cat: "Revolvers", prix: 17 }, { nom: "Revolver Navy", cat: "Revolvers", prix: 80 },
  { nom: "Revolver Schofield", cat: "Revolvers", prix: 50 }, { nom: "Revolver LeMat", cat: "Revolvers", prix: 90 },
  { nom: "Revolver Double Action", cat: "Revolvers", prix: 20 },
  { nom: "Boîte de munitions de Revolver", cat: "Munitions", prix: 5 }, { nom: "Boîte de munitions de Pistolet", cat: "Munitions", prix: 5 },
  { nom: "Boîte de munitions de Carabine", cat: "Munitions", prix: 5 }, { nom: "Boîte de munitions de Fusil", cat: "Munitions", prix: 5 },
  { nom: "Boîte de munitions de Pompe", cat: "Munitions", prix: 5 },
  { nom: "Jumelles", cat: "Matériel", prix: 5 }, { nom: "Lanterne", cat: "Matériel", prix: 5 },
  { nom: "Menottes", cat: "Matériel", prix: 3 }, { nom: "Lasso", cat: "Matériel", prix: 5 },
  { nom: "Couteau", cat: "Divers", prix: 5 }, { nom: "Hachette", cat: "Divers", prix: 6 },
  { nom: "Arc", cat: "Divers", prix: 10, aLaDemande: true }, { nom: "Carquois", cat: "Divers", prix: 2, aLaDemande: true },
  { nom: "Pack Chasseur", cat: "Divers", prix: 18 },
];
export async function importerCatalogue(): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const rows = CATALOGUE.map((p) => ({ id: newId("prd"), nom: p.nom, categorie: p.cat, prix: p.prix, cout: 0, stock: 0, aLaDemande: !!p.aLaDemande }));
  const { error } = await admin.from("ArmurerieProduit").insert(rows);
  if (error) return { ok: false, error: tableErr(error.message, "produits") };
  return { ok: true };
}

// ── Caisse (point de vente) ──────────────────────────────────────
export type LigneCaisse = { produitId?: string; nom: string; categorie?: string; prix: number; cout?: number; qte: number; aLaDemande?: boolean };
export async function validerCaisse(lignes: LigneCaisse[], client: string, notes: string): Promise<ArmResult & { total?: number }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const items = (Array.isArray(lignes) ? lignes : []).filter((l) => l && Number(l.qte) > 0);
  if (!items.length) return { ok: false, error: "Le panier est vide." };
  const nom = await auteurNom();
  const dateV = new Date().toLocaleDateString("fr-FR");
  const cli = s(client, 120) || "Client de passage";
  let total = 0;
  try {
    for (const l of items) {
      const q = Math.max(1, Math.round(Number(l.qte) || 1));
      const montant = Math.max(0, Math.round((Number(l.prix) || 0) * q));
      total += montant;
      await admin.from("ArmurerieVente").insert({
        id: newId("vte"), acquereur: cli, dateVente: dateV, marque: s(l.nom, 80), modele: null,
        categorie: s(l.categorie, 60), numeroSerie: `VTE-${Date.now().toString(36).slice(-4)}`,
        vendeur: nom, prix: montant, notes: s(notes, 1000), statut: "enregistree",
      });
      if (l.produitId && !l.aLaDemande) {
        const { data } = await admin.from("ArmurerieProduit").select("stock").eq("id", l.produitId).maybeSingle();
        if (data) await admin.from("ArmurerieProduit").update({ stock: Math.max(0, (Number((data as { stock: number }).stock) || 0) - q) }).eq("id", l.produitId);
      }
      try { await _mouvementCoffre(admin, montant, "entree", `Vente : ${s(l.nom, 80)} ×${q} — ${cli}`, nom); } catch { /* vente enregistrée même si le coffre n'est pas prêt */ }
    }
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
    salaireBase: Math.max(0, Math.round(Number(d.salaireBase) || 0)), actif: true,
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
  if ("salaireBase" in patch) up.salaireBase = Math.max(0, Math.round(Number(patch.salaireBase) || 0));
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
  const commission = Math.max(0, Math.round(Number(d.commission) || 0));
  const base = Math.max(0, Math.round(Number(d.base) || 0));
  const prime = Math.max(0, Math.round(Number(d.prime) || 0));
  const montant = commission + base + prime;
  const id = newId("pay");
  const { error } = await admin.from("ArmureriePaie").insert({
    id, employeId: s(d.employeId, 60), employeNom: s(d.employeNom, 120), periode: s(d.periode, 80),
    ventes: Math.max(0, Math.round(Number(d.ventes) || 0)), commission, base, prime, montant,
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
  const montant = Math.max(0, Math.round(Number(p.montant) || 0));
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
  const ca = Math.max(0, Math.round(Number(d.chiffreAffaires) || 0));
  const taux = Math.max(0, Math.min(100, Math.round(Number(d.taux) || 0)));
  const montant = Math.round((ca * taux) / 100);
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
  const montant = Math.max(0, Math.round(Number(im.montant) || 0));
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
  const m = Math.abs(Math.round(Number(montant) || 0));
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
