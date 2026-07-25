"use server";

import { setEtatOverlay } from "@/lib/notif-etat";
import { TABLE_ETAT_DISPENSAIRE } from "@/lib/dispensaire-assistant";
import { getRoleDispensaire, peutFacturer } from "@/lib/dispensaire-roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { terminerService } from "@/app/dispensaire/pointage/actions";
import { factureOuverte } from "@/lib/dispensaire-facturation-const";
import { cleNom } from "@/lib/noms";
import type { ActionConstatResult } from "@/lib/erp-assistant-const";

// Change l'état d'une notification du DISPENSAIRE (couche persistée).
// Gardé par la liste blanche : un compte non autorisé ne peut pas écrire
// (le layout protège l'affichage, pas l'appel direct à l'action).
export async function setEtatNotif(id: string, etat: string): Promise<{ ok: boolean; error?: string }> {
  try { if (!(await getRoleDispensaire()).autorise) return { ok: false, error: "Accès refusé." }; } catch { return { ok: false, error: "Accès refusé." }; }
  return setEtatOverlay(TABLE_ETAT_DISPENSAIRE, id, etat);
}

// Exécute l'action inline d'un constat du Dispensaire (« régler en 1 clic »).
// `ref` = cible facultative (ex. l'objet de la facture à relancer).
export async function executerConstat(kind: string, ref?: string): Promise<ActionConstatResult> {
  try { if (!(await getRoleDispensaire()).autorise) return { ok: false, error: "Accès refusé." }; } catch { return { ok: false, error: "Accès refusé." }; }
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  if (kind === "clore-pointages") {
    const iso12 = new Date(Date.now() - 12 * 3600000).toISOString();
    const { data } = await admin.from("DispensairePointage").select("id").is("fin", null).lt("debut", iso12);
    const ids = ((data as { id: string }[]) || []).map((r) => r.id);
    let n = 0; let lastErr: string | undefined;
    for (const id of ids) { const r = await terminerService(id); if (r.ok) n++; else lastErr = r.error; }
    if (n === 0 && ids.length) return { ok: false, error: lastErr || "Aucun service clôturé." };
    return { ok: true, message: `${n} service(s) clôturé(s).` };
  }
  if (kind === "relancer-facture") {
    // Droit dédié : seul un compte pouvant facturer peut relancer un impayé.
    if (!(await peutFacturer())) return { ok: false, error: "Droit de facturation requis." };
    const cible = (ref || "").trim();
    if (!cible) return { ok: false, error: "Facture cible manquante." };
    // Ne relance QUE les factures encore ouvertes et pas déjà « relancée ».
    const { data } = await admin.from("DispensaireFacture").select("id,statut").eq("objet", cible);
    const cibles = ((data as { id: string; statut: string }[]) || []).filter((f) => factureOuverte(f.statut) && f.statut !== "relancee");
    if (!cibles.length) return { ok: false, error: "Aucune facture ouverte à relancer pour cette cible." };
    let n = 0; let lastErr: string | undefined;
    for (const f of cibles) { const { error } = await admin.from("DispensaireFacture").update({ statut: "relancee" }).eq("id", f.id); if (error) lastErr = error.message; else n++; }
    if (n === 0) return { ok: false, error: lastErr || "Relance impossible." };
    return { ok: true, message: `${n} facture(s) marquée(s) « relancée ».` };
  }
  if (kind === "dossier-police") {
    // Dernier rang de recouvrement : bascule les factures ouvertes de la cible en
    // « dossier police » (elles restent dues, mais partent au rapport des FDO).
    if (!(await peutFacturer())) return { ok: false, error: "Droit de facturation requis." };
    const cible = (ref || "").trim();
    if (!cible) return { ok: false, error: "Facture cible manquante." };
    const { data } = await admin.from("DispensaireFacture").select("id,statut").eq("objet", cible);
    const cibles = ((data as { id: string; statut: string }[]) || []).filter((f) => factureOuverte(f.statut) && f.statut !== "dossier_police");
    if (!cibles.length) return { ok: false, error: "Aucune facture ouverte à transmettre pour cette cible." };
    let n = 0; let lastErr: string | undefined;
    for (const f of cibles) { const { error } = await admin.from("DispensaireFacture").update({ statut: "dossier_police" }).eq("id", f.id); if (error) lastErr = error.message; else n++; }
    if (n === 0) return { ok: false, error: lastErr || "Transmission impossible." };
    return { ok: true, message: `${n} facture(s) passée(s) en « dossier police ».` };
  }
  if (kind === "couper-acces") {
    // Sécurité : coupe l'accès au site des salariés dont la fiche RH est « renvoyé »
    // mais qui gardent une fiche d'accès active. Rapprochement par nom normalisé.
    // Réversible (l'admin peut réactiver) et réservé à l'administration.
    const role = await getRoleDispensaire();
    if (!role.perms.admin) return { ok: false, error: "Droit d'administration requis." };
    const [salRes, memRes] = await Promise.all([
      admin.from("DispensaireSalarie").select("nom,statut"),
      admin.from("DispensaireMembre").select("id,nom,actif"),
    ]);
    const salaries = (salRes.data as { nom: string; statut: string }[]) || [];
    const membres = (memRes.data as { id: string; nom: string; actif: boolean | null }[]) || [];
    const renvoyes = new Set(salaries.filter((s) => String(s.statut ?? "") === "renvoye" && cleNom(s.nom)).map((s) => cleNom(s.nom)));
    const aCouper = membres.filter((m) => m.actif !== false && cleNom(m.nom) && renvoyes.has(cleNom(m.nom)));
    if (!aCouper.length) return { ok: false, error: "Aucun accès à couper." };
    let n = 0; let lastErr: string | undefined;
    for (const m of aCouper) { const { error } = await admin.from("DispensaireMembre").update({ actif: false }).eq("id", m.id); if (error) lastErr = error.message; else n++; }
    if (n === 0) return { ok: false, error: lastErr || "Coupure impossible." };
    return { ok: true, message: `${n} accès coupé(s) — salarié(s) renvoyé(s).` };
  }
  return { ok: false, error: "Action inconnue." };
}
