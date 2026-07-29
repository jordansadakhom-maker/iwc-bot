"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getActeur } from "@/lib/authz";
import { emettreEvenement } from "@/lib/evenements";
import { envoyerCommande, type CommandeResult } from "@/lib/commandes";
import { TOUS_GRADES } from "@/lib/grades";
import type { FicheRH } from "@/lib/queries";

function newId(p: string) { return `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

// Met à jour la FICHE RH d'un membre (champ site-native « ficheRH » sur la table
// Membre). Écriture directe : le bot ne touche jamais cette colonne, donc aucun
// conflit avec la synchro Discord (le grade/nom restent gérés côté Discord).
//
// SÉCURITÉ (fail-closed) : éditer une fiche est réservé aux officiers / à la
// direction. L'habilitation « médecin » (qui ouvre l'onglet Médical) ne peut être
// accordée QUE par la direction ; un officier édite le reste sans pouvoir la modifier.
export type FicheResult = { ok: boolean; error?: string };

export async function majFicheMembre(id: string, fiche: FicheRH): Promise<FicheResult> {
  const membreId = String(id || "").trim();
  if (!membreId) return { ok: false, error: "Membre introuvable." };

  const acteur = await getActeur();
  if (!acteur || !acteur.officier) {
    return { ok: false, error: "Action réservée aux officiers et à la direction." };
  }

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };

  // Habilitation médecin : seule la direction peut la modifier. Pour un officier,
  // on préserve la valeur déjà en base (il ne peut ni l'accorder ni la retirer).
  const { data: existant } = await admin.from("Membre").select("nomIC,ficheRH").eq("id", membreId).maybeSingle();
  const ancienne = (existant?.ficheRH as Record<string, unknown> | null) || {};
  const nomMembre = String(existant?.nomIC || membreId);
  const medecin = acteur.direction ? !!fiche.medecin : !!ancienne.medecin;

  const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
  const propre: FicheRH = {
    specialite: clean(fiche.specialite, 80),
    statutInterne: clean(fiche.statutInterne, 60),
    salaire: Math.max(0, Math.round(Number(fiche.salaire) || 0)),
    notes: clean(fiche.notes, 1500),
    // Habilitation médecin : donne accès à l'onglet Médical (voir getAcces).
    medecin,
  };

  const { error } = await admin.from("Membre").update({ ficheRH: propre }).eq("id", membreId);
  if (error) {
    if (/ficheRH|column|does not exist|schema cache/i.test(error.message)) {
      return { ok: false, error: "La fiche RH n'est pas encore prête côté base — exécute membre-fiche-rh.sql dans Supabase." };
    }
    return { ok: false, error: "Enregistrement impossible pour le moment." };
  }

  // Journal unique (avant→après) : la RH rejoint enfin le fil d'activité, comme
  // les autres domaines. Best-effort — ne bloque jamais l'enregistrement.
  await emettreEvenement({
    aggregate: "membre",
    type: "membre.fiche",
    cibleId: membreId,
    cibleLibelle: nomMembre,
    avant: ancienne,
    apres: propre as unknown as Record<string, unknown>,
    payload: { par: acteur.nomIC },
  });

  // L'habilitation « médecin » ouvre l'onglet Médical (accès sensible). Toute
  // attribution/retrait notifie la Direction au centre de notifications.
  if (acteur.direction && !!ancienne.medecin !== !!propre.medecin) {
    try {
      await admin.from("Notification").insert({
        id: newId("ntf"), type: "membre",
        titre: `Habilitation médecin ${propre.medecin ? "accordée" : "retirée"} — ${nomMembre}`,
        corps: `Par ${acteur.nomIC}`, lien: "/membres", cibleId: membreId,
        roleCible: "direction", membreId: null,
        ref: `membre-medecin-${membreId}-${propre.medecin ? "on" : "off"}`, lu: false,
      });
    } catch { /* best-effort */ }
  }
  return { ok: true };
}

// Attribution d'une FONCTION éditable depuis la Carte métier, sans écraser le
// reste de la fiche RH. « medecine » = habilitation médecin (Direction) ;
// « instruction » = spécialité « Instructeur » (officier+). Les autres fonctions
// (Direction/Officiers/Terrain) dépendent du grade Discord et ne sont pas ici.
export async function assignerMetierCarte(membreId: string, metier: "medecine" | "instruction", actif: boolean): Promise<FicheResult> {
  const id = String(membreId || "").trim();
  if (!id) return { ok: false, error: "Membre introuvable." };
  const acteur = await getActeur();
  if (!acteur || !acteur.officier) return { ok: false, error: "Action réservée aux officiers et à la direction." };
  if (metier === "medecine" && !acteur.direction) return { ok: false, error: "L'habilitation médecin est réservée à la Direction." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };

  const { data: existant } = await admin.from("Membre").select("nomIC,ficheRH").eq("id", id).maybeSingle();
  const nomMembre = String(existant?.nomIC || id);
  const ancienne = (existant?.ficheRH as Record<string, unknown> | null) || {};
  const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
  const specAncienne = clean(ancienne.specialite, 80);
  const propre: FicheRH = {
    specialite: metier === "instruction"
      ? (actif ? "Instructeur" : (/instruct/i.test(specAncienne) ? "" : specAncienne))
      : specAncienne,
    statutInterne: clean(ancienne.statutInterne, 60),
    salaire: Math.max(0, Math.round(Number(ancienne.salaire) || 0)),
    notes: clean(ancienne.notes, 1500),
    medecin: metier === "medecine" ? actif : !!ancienne.medecin,
  };

  const { error } = await admin.from("Membre").update({ ficheRH: propre }).eq("id", id);
  if (error) {
    if (/ficheRH|column|does not exist|schema cache/i.test(error.message)) return { ok: false, error: "La fiche RH n'est pas encore prête côté base — exécute membre-fiche-rh.sql dans Supabase." };
    return { ok: false, error: "Enregistrement impossible pour le moment." };
  }
  await emettreEvenement({
    aggregate: "membre", type: "membre.metier", cibleId: id, cibleLibelle: nomMembre,
    avant: ancienne, apres: propre as unknown as Record<string, unknown>,
    payload: { metier, actif, par: acteur.nomIC },
  });
  return { ok: true };
}

// Change le GRADE Discord d'un membre depuis le site. Le bot fait autorité :
// on lui envoie la commande « membre.grade » et on ATTEND son verdict réel
// (succès seulement si le rôle a bien été posé côté Discord). Réservé à la
// Direction — modifier des rôles Discord est une action sensible.
export async function changerGradeMembre(membreId: string, grade: string): Promise<CommandeResult> {
  const id = String(membreId || "").trim();
  const g = String(grade || "").trim();
  if (!id) return { ok: false, error: "Membre introuvable." };
  const acteur = await getActeur();
  if (!acteur || !acteur.direction) return { ok: false, error: "Changer un grade est réservé à la Direction." };
  if (!TOUS_GRADES.some((x) => x.nom === g)) return { ok: false, error: "Grade inconnu." };

  const r = await envoyerCommande("membre.grade", { membreId: id, grade: g }, { attendre: true });
  if (r.ok && !r.enAttente) {
    await emettreEvenement({
      aggregate: "membre", type: "membre.grade", cibleId: id, cibleLibelle: id,
      apres: { grade: g }, payload: { par: acteur.nomIC },
    });
  }
  return r;
}
