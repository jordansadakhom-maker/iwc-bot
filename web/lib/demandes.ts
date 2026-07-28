import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { STATUTS_OUVERTS, type Demande, type DemandeDetail, type DemandeMessage, type DemandeEvent, type DemandesData } from "@/lib/demandes-const";

export * from "@/lib/demandes-const";

const s = (v: unknown): string | null => (v == null ? null : String(v));

function versDemande(r: Record<string, unknown>): Demande {
  return {
    id: String(r.id), ref: String(r.ref || ""), type: String(r.type || "autre"),
    titre: String(r.titre || "Demande"), resume: s(r.resume),
    priorite: String(r.priorite || "normale"), statut: String(r.statut || "nouvelle"),
    auteurId: s(r.auteurId), auteurNom: String(r.auteurNom || "Membre"), roleCible: s(r.roleCible),
    assigneId: s(r.assigneId), assigneNom: s(r.assigneNom), assigneAt: s(r.assigneAt),
    cibleId: s(r.cibleId), lien: s(r.lien),
    createdAt: String(r.createdAt || ""), updatedAt: s(r.updatedAt), closedAt: s(r.closedAt),
  };
}

// Liste des demandes (limite raisonnable ; le filtrage fin se fait côté client).
export async function getDemandes(monId?: string | null): Promise<DemandesData> {
  const vide: DemandesData = { pret: false, demandes: [], stats: { total: 0, ouvertes: 0, nonAssignees: 0, miennes: 0 } };
  const admin = createAdminClient();
  if (!admin) return vide;
  try {
    const { data, error } = await admin.from("Demande").select("*").order("createdAt", { ascending: false }).limit(400);
    if (error) return vide;
    const demandes = ((data || []) as Record<string, unknown>[]).map(versDemande);
    const ouvertes = demandes.filter((d) => STATUTS_OUVERTS.includes(d.statut as never)).length;
    const nonAssignees = demandes.filter((d) => STATUTS_OUVERTS.includes(d.statut as never) && !d.assigneId).length;
    const miennes = monId ? demandes.filter((d) => d.assigneId === monId && STATUTS_OUVERTS.includes(d.statut as never)).length : 0;
    return { pret: true, demandes, stats: { total: demandes.length, ouvertes, nonAssignees, miennes } };
  } catch { return vide; }
}

// Détail d'une demande : le dossier + sa conversation + son historique.
export const getDemande = cache(async (id: string): Promise<DemandeDetail | null> => {
  const admin = createAdminClient();
  if (!admin || !id) return null;
  try {
    const { data } = await admin.from("Demande").select("*").eq("id", id).maybeSingle();
    if (!data) return null;
    const [msgR, evR] = await Promise.all([
      admin.from("DemandeMessage").select("*").eq("demandeId", id).order("createdAt", { ascending: true }).limit(500),
      admin.from("DemandeEvent").select("*").eq("demandeId", id).order("at", { ascending: true }).limit(500),
    ]);
    const messages: DemandeMessage[] = ((msgR.data || []) as Record<string, unknown>[]).map((m) => ({
      id: String(m.id), auteurId: s(m.auteurId), auteurNom: String(m.auteurNom || "Membre"), corps: String(m.corps || ""),
      pieces: Array.isArray(m.pieces) ? (m.pieces as { nom: string; url: string }[]) : [], createdAt: String(m.createdAt || ""), editedAt: s(m.editedAt),
    }));
    const evenements: DemandeEvent[] = ((evR.data || []) as Record<string, unknown>[]).map((e) => ({
      id: String(e.id), type: String(e.type || ""), par: s(e.par), details: (e.details as Record<string, unknown>) ?? null, at: String(e.at || ""),
    }));
    return { ...versDemande(data as Record<string, unknown>), messages, evenements };
  } catch { return null; }
});
