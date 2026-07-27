import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { ymdParis } from "@/lib/dispensaire-dates";

// ── Stock intelligent : prévision de rupture (Lot 4) ─────────────────────────
// Dérivé des mouvements de stock existants (aucune nouvelle table) : on mesure la
// consommation réelle des 30 derniers jours pour estimer, par article, la vitesse
// d'écoulement, la date de rupture probable et la quantité à recommander.

export type Urgence = "rupture" | "critique" | "bientot" | "surveiller";
export type Prevision = {
  id: string; nom: string; unite: string | null; coffre: string | null;
  stock: number; consoJour: number; joursRestants: number | null;   // null = épuisé
  dateRupture: string | null; recommande: number; urgence: Urgence;
};
export type PrevisionData = { pret: boolean; fenetreJours: number; items: Prevision[] };

const FENETRE = 30;          // fenêtre d'observation (jours)
const HORIZON = 45;          // au-delà, l'article n'est pas « à surveiller »
const num = (v: unknown) => Number(v) || 0;

function urgenceDe(stock: number, jours: number | null): Urgence {
  if (stock <= 0) return "rupture";
  if (jours == null) return "rupture";
  if (jours <= 3) return "critique";
  if (jours <= 7) return "bientot";
  return "surveiller";
}

export const getPrevisions = cache(async (): Promise<PrevisionData> => {
  const vide: PrevisionData = { pret: false, fenetreJours: FENETRE, items: [] };
  const admin = createAdminClient();
  if (!admin) return vide;

  const depuisIso = new Date(Date.now() - FENETRE * 86400000).toISOString();
  const [stockRes, mvtRes] = await Promise.all([
    admin.from("DispensaireStock").select("id,nom,stock,seuil,stockFixe,unite,coffre"),
    admin.from("DispensaireStockMouvement").select("stockId,delta,createdAt").gte("createdAt", depuisIso).limit(5000),
  ]);
  if (stockRes.error) return vide;

  // Consommation (sorties) par article sur la fenêtre : somme des deltas négatifs.
  const conso = new Map<string, number>();
  for (const m of (mvtRes.data || []) as Record<string, unknown>[]) {
    const d = num(m.delta);
    if (d < 0 && m.stockId) conso.set(String(m.stockId), (conso.get(String(m.stockId)) || 0) + -d);
  }

  const today = ymdParis();
  const items: Prevision[] = [];
  for (const r of (stockRes.data || []) as Record<string, unknown>[]) {
    const id = String(r.id);
    const sortie = conso.get(id) || 0;
    if (sortie <= 0) continue;                          // article sans consommation récente → pas de prévision
    const consoJour = sortie / FENETRE;
    const stock = num(r.stock);
    const joursRestants = consoJour > 0 ? Math.floor(stock / consoJour) : null;
    if (joursRestants != null && joursRestants > HORIZON) continue;   // pas urgent → on n'encombre pas

    // Cible de réappro : stock fixe s'il est défini, sinon 2× seuil, sinon 2 semaines de conso.
    const cible = num(r.stockFixe) > 0 ? num(r.stockFixe) : num(r.seuil) > 0 ? num(r.seuil) * 2 : Math.ceil(consoJour * 14);
    const recommande = Math.max(0, Math.ceil(cible - stock));

    let dateRupture: string | null = null;
    if (joursRestants != null) { const dr = new Date(today + "T12:00:00Z"); dr.setUTCDate(dr.getUTCDate() + joursRestants); dateRupture = dr.toISOString().slice(0, 10); }

    items.push({
      id, nom: String(r.nom || "?"), unite: r.unite == null ? null : String(r.unite), coffre: r.coffre == null ? null : String(r.coffre),
      stock, consoJour: Math.round(consoJour * 10) / 10, joursRestants,
      dateRupture, recommande, urgence: urgenceDe(stock, joursRestants),
    });
  }

  const ordre: Record<Urgence, number> = { rupture: 0, critique: 1, bientot: 2, surveiller: 3 };
  items.sort((a, b) => ordre[a.urgence] - ordre[b.urgence] || (a.joursRestants ?? -1) - (b.joursRestants ?? -1));
  return { pret: true, fenetreJours: FENETRE, items: items.slice(0, 25) };
});
