import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCanaux, type CanalOpt } from "@/lib/service";

export type Membre = { agentId: string; nom: string; indicatif: string | null; matricule: string | null };

export type PatrouilleRow = {
  id: string;
  ref: string;
  indicatif: string | null;
  type: string | null;
  secteur: string | null;
  vehicule: string | null;
  canalId: string | null;
  canalNom: string | null;
  statut: string;
  chefNom: string | null;
  debut: string | null;
  membres: Membre[];
};

export type AgentDispo = { agentId: string; nom: string; indicatif: string | null; matricule: string | null };

export type PatrouillesData = {
  pret: boolean;
  connectee: boolean;
  patrouilles: PatrouilleRow[];
  agentsDispo: AgentDispo[];
  canaux: CanalOpt[];
  indicatifPropose: string | null;
};

// Plan d'indicatifs de patrouille par défaut (voitures à 2 agents, style ADAM).
const PLAN_PATROUILLE = Array.from({ length: 30 }, (_, i) => `ADAM-${i + 11}`);

function parseMembres(v: unknown): Membre[] {
  if (!Array.isArray(v)) return [];
  const out: Membre[] = [];
  for (const m of v as Record<string, unknown>[]) {
    if (!m || typeof m !== "object") continue;
    const agentId = m.agentId == null ? "" : String(m.agentId);
    if (!agentId) continue;
    out.push({ agentId, nom: String(m.nom || "Agent"), indicatif: m.indicatif == null ? null : String(m.indicatif), matricule: m.matricule == null ? null : String(m.matricule) });
  }
  return out;
}

// Patrouilles OUVERTES (fin NULL), membres parsés.
export async function getPatrouillesOuvertes(): Promise<PatrouilleRow[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  try {
    const { data, error } = await admin.from("LspdPatrouille").select("*").is("fin", null).order("createdAt", { ascending: true }).limit(200);
    if (error) return [];
    return ((data || []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      ref: String(r.ref || ""),
      indicatif: r.indicatif == null ? null : String(r.indicatif),
      type: r.type == null ? null : String(r.type),
      secteur: r.secteur == null ? null : String(r.secteur),
      vehicule: r.vehicule == null ? null : String(r.vehicule),
      canalId: r.canalId == null ? null : String(r.canalId),
      canalNom: r.canalNom == null ? null : String(r.canalNom),
      statut: String(r.statut || "dispo"),
      chefNom: r.chefNom == null ? null : String(r.chefNom),
      debut: r.debut == null ? null : String(r.debut),
      membres: parseMembres(r.membres),
    }));
  } catch {
    return [];
  }
}

// Ensemble des agentId déjà engagés dans une patrouille ouverte (anti-doublon).
export async function agentIdsEnPatrouille(exclurePatrouilleId?: string): Promise<Set<string>> {
  const set = new Set<string>();
  const ouvertes = await getPatrouillesOuvertes();
  for (const p of ouvertes) {
    if (exclurePatrouilleId && p.id === exclurePatrouilleId) continue;
    for (const m of p.membres) set.add(m.agentId);
  }
  return set;
}

// Premier indicatif de patrouille LIBRE (non utilisé par une patrouille ouverte).
export async function indicatifPatrouilleLibre(): Promise<string | null> {
  const ouvertes = await getPatrouillesOuvertes();
  const pris = new Set(ouvertes.map((p) => p.indicatif).filter(Boolean) as string[]);
  for (const i of PLAN_PATROUILLE) if (!pris.has(i)) return i;
  return null;
}

// Agents actuellement EN SERVICE et NON déjà engagés dans une patrouille ouverte.
async function agentsDisponibles(dejaEngages: Set<string>): Promise<AgentDispo[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  try {
    const { data } = await admin.from("LspdService").select("agentId,agentNom,indicatif,matricule").is("fin", null);
    const out: AgentDispo[] = [];
    for (const s of (data || []) as Record<string, unknown>[]) {
      const agentId = String(s.agentId || "");
      if (!agentId || dejaEngages.has(agentId)) continue;
      out.push({ agentId, nom: String(s.agentNom || "Agent"), indicatif: s.indicatif == null ? null : String(s.indicatif), matricule: s.matricule == null ? null : String(s.matricule) });
    }
    out.sort((a, b) => a.nom.localeCompare(b.nom));
    return out;
  } catch {
    return [];
  }
}

export async function getPatrouillesData(): Promise<PatrouillesData> {
  const admin = createAdminClient();
  if (!admin) return { pret: false, connectee: false, patrouilles: [], agentsDispo: [], canaux: [], indicatifPropose: null };

  // Vérifie que la table répond (sinon → non prêt, lance le SQL).
  try {
    const { error } = await admin.from("LspdPatrouille").select("id", { count: "exact", head: true });
    if (error) return { pret: false, connectee: true, patrouilles: [], agentsDispo: [], canaux: await getCanaux(), indicatifPropose: null };
  } catch {
    return { pret: false, connectee: true, patrouilles: [], agentsDispo: [], canaux: [], indicatifPropose: null };
  }

  const patrouilles = await getPatrouillesOuvertes();
  const engages = new Set<string>();
  for (const p of patrouilles) for (const m of p.membres) engages.add(m.agentId);

  const [agentsDispo, canaux, indicatifPropose] = await Promise.all([
    agentsDisponibles(engages),
    getCanaux(),
    indicatifPatrouilleLibre(),
  ]);

  return { pret: true, connectee: true, patrouilles, agentsDispo, canaux, indicatifPropose };
}
