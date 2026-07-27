"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";
import { peutModifierStock } from "@/lib/dispensaire-roles";
import { emettreEvenementDispensaire, lireAvant } from "@/lib/dispensaire-evenements";
import { idAvecJeton, estDoublon } from "@/lib/dispensaire-idempotence";
import { parseIngredients } from "@/lib/dispensaire-fabrication-const";

// Fabrication — réservé aux grades disposant du droit « stock ».
export type FabResult = { ok: boolean; error?: string; id?: string; produit?: number };
const REFUS = "Accès refusé : ton grade ne permet pas de gérer la fabrication.";

const s = (v: unknown, max = 200) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
const n = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
function newId() { return `drec-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
function newMvtId() { return `dsm-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
async function qui() { try { return (await getSessionProfile())?.nom || "Équipe"; } catch { return "Équipe"; } }

export async function creerRecette(data: Record<string, unknown>): Promise<FabResult> {
  if (!(await peutModifierStock())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const nom = s(data.nom);
  if (!nom) return { ok: false, error: "Donne un nom à la recette." };
  const produitNom = s(data.produitNom);
  const produitStockId = s(data.produitStockId);
  if (!produitStockId || !produitNom) return { ok: false, error: "Choisis l'article de stock produit." };
  const ingredients = parseIngredients(data.ingredients);
  if (!ingredients.length) return { ok: false, error: "Ajoute au moins une matière première." };
  const rendement = Math.max(1, n(data.rendement) || 1);
  const id = idAvecJeton("drec", data.cle, newId);
  const now = new Date().toISOString();
  const row = { id, nom, produitNom, produitStockId, rendement, ingredients: JSON.stringify(ingredients), note: s(data.note, 500), updatedBy: await qui(), updatedAt: now, createdAt: now };
  const { error } = await admin.from("DispensaireRecette").insert(row);
  if (error) {
    if (estDoublon(error)) return { ok: true, id };
    return { ok: false, error: "Création impossible (lance dispensaire-fabrication.sql ?)." };
  }
  await emettreEvenementDispensaire({ aggregate: "fabrication", type: "fabrication.recette_creee", cibleId: id, cibleLibelle: nom, apres: { nom, produitNom, rendement, ingredients } });
  return { ok: true, id };
}

export async function supprimerRecette(id: string): Promise<FabResult> {
  if (!(await peutModifierStock())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const avant = await lireAvant("DispensaireRecette", id);
  const { error } = await admin.from("DispensaireRecette").delete().eq("id", id);
  if (error) return { ok: false, error: "Suppression impossible." };
  await emettreEvenementDispensaire({ aggregate: "fabrication", type: "fabrication.recette_supprimee", cibleId: id, cibleLibelle: String(avant?.nom ?? ""), avant });
  return { ok: true };
}

// Fabrique `lots` fois la recette : vérifie la disponibilité, consomme les
// matières, produit l'article de stock, trace le mouvement + l'événement.
export async function fabriquer(recetteId: string, lots: number): Promise<FabResult> {
  if (!(await peutModifierStock())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const rec = await lireAvant("DispensaireRecette", recetteId);
  if (!rec) return { ok: false, error: "Recette introuvable." };
  const nbLots = Math.max(1, n(lots) || 1);
  const ingredients = parseIngredients(rec.ingredients);
  if (!ingredients.length) return { ok: false, error: "Recette sans ingrédient." };
  const produitStockId = rec.produitStockId ? String(rec.produitStockId) : "";
  if (!produitStockId) return { ok: false, error: "Recette non liée à un article de stock." };

  // 1) Vérifie la disponibilité de TOUTES les matières avant de rien modifier.
  const besoins: { matiere: Record<string, unknown>; besoin: number; nom: string }[] = [];
  const manque: string[] = [];
  for (const ing of ingredients) {
    const { data } = await admin.from("DispensaireMatiere").select("id,nom,quantite").eq("id", ing.matiereId).maybeSingle();
    const m = data as Record<string, unknown> | null;
    const dispo = m ? Number(m.quantite) || 0 : 0;
    const besoin = ing.quantite * nbLots;
    if (!m || dispo < besoin) manque.push(`${ing.nom || (m ? String(m.nom) : "?")} : ${dispo}/${besoin}`);
    else besoins.push({ matiere: m, besoin, nom: ing.nom || String(m.nom) });
  }
  if (manque.length) return { ok: false, error: `Matières insuffisantes — ${manque.join(" ; ")}.` };

  const par = await qui();
  const now = new Date().toISOString();

  // 2) Consomme les matières.
  for (const b of besoins) {
    const apres = Math.max(0, (Number(b.matiere.quantite) || 0) - b.besoin);
    await admin.from("DispensaireMatiere").update({ quantite: apres, updatedBy: par, updatedAt: now }).eq("id", String(b.matiere.id));
  }

  // 3) Produit l'article de stock (+ mouvement tracé).
  const { data: prodRow } = await admin.from("DispensaireStock").select("id,nom,stock,coffre").eq("id", produitStockId).maybeSingle();
  if (!prodRow) return { ok: false, error: "Article de stock produit introuvable (a-t-il été supprimé ?)." };
  const pr = prodRow as Record<string, unknown>;
  const produit = (Math.max(1, Number(rec.rendement) || 1)) * nbLots;
  const stockApres = (Number(pr.stock) || 0) + produit;
  await admin.from("DispensaireStock").update({ stock: stockApres, updatedBy: par, updatedAt: now }).eq("id", produitStockId);
  await admin.from("DispensaireStockMouvement").insert({ id: newMvtId(), stockId: produitStockId, nomItem: String(pr.nom || "?"), coffre: (pr.coffre as string) ?? null, delta: produit, apres: stockApres, motif: `Fabrication — ${String(rec.nom || "recette")}`, par, createdAt: now });

  await emettreEvenementDispensaire({ aggregate: "fabrication", type: "fabrication.produite", cibleId: recetteId, cibleLibelle: String(rec.nom ?? ""), apres: { produit: String(pr.nom || rec.produitNom), quantite: produit, lots: nbLots, ingredients: besoins.map((b) => ({ nom: b.nom, consomme: b.besoin })) } });
  return { ok: true, produit };
}
