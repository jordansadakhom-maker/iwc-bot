// ─────────────────────────────────────────────────────────────────────────────
// MODULE FISCAL DE L'ARMURERIE — SOURCE UNIQUE DE VÉRITÉ (pur, client + serveur).
// Toute la logique d'imposition passe par ici : aucune règle fiscale ne doit être
// dupliquée ailleurs. Si la grille change, on ne touche qu'à ce fichier.
//
// Règle : l'impôt s'applique sur le BÉNÉFICE du cycle (pas le chiffre d'affaires),
// à un taux FORFAITAIRE déterminé par la tranche atteinte (grille officielle).
//   Bénéfice 2 600 $ → tranche 35 % → impôt 910 $ → bénéfice net 1 690 $.
// Sous 1 800 $ de bénéfice : aucun impôt (0 %).
// ─────────────────────────────────────────────────────────────────────────────

export type Tranche = { seuil: number; taux: number };

// Grille officielle — triée par seuil CROISSANT. Unique endroit à modifier si
// l'État change les taux. « taux » est un pourcentage (25 = 25 %).
export const GRILLE_FISCALE: readonly Tranche[] = [
  { seuil: 1800, taux: 25 },
  { seuil: 2200, taux: 30 },
  { seuil: 2400, taux: 30.2 },
  { seuil: 2600, taux: 35 },
  { seuil: 3000, taux: 40 },
] as const;

// Seuils croissants, utiles à l'affichage de la progression.
export const SEUILS = GRILLE_FISCALE.map((t) => t.seuil);
export const SEUIL_MIN = SEUILS[0];               // 1 800 : en dessous, 0 %
export const SEUIL_MAX = SEUILS[SEUILS.length - 1]; // 3 000 : tranche maximale

// Arrondi monétaire au centime (évite les dérives de virgule flottante).
export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export type CalculFiscal = {
  benefice: number;        // bénéfice du cycle (base d'imposition)
  taux: number;            // taux appliqué (%) — 0 sous le premier seuil
  seuilTranche: number | null; // seuil de la tranche atteinte (null = aucune)
  impot: number;           // montant des impôts
  net: number;             // bénéfice net après impôt
  prochainSeuil: number | null;    // prochain palier (null = déjà au maximum)
  resteAvantProchain: number | null; // $ restants avant la prochaine tranche
  progression: number;     // 0..1 — avancement vers la prochaine tranche
  tauxProchain: number | null;     // taux de la prochaine tranche (info)
};

// Tranche applicable pour un bénéfice donné (la plus haute atteinte), ou null.
export function trancheDe(benefice: number): Tranche | null {
  const b = Number(benefice) || 0;
  let t: Tranche | null = null;
  for (const tr of GRILLE_FISCALE) if (b >= tr.seuil) t = tr; // croissant → garde la dernière atteinte
  return t;
}

// Calcul fiscal complet à partir du seul bénéfice — LE point d'entrée du module.
export function calculFiscal(benefice: number): CalculFiscal {
  const b = round2(Number(benefice) || 0);
  const tr = trancheDe(b);
  const taux = tr ? tr.taux : 0;
  const impot = round2((b * taux) / 100);
  const net = round2(b - impot);

  // Prochain palier = premier seuil STRICTEMENT au-dessus du bénéfice courant.
  const prochain = GRILLE_FISCALE.find((t) => t.seuil > b) || null;
  const prochainSeuil = prochain ? prochain.seuil : null;
  const resteAvantProchain = prochain ? round2(prochain.seuil - b) : null;

  // Progression 0..1 vers le prochain palier, depuis le palier courant (ou 0).
  const base = tr ? tr.seuil : 0;
  const progression = prochain
    ? Math.max(0, Math.min(1, (b - base) / (prochain.seuil - base)))
    : 1;

  return {
    benefice: b, taux, seuilTranche: tr ? tr.seuil : null, impot, net,
    prochainSeuil, resteAvantProchain, progression, tauxProchain: prochain ? prochain.taux : null,
  };
}

