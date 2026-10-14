import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGrades } from "@/lib/rbac";

export type AgentRow = {
  id: string;
  identifiant: string | null;
  nom: string;
  matricule: string | null;
  grade: string | null;
  gradeNom: string | null;
  gradeOrdre: number;
  unite: string | null;
  statut: string;
  actif: boolean;
  dateIntegration: string | null;
  telephone: string | null;
  note: string | null;
  enService: boolean;
  indicatif: string | null;
  statutRadio: string | null;
};

export type UniteRow = { id: string; nom: string; code: string | null };
export type GradeOpt = { key: string; nom: string; ordre: number };

export type RosterData = {
  pret: boolean;
  connectee: boolean;
  agents: AgentRow[];
  grades: GradeOpt[];
  unites: UniteRow[];
};

export async function getRoster(): Promise<RosterData> {
  const admin = createAdminClient();
  const gradesDef = await getGrades();
  const grades: GradeOpt[] = gradesDef.map((g) => ({ key: g.key, nom: g.nom, ordre: g.ordre }));
  if (!admin) return { pret: false, connectee: false, agents: [], grades, unites: [] };

  const gradeByKey = new Map(gradesDef.map((g) => [g.key, g]));

  let rows: Record<string, unknown>[] = [];
  try {
    const { data, error } = await admin.from("LspdAgent").select("*").order("nom", { ascending: true }).limit(1000);
    if (error) return { pret: false, connectee: true, agents: [], grades, unites: [] };
    rows = (data || []) as Record<string, unknown>[];
  } catch {
    return { pret: false, connectee: true, agents: [], grades, unites: [] };
  }

  // Services ouverts → marque "en service" + indicatif/statut radio.
  const svc = new Map<string, { indicatif: string | null; statutRadio: string | null }>();
  try {
    const { data } = await admin.from("LspdService").select("agentId,indicatif,statutRadio").is("fin", null);
    for (const s of (data || []) as Record<string, unknown>[]) {
      svc.set(String(s.agentId), { indicatif: s.indicatif == null ? null : String(s.indicatif), statutRadio: s.statutRadio == null ? null : String(s.statutRadio) });
    }
  } catch { /* table service absente */ }

  let unites: UniteRow[] = [];
  try {
    const { data } = await admin.from("LspdUnite").select("id,nom,code").eq("actif", true).order("ordre", { ascending: true });
    unites = ((data || []) as Record<string, unknown>[]).map((u) => ({ id: String(u.id), nom: String(u.nom || ""), code: u.code == null ? null : String(u.code) }));
  } catch { /* table unite absente */ }

  const agents: AgentRow[] = rows.map((r) => {
    const g = gradeByKey.get(String(r.grade || ""));
    const s = svc.get(String(r.id));
    return {
      id: String(r.id),
      identifiant: r.identifiant == null ? null : String(r.identifiant),
      nom: String(r.nom || "Agent"),
      matricule: r.matricule == null ? null : String(r.matricule),
      grade: r.grade == null ? null : String(r.grade),
      gradeNom: g?.nom ?? (r.grade == null ? null : String(r.grade)),
      gradeOrdre: g?.ordre ?? 0,
      unite: r.unite == null ? null : String(r.unite),
      statut: String(r.statut || "actif"),
      actif: r.actif == null ? true : Boolean(r.actif),
      dateIntegration: r.dateIntegration == null ? null : String(r.dateIntegration),
      telephone: r.telephone == null ? null : String(r.telephone),
      note: r.note == null ? null : String(r.note),
      enService: !!s,
      indicatif: s?.indicatif ?? null,
      statutRadio: s?.statutRadio ?? null,
    };
  }).sort((a, b) => b.gradeOrdre - a.gradeOrdre || a.nom.localeCompare(b.nom));

  return { pret: true, connectee: true, agents, grades, unites };
}
