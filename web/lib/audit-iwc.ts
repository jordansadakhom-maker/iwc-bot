import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// ═══════════════════════════════════════════════════════════════
//  Journal d'audit transversal Iron Wolf — agrège en UN seul fil les
//  mouvements structurés déjà tracés par le site : Chasse, Armurerie
//  (stock + coffre) et le journal du coffre commun. Aucune donnée
//  inventée : on lit et normalise l'existant, on enrichit le grade de
//  l'acteur depuis la table Membre (jointure par nom normalisé).
// ═══════════════════════════════════════════════════════════════

export type AuditCouleur = "ajout" | "retrait" | "modif" | "transfert" | "neutre";
export type AuditItem = {
  id: string;
  at: string | null;
  source: string;        // Chasse · Armurerie · Coffre commun…
  type: string;          // Ajout / Retrait / Transfert / Modification / Dépôt / Suppression…
  couleur: AuditCouleur; // couleur de la ligne
  coffre: string | null; // coffre / zone concerné
  objet: string | null;  // objet concerné
  avant: number | null;
  apres: number | null;
  delta: number | null;
  par: string | null;
  parGrade: string | null;
  commentaire: string | null;
};

type Raw = Record<string, unknown>;
const norm = (x: unknown) => String(x ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const numN = (v: unknown) => (v == null || v === "" ? null : Number(v));
const str = (v: unknown) => (v == null ? null : String(v));

const CHASSE: Record<string, [string, AuditCouleur]> = {
  ajout: ["Ajout", "ajout"], retrait: ["Retrait", "retrait"], transfert: ["Transfert", "transfert"],
  correction: ["Modification", "modif"], suppression: ["Suppression", "retrait"], ocr: ["Import photo", "ajout"],
};

export async function getAuditIWC(): Promise<{ pret: boolean; items: AuditItem[] }> {
  const admin = createAdminClient();
  if (!admin) return { pret: false, items: [] };

  const [chR, stR, coR, invR, zoneR, memR] = await Promise.all([
    admin.from("ChasseMouvement").select("*").order("createdAt", { ascending: false }).limit(700),
    admin.from("ArmurerieMouvementStock").select("*").order("createdAt", { ascending: false }).limit(700),
    admin.from("ArmurerieMouvementCoffre").select("*").order("createdAt", { ascending: false }).limit(700),
    admin.from("InventaireMouvement").select("*").order("createdAt", { ascending: false }).limit(400),
    admin.from("ChasseZone").select("id,nom"),
    admin.from("Membre").select("nomIC,grade"),
  ]);

  const zoneNom = new Map<string, string>();
  for (const z of (zoneR.data || []) as Raw[]) zoneNom.set(String(z.id), String(z.nom || z.id));
  const zn = (id: string | null) => (id ? zoneNom.get(id) ?? id : null);

  const gradeMap = new Map<string, string>();
  for (const m of (memR.data || []) as Raw[]) { const k = norm(m.nomIC); if (k && m.grade) gradeMap.set(k, String(m.grade)); }
  const gr = (par: string | null) => (par ? gradeMap.get(norm(par)) ?? null : null);

  const items: AuditItem[] = [];

  // ── Chasse (mouvements structurés) ──
  if (!chR.error) for (const m of (chR.data || []) as Raw[]) {
    const [label, couleur] = CHASSE[String(m.type || "ajout")] || [String(m.type || "Mouvement"), "neutre"];
    const de = zn(String(m.zoneId));
    const coffre = String(m.type) === "transfert" && m.cibleZoneId ? `${de} → ${zn(String(m.cibleZoneId))}` : de;
    const par = str(m.par);
    items.push({
      id: "ch-" + String(m.id), at: str(m.createdAt), source: "Chasse", type: label, couleur,
      coffre, objet: String(m.nom || ""), avant: numN(m.avant), apres: numN(m.apres), delta: numN(m.delta),
      par, parGrade: gr(par), commentaire: str(m.commentaire),
    });
  }

  // ── Armurerie · Stock ──
  if (!stR.error) for (const m of (stR.data || []) as Raw[]) {
    const delta = Number(m.delta) || 0;
    const couleur: AuditCouleur = delta > 0 ? "ajout" : delta < 0 ? "retrait" : "modif";
    const par = str(m.par);
    items.push({
      id: "as-" + String(m.id), at: str(m.createdAt),
      source: "Armurerie · " + (String(m.cible) === "produit" ? "Produits" : "Matières"),
      type: delta > 0 ? "Ajout" : delta < 0 ? "Retrait" : "Modification", couleur,
      coffre: "Van Horn", objet: String(m.nom || ""), avant: numN(m.avant), apres: numN(m.apres), delta,
      par, parGrade: gr(par), commentaire: [str(m.origine), str(m.detail)].filter(Boolean).join(" · ") || null,
    });
  }

  // ── Armurerie · Coffre (trésorerie) ──
  if (!coR.error) for (const m of (coR.data || []) as Raw[]) {
    const entree = String(m.sens || "") === "entree";
    const montant = Number(m.montant) || 0;
    const par = str(m.auteur);
    items.push({
      id: "ac-" + String(m.id), at: str(m.createdAt), source: "Armurerie · Coffre",
      type: entree ? "Dépôt" : "Retrait", couleur: entree ? "ajout" : "retrait",
      coffre: "Coffre Van Horn", objet: m.nature ? String(m.nature) : "$",
      avant: null, apres: null, delta: entree ? montant : -montant,
      par, parGrade: gr(par), commentaire: str(m.motif),
    });
  }

  // ── Coffre commun (journal bot, texte libre) ──
  if (!invR.error) for (const m of (invR.data || []) as Raw[]) {
    const par = str(m.par);
    items.push({
      id: "iv-" + String(m.id), at: str(m.createdAt), source: "Coffre commun",
      type: "Mouvement", couleur: "neutre", coffre: "Coffre commun", objet: null,
      avant: null, apres: null, delta: null, par, parGrade: gr(par), commentaire: str(m.texte),
    });
  }

  items.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  const pret = !chR.error || !stR.error || !coR.error || !invR.error;
  return { pret, items: items.slice(0, 2000) };
}
