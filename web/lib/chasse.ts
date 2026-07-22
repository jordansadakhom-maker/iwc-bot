import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getPole, type PoleWeb } from "@/lib/queries";

// ── Types du module Chasse (partagés serveur ↔ client) ──────────
export type ChasseZone = { id: string; nom: string; capacite: number | null; ordre: number };
export type ChasseStockRow = { id: string; zoneId: string; nom: string; quantite: number; seuil: number | null; categorie: string | null; updatedAt: string | null };
export type ChasseMouvementRow = {
  id: string; createdAt: string | null; zoneId: string; cibleZoneId: string | null;
  nom: string; type: string; delta: number; avant: number | null; apres: number | null;
  par: string | null; commentaire: string | null;
};
export type ChasseData = {
  connecte: boolean;
  pret: boolean; // les tables existent (migration chasse.sql passée)
  pole: PoleWeb;
  zones: ChasseZone[];
  stock: ChasseStockRow[];
  mouvements: ChasseMouvementRow[];
};

// Deux charrettes par défaut si la table "ChasseZone" est encore vide : le module
// reste utilisable même avant d'avoir renseigné les zones/capacités.
const ZONES_DEFAUT: ChasseZone[] = [
  { id: "c1", nom: "Charette", capacite: null, ordre: 1 },
  { id: "c2", nom: "Charette de chasse", capacite: null, ordre: 2 },
];

type Raw = Record<string, unknown>;
const num = (v: unknown) => (v == null ? null : Number(v));

// InventoryService (lecture) — état complet du module en un seul appel.
export async function getChasse(): Promise<ChasseData> {
  const vide: ChasseData = { connecte: false, pret: false, pole: "iwc", zones: ZONES_DEFAUT, stock: [], mouvements: [] };
  const admin = createAdminClient();
  if (!admin) return vide;

  const pole = await getPole();
  const [zR, sR, mR] = await Promise.all([
    admin.from("ChasseZone").select("*").order("ordre", { ascending: true }),
    admin.from("ChasseStock").select("*"),
    admin.from("ChasseMouvement").select("*").order("createdAt", { ascending: false }).limit(80),
  ]);

  // La table n'existe pas encore → module « pas prêt » (l'UI invite à lancer le SQL).
  const pret = !zR.error && !sR.error;
  if (!pret) return { ...vide, connecte: true, pole };

  const zonesRaw = ((zR.data || []) as Raw[]).map((z) => ({
    id: String(z.id), nom: String(z.nom || z.id), capacite: num(z.capacite), ordre: Number(z.ordre) || 0,
  }));
  const zones = zonesRaw.length ? zonesRaw.sort((a, b) => a.ordre - b.ordre) : ZONES_DEFAUT;

  const stock: ChasseStockRow[] = ((sR.data || []) as Raw[]).map((s) => ({
    id: String(s.id), zoneId: String(s.zoneId), nom: String(s.nom || "Ressource"),
    quantite: Number(s.quantite) || 0, seuil: num(s.seuil), categorie: (s.categorie as string) ?? null,
    updatedAt: (s.updatedAt as string) ?? null,
  }));

  const mouvements: ChasseMouvementRow[] = mR.error ? [] : ((mR.data || []) as Raw[]).map((m) => ({
    id: String(m.id), createdAt: (m.createdAt as string) ?? null, zoneId: String(m.zoneId),
    cibleZoneId: (m.cibleZoneId as string) ?? null, nom: String(m.nom || ""), type: String(m.type || "ajout"),
    delta: Number(m.delta) || 0, avant: num(m.avant), apres: num(m.apres),
    par: (m.par as string) ?? null, commentaire: (m.commentaire as string) ?? null,
  }));

  return { connecte: true, pret: true, pole, zones, stock, mouvements };
}