// Simulateur : impact d'une vente (ou d'un montant) AVANT validation. Renvoie
// l'état actuel, l'état projeté, et si l'ajout fait franchir une tranche.
export type SimulationFiscale = {
  actuel: CalculFiscal;
  projete: CalculFiscal;
  deltaImpot: number;      // impôt supplémentaire engendré
  changeTranche: boolean;  // vrai si la vente fait passer une tranche
};
export function simulerFiscal(beneficeActuel: number, beneficeAjoute: number): SimulationFiscale {
  const actuel = calculFiscal(beneficeActuel);
  const projete = calculFiscal(round2((Number(beneficeActuel) || 0) + (Number(beneficeAjoute) || 0)));
  return {
    actuel, projete,
    deltaImpot: round2(projete.impot - actuel.impot),
    changeTranche: actuel.seuilTranche !== projete.seuilTranche,
  };
}

// Vérification interne : recompose les valeurs et signale toute incohérence
// (impôt hors bornes, net incohérent, taux hors grille). Retourne la liste des
// anomalies — vide si tout est cohérent. Utilisé par le contrôle automatique.
export function verifierCoherence(c: CalculFiscal): string[] {
  const ko: string[] = [];
  const attendu = calculFiscal(c.benefice);
  if (Math.abs(attendu.impot - c.impot) > 0.01) ko.push("Le montant des impôts ne correspond pas au bénéfice et à la grille.");
  if (Math.abs(round2(c.benefice - c.impot) - c.net) > 0.01) ko.push("Le bénéfice net ne correspond pas (bénéfice − impôt).");
  if (c.impot < 0 || c.impot > c.benefice) ko.push("Le montant des impôts est hors bornes.");
  const tauxValides = new Set<number>([0, ...GRILLE_FISCALE.map((t) => t.taux)]);
  if (!tauxValides.has(c.taux)) ko.push("Le taux appliqué ne figure pas dans la grille officielle.");
  return ko;
}

// ── Cycle comptable (dérivé à la lecture, temps réel) ────────────────────────
// Le bénéfice du cycle courant = flux NET du coffre depuis la dernière déclaration
// réglée : entrées (ventes) − sorties (achats, dépenses, paies). C'est exactement
// « CA − COGS − dépenses − achats » : chaque euro entré/sorti du coffre y figure.
// Tout est recalculé à partir des mouvements réels → aucune saisie, aucun bouton.
export type MvtCoffre = { sens: string; montant: number; createdAt: string | null; motif?: string | null };

// Un règlement d'impôt (sortie du coffre) ne doit PAS réduire le bénéfice
// imposable du cycle suivant (sinon l'impôt se taxe lui-même). On l'exclut par
// son motif (« Impôt — … », « Impôt cycle … »).
export const estMouvementImpot = (motif: unknown) => /^\s*imp[oô]t/i.test(String(motif ?? ""));
export type DeclarationReglee = { payeAt: string | null; fin: string | null };
export type CycleFiscal = CalculFiscal & {
  ca: number;         // total des entrées du cycle
  depenses: number;   // total des sorties du cycle
  depuis: string | null; // début du cycle (dernière clôture) — null = depuis toujours
};

// Début du cycle courant = date de la dernière déclaration réglée (sinon null).
export function debutCycle(impotsPayes: DeclarationReglee[]): string | null {
  let start: string | null = null;
  for (const d of impotsPayes || []) {
    const t = d.payeAt || d.fin;
    if (t && (!start || t > start)) start = t;
  }
  return start;
}

// Instantané fiscal du cycle courant à partir des mouvements de coffre réels.
export function snapshotCycle(mouvements: MvtCoffre[], impotsPayes: DeclarationReglee[] = []): CycleFiscal {
  const depuis = debutCycle(impotsPayes);
  let ca = 0, depenses = 0;
  for (const m of mouvements || []) {
    if (depuis && m.createdAt && m.createdAt < depuis) continue; // hors du cycle courant
    const v = Number(m.montant) || 0;
    if (String(m.sens) === "sortie") {
      if (estMouvementImpot(m.motif)) continue; // un paiement d'impôt ne réduit pas le bénéfice
      depenses += v;
    } else ca += v;
  }
  ca = round2(ca); depenses = round2(depenses);
  const benefice = round2(ca - depenses);
  return { ...calculFiscal(benefice), ca, depenses, depuis };
}

// Format monétaire commun (fr-FR, sans décimales superflues).
export const euros = (n: number) => `${Math.round(Number(n) || 0).toLocaleString("fr-FR")} $`;
export const pourcent = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1).replace(".", ",")} %`;
