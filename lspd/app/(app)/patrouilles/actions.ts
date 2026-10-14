"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requirePerm } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { newId, refCode } from "@/lib/ids";
import { agentIdsEnPatrouille, indicatifPatrouilleLibre, type Membre } from "@/lib/patrouilles";

export type PatResult = { ok: boolean; error?: string; id?: string };

const REFUS = "Accès refusé : droit « gérer les interventions » requis.";
const STATUTS = ["preparation", "dispo", "occupe", "intervention", "indispo"];
const TYPES = ["patrouille", "traffic", "tactique", "canine", "moto", "supervision"];
const s = (v: unknown, max = 120) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };

type PatRow = { id: string; ref: string; indicatif: string | null; statut: string; membres: unknown; journal: unknown; chefNom: string | null };

async function charger(admin: NonNullable<ReturnType<typeof createAdminClient>>, id: string): Promise<PatRow | null> {
  try {
    const { data } = await admin.from("LspdPatrouille").select("id,ref,indicatif,statut,membres,journal,chefNom,fin").eq("id", id).is("fin", null).maybeSingle();
    if (!data) return null;
    const r = data as Record<string, unknown>;
    return { id: String(r.id), ref: String(r.ref || ""), indicatif: r.indicatif == null ? null : String(r.indicatif), statut: String(r.statut || "dispo"), membres: r.membres, journal: r.journal, chefNom: r.chefNom == null ? null : String(r.chefNom) };
  } catch {
    return null;
  }
}

function parseMembres(v: unknown): Membre[] {
  if (!Array.isArray(v)) return [];
  return (v as Record<string, unknown>[]).filter((m) => m && m.agentId).map((m) => ({ agentId: String(m.agentId), nom: String(m.nom || "Agent"), indicatif: m.indicatif == null ? null : String(m.indicatif), matricule: m.matricule == null ? null : String(m.matricule) }));
}

function journalPlus(v: unknown, texte: string, par: string): unknown[] {
  const base = Array.isArray(v) ? (v as unknown[]) : [];
  return [...base, { at: new Date().toISOString(), par, texte }].slice(-100);
}

function conflit(err: { code?: string; message?: string } | null): string | null {
  const m = String(err?.message || "");
  if (err?.code === "23505" || /duplicate key|unique/i.test(m)) {
    if (/indicatif/i.test(m)) return "Cet indicatif de patrouille est déjà utilisé. Choisis-en un autre.";
    return "Conflit : cette patrouille existe déjà.";
  }
  return null;
}

// Construit la liste des membres à partir d'agentId, en s'appuyant sur les
// services ouverts (nom + indicatif connus), et refuse ceux déjà engagés.
async function composerMembres(admin: NonNullable<ReturnType<typeof createAdminClient>>, agentIds: string[], exclurePatrouilleId?: string): Promise<{ membres: Membre[]; refus: string | null }> {
  const uniques = [...new Set(agentIds.map((x) => String(x || "").trim()).filter(Boolean))];
  if (uniques.length === 0) return { membres: [], refus: null };
  const engages = await agentIdsEnPatrouille(exclurePatrouilleId);
  for (const id of uniques) if (engages.has(id)) return { membres: [], refus: "Un des agents sélectionnés est déjà engagé dans une autre patrouille." };

  // Récupère nom/indicatif via le service ouvert, sinon via la fiche agent.
  const membres: Membre[] = [];
  for (const id of uniques) {
    let nom = "Agent", indicatif: string | null = null, matricule: string | null = null;
    try {
      const { data } = await admin.from("LspdService").select("agentNom,indicatif,matricule").eq("agentId", id).is("fin", null).maybeSingle();
      if (data) { const d = data as Record<string, unknown>; nom = String(d.agentNom || nom); indicatif = d.indicatif == null ? null : String(d.indicatif); matricule = d.matricule == null ? null : String(d.matricule); }
    } catch { /* ignore */ }
    if (nom === "Agent") {
      try {
        const { data } = await admin.from("LspdAgent").select("nom,matricule").eq("id", id).maybeSingle();
        if (data) { const d = data as Record<string, unknown>; nom = String(d.nom || nom); if (matricule == null) matricule = d.matricule == null ? null : String(d.matricule); }
      } catch { /* ignore */ }
    }
    membres.push({ agentId: id, nom, indicatif, matricule });
  }
  return { membres, refus: null };
}

export async function creerPatrouille(input: { indicatif?: string; type?: string; secteur?: string; canalId?: string; vehicule?: string; membres?: string[] }): Promise<PatResult> {
  const a = await requirePerm("interventions.gerer");
  if (!a) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Base non connectée." };

  const { membres, refus } = await composerMembres(admin, input.membres || []);
  if (refus) return { ok: false, error: refus };

  const indicatif = s(input.indicatif) || (await indicatifPatrouilleLibre());
  const type = TYPES.includes(String(input.type)) ? String(input.type) : "patrouille";

  let canalNom: string | null = null;
  const canalId = s(input.canalId);
  if (canalId) {
    try { const { data } = await admin.from("LspdCanal").select("nom").eq("id", canalId).maybeSingle(); canalNom = data ? String((data as Record<string, unknown>).nom) : null; } catch { /* ignore */ }
  }

  const id = newId("pat");
  const now = new Date().toISOString();
  const chefNom = membres[0]?.nom ?? null;
  const { error } = await admin.from("LspdPatrouille").insert({
    id, ref: refCode("PAT"), indicatif, type, secteur: s(input.secteur), vehicule: s(input.vehicule),
    canalId, canalNom, membres, chefId: membres[0]?.agentId ?? null, chefNom,
    statut: membres.length ? "dispo" : "preparation", debut: now,
    journal: [{ at: now, par: a.nom, texte: `Patrouille constituée (${membres.length} agent${membres.length > 1 ? "s" : ""})` }],
    createdAt: now, createdBy: a.nom,
  });
  if (error) {
    const c = conflit(error);
    if (c) return { ok: false, error: c };
    return { ok: false, error: "Création impossible (lance 01-operations.sql ?)." };
  }
  await logAudit({ aggregate: "patrouille", type: "patrouille.creee", cibleId: id, cibleLibelle: `${indicatif || "patrouille"}${chefNom ? ` · ${chefNom}` : ""}`, apres: { indicatif, type, membres: membres.length } });
  return { ok: true, id };
}

