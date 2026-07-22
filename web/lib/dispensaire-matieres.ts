import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { enRupture, type Matiere, type MatieresData, type Coffre, type CoffresData } from "@/lib/dispensaire-matieres-const";

export * from "@/lib/dispensaire-matieres-const";

const s = (v: unknown) => (v == null ? null : String(v));
const num = (v: unknown) => Number(v) || 0;

export async function getMatieres(): Promise<MatieresData> {
  const vide: MatieresData = { connecte: false, pret: false, canEdit: false, matieres: [], alertes: 0 };
  const admin = createAdminClient();
  if (!admin) return vide;
  const { data, error } = await admin.from("DispensaireMatiere").select("*").order("nom", { ascending: true });
  if (error) return { ...vide, connecte: true, pret: false, canEdit: true };
  const matieres: Matiere[] = ((data || []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), nom: String(r.nom || "Matière"), quantite: num(r.quantite), seuil: num(r.seuil), cible: num(r.cible),
    unite: s(r.unite), fournisseur: s(r.fournisseur), note: s(r.note), updatedAt: s(r.updatedAt), updatedBy: s(r.updatedBy),
  }));
  return { connecte: true, pret: true, canEdit: true, matieres, alertes: matieres.filter(enRupture).length };
}

export async function getCoffres(): Promise<CoffresData> {
  const vide: CoffresData = { connecte: false, pret: false, canEdit: false, coffres: [] };
  const admin = createAdminClient();
  if (!admin) return vide;
  const { data, error } = await admin.from("DispensaireCoffre").select("*").order("nom", { ascending: true });
  if (error) return { ...vide, connecte: true, pret: false, canEdit: true };
  const coffres: Coffre[] = ((data || []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), nom: String(r.nom || "Coffre"), emplacement: s(r.emplacement), responsable: s(r.responsable), note: s(r.note), updatedAt: s(r.updatedAt), updatedBy: s(r.updatedBy),
  }));
  return { connecte: true, pret: true, canEdit: true, coffres };
}

// Noms des coffres (entités) — pour alimenter le sélecteur du Stockage.
export async function getNomsCoffres(): Promise<string[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  const { data, error } = await admin.from("DispensaireCoffre").select("nom").order("nom", { ascending: true });
  if (error) return [];
  return [...new Set(((data || []) as Record<string, unknown>[]).map((r) => String(r.nom || "").trim()).filter(Boolean))];
}