export async function ajouterMembre(id: string, agentId: string): Promise<PatResult> {
  const a = await requirePerm("interventions.gerer");
  if (!a) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Base non connectée." };
  const pat = await charger(admin, id);
  if (!pat) return { ok: false, error: "Patrouille introuvable ou déjà clôturée." };
  const membres = parseMembres(pat.membres);
  if (membres.some((m) => m.agentId === agentId)) return { ok: false, error: "Cet agent est déjà dans la patrouille." };
  const { membres: ajout, refus } = await composerMembres(admin, [agentId], id);
  if (refus) return { ok: false, error: refus };
  if (ajout.length === 0) return { ok: false, error: "Agent introuvable." };
  const nouv = [...membres, ...ajout];
  const { error } = await admin.from("LspdPatrouille").update({
    membres: nouv, chefId: nouv[0]?.agentId ?? null, chefNom: nouv[0]?.nom ?? null,
    statut: pat.statut === "preparation" ? "dispo" : pat.statut,
    journal: journalPlus(pat.journal, `${ajout[0].nom} ajouté à l'équipage`, a.nom), updatedAt: new Date().toISOString(),
  }).eq("id", id);
  if (error) return { ok: false, error: "Modification impossible." };
  await logAudit({ aggregate: "patrouille", type: "patrouille.membre.ajout", cibleId: id, cibleLibelle: `${pat.indicatif || pat.ref} + ${ajout[0].nom}` });
  return { ok: true };
}

export async function retirerMembre(id: string, agentId: string): Promise<PatResult> {
  const a = await requirePerm("interventions.gerer");
  if (!a) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Base non connectée." };
  const pat = await charger(admin, id);
  if (!pat) return { ok: false, error: "Patrouille introuvable ou déjà clôturée." };
  const membres = parseMembres(pat.membres);
  const sortant = membres.find((m) => m.agentId === agentId);
  if (!sortant) return { ok: false, error: "Agent absent de la patrouille." };
  const nouv = membres.filter((m) => m.agentId !== agentId);
  const { error } = await admin.from("LspdPatrouille").update({
    membres: nouv, chefId: nouv[0]?.agentId ?? null, chefNom: nouv[0]?.nom ?? null,
    statut: nouv.length === 0 ? "preparation" : pat.statut,
    journal: journalPlus(pat.journal, `${sortant.nom} retiré de l'équipage`, a.nom), updatedAt: new Date().toISOString(),
  }).eq("id", id);
  if (error) return { ok: false, error: "Modification impossible." };
  await logAudit({ aggregate: "patrouille", type: "patrouille.membre.retrait", cibleId: id, cibleLibelle: `${pat.indicatif || pat.ref} − ${sortant.nom}` });
  return { ok: true };
}

export async function setStatutPatrouille(id: string, statut: string): Promise<PatResult> {
  const a = await requirePerm("interventions.gerer");
  if (!a) return { ok: false, error: REFUS };
  if (!STATUTS.includes(statut)) return { ok: false, error: "Statut invalide." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Base non connectée." };
  const pat = await charger(admin, id);
  if (!pat) return { ok: false, error: "Patrouille introuvable ou déjà clôturée." };
  const { error } = await admin.from("LspdPatrouille").update({
    statut, journal: journalPlus(pat.journal, `Statut → ${statut}`, a.nom), updatedAt: new Date().toISOString(),
  }).eq("id", id);
  if (error) return { ok: false, error: "Mise à jour impossible." };
  await logAudit({ aggregate: "patrouille", type: "patrouille.statut", cibleId: id, cibleLibelle: `${pat.indicatif || pat.ref} → ${statut}` });
  return { ok: true };
}

export async function cloturerPatrouille(id: string): Promise<PatResult> {
  const a = await requirePerm("interventions.gerer");
  if (!a) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Base non connectée." };
  const pat = await charger(admin, id);
  if (!pat) return { ok: false, error: "Patrouille déjà clôturée ou introuvable." };
  const now = new Date().toISOString();
  const { error } = await admin.from("LspdPatrouille").update({
    statut: "terminee", fin: now, journal: journalPlus(pat.journal, "Patrouille clôturée", a.nom), updatedAt: now,
  }).eq("id", id);
  if (error) return { ok: false, error: "Clôture impossible." };
  await logAudit({ aggregate: "patrouille", type: "patrouille.cloturee", cibleId: id, cibleLibelle: pat.indicatif || pat.ref });
  return { ok: true };
}
