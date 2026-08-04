import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getNotifications } from "@/lib/dispensaire-notifications";
import { getConfig } from "@/lib/dispensaire-roles";
import { getEtatsOverlay } from "@/lib/notif-etat";
import { calculerReappro, detecterDoublons, detecterNegatifs, apercuReappro } from "@/lib/erp-coherence";
import { cleNom } from "@/lib/noms";
import { ymdParis } from "@/lib/dispensaire-dates";
import { type AssistantData, type Constat, type Priorite, trierConstats, compterGravite, graviteDe } from "@/lib/erp-assistant-const";

export * from "@/lib/erp-assistant-const";

export const TABLE_ETAT_DISPENSAIRE = "DispensaireNotifEtat";
const mk = (o: Omit<Constat, "gravite">): Constat => ({ ...o, gravite: graviteDe(o.priorite) });
const num = (v: unknown) => Number(v) || 0;
const rows = async (fn: () => PromiseLike<{ data: unknown }>): Promise<Record<string, unknown>[]> => { try { return ((await fn()).data as Record<string, unknown>[]) || []; } catch { return []; } };

// ── Assistant de veille — DISPENSAIRE DE SAINT-DENIS ────────────────────────
// S'appuie sur les alertes déjà calculées (stock, matières, factures, ventes,
// frais, RH) et les transforme en constats + action suggérée. Séparé de l'IWC :
// aucune donnée ne circule d'un système à l'autre.

const fmtParis = (d: Date) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "medium", timeStyle: "short" }).format(d); } catch { return ""; } };
const SEVERITE_PRIORITE: Record<string, Priorite> = { alerte: "urgente", attention: "importante", info: "information" };

// Action suggérée selon le type de notification (repli générique sinon).
function suggestionPour(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("stock")) return "Réapprovisionne avant la rupture.";
  if (t.includes("matière")) return "Commande la matière première manquante.";
  if (t.includes("facture")) return "Relance le client / encaisse la facture.";
  if (t.includes("vente") || t.includes("limite")) return "Vérifie le patient : plafond hebdomadaire dépassé.";
  if (t.includes("frais")) return "Valide ou refuse les notes de frais en attente.";
  if (t.includes("rh")) return "Convoque un entretien : absences au-delà du seuil.";
  return "À traiter.";
}

export async function getAssistantDispensaire(): Promise<AssistantData> {
  const genereLe = fmtParis(new Date());
  const constats: Constat[] = [];
  let pret = true;
  try {
    const { items } = await getNotifications();
    for (const n of items) {
      const priorite = SEVERITE_PRIORITE[n.severite] || "information";
      // Facture impayée → action de recouvrement en 1 clic selon le rang d'escalade :
      // relance d'abord, puis dossier police si elle a déjà été relancée sans effet.
      const action = n.ref && n.type === "Facture"
        ? (n.escalade === "police"
            ? { kind: "dossier-police", label: "Dossier police", ref: n.ref }
            : { kind: "relancer-facture", label: "Relancer", ref: n.ref })
        : undefined;
      constats.push({ id: "no-" + n.id, gravite: graviteDe(priorite), priorite, categorie: n.type, titre: n.texte, detail: null, suggestion: suggestionPour(n.type), href: n.href, action });
    }
  } catch { pret = false; }

  // Contrôle de cohérence & réappro sur le stock et les matières.
  const admin = createAdminClient();
  if (admin) {
    // Stock mutualisé : les matières premières sont désormais des articles de stock
    // (catégorie « matiere »), donc ce seul réappro les couvre — plus de double compte.
    const stock = await rows(() => admin.from("DispensaireStock").select("nom,stock,seuil,stockFixe"));
    const reappro = calculerReappro(stock, { qtyKey: "stock", seuilKey: "seuil", cibleKey: "stockFixe" }).sort((a, b) => b.manque - a.manque);
    if (reappro.length) constats.push(mk({ id: "reappro", priorite: "importante", categorie: "Réappro", titre: `${reappro.length} article(s) à réapprovisionner`, detail: apercuReappro(reappro), suggestion: "Prépare la commande pour revenir aux quantités cibles.", href: "/dispensaire/coffres" }));

    const doublons = detecterDoublons(stock);
    if (doublons.length) constats.push(mk({ id: "doublons-stock", priorite: "normale", categorie: "Cohérence", titre: `${doublons.length} doublon(s) dans le stock`, detail: doublons.slice(0, 3).map((d) => `${d.nom} ×${d.n}`).join(" · "), suggestion: "Fusionne les fiches en double pour fiabiliser les quantités.", href: "/dispensaire/stockage" }));

    const negatifs = detecterNegatifs(stock, "stock");
    if (negatifs.length) constats.push(mk({ id: "negatif-stock", priorite: "critique", categorie: "Cohérence", titre: `${negatifs.length} stock(s) négatif(s)`, detail: negatifs.slice(0, 3).map((n) => `${n.nom} (${n.q})`).join(" · "), suggestion: "Corrige : un stock négatif signale une perte ou une erreur de saisie.", href: "/dispensaire/stockage" }));

    // RH proactif : pointages non clôturés + salariés approchant le seuil de renvoi.
    const iso12 = new Date(Date.now() - 12 * 3600000).toISOString();
    const [pointages, salaries, membres, cfg] = await Promise.all([
      rows(() => admin.from("DispensairePointage").select("id").is("fin", null).lt("debut", iso12)),
      rows(() => admin.from("DispensaireSalarie").select("nom,statut,absInjustifiees")),
      rows(() => admin.from("DispensaireMembre").select("nom,actif")),
      getConfig(),
    ]);
    if (pointages.length) constats.push(mk({ id: "disp-pointage", priorite: "importante", categorie: "Pointage", titre: `${pointages.length} pointage(s) non clôturé(s)`, detail: "Service ouvert depuis plus de 12 h.", suggestion: "Clôture les services restés ouverts pour fiabiliser les heures.", href: "/dispensaire/pointage", action: { kind: "clore-pointages", label: "Clôturer maintenant" } }));
    const seuil = cfg.seuilRenvoi;
    const surveiller = salaries.filter((s) => String(s.statut ?? "actif") === "actif" && num(s.absInjustifiees) >= seuil - 1 && num(s.absInjustifiees) < seuil);
    if (surveiller.length) constats.push(mk({ id: "disp-rh-surveiller", priorite: "importante", categorie: "RH", titre: `${surveiller.length} salarié(s) à surveiller (absences)`, detail: surveiller.slice(0, 3).map((s) => String(s.nom ?? "?")).join(" · "), suggestion: "Convoque un entretien avant d'atteindre le seuil de renvoi.", href: "/dispensaire/rh" }));

    // Cohérence RH ↔ accès : la fiche RH (DispensaireSalarie) et l'accès au site
    // (DispensaireMembre) sont deux tables distinctes, rapprochées par le NOM.
    // On ne lève ces constats QUE si une liste blanche existe réellement
    // (membres.length > 0) — sinon (mode intégré Iron Wolf) on éviterait des faux
    // positifs. Objectif : ne jamais laisser un renvoyé garder son accès, ni un
    // accès sans fiche, ni une fiche sans accès — sans imposer de double saisie.
    if (membres.length > 0) {
      const accesActifs = new Set(membres.filter((m) => m.actif !== false && cleNom(m.nom)).map((m) => cleNom(m.nom)));
      const nomsSalaries = new Set(salaries.filter((s) => cleNom(s.nom)).map((s) => cleNom(s.nom)));

      const renvoyesAvecAcces = salaries.filter((s) => String(s.statut ?? "") === "renvoye" && accesActifs.has(cleNom(s.nom)));
      if (renvoyesAvecAcces.length) constats.push(mk({ id: "rh-renvoye-acces", priorite: "critique", categorie: "Sécurité", titre: `${renvoyesAvecAcces.length} salarié(s) renvoyé(s) gardant l'accès au site`, detail: renvoyesAvecAcces.slice(0, 3).map((s) => String(s.nom ?? "?")).join(" · "), suggestion: "Désactive leur accès dans l'Administration : un renvoi RH ne coupe pas l'accès automatiquement.", href: "/dispensaire/admin", action: { kind: "couper-acces", label: "Couper l'accès" } }));

      const accesSansFiche = membres.filter((m) => m.actif !== false && cleNom(m.nom) && !nomsSalaries.has(cleNom(m.nom)));
      if (accesSansFiche.length) constats.push(mk({ id: "rh-acces-sans-fiche", priorite: "normale", categorie: "RH", titre: `${accesSansFiche.length} accès sans fiche RH`, detail: accesSansFiche.slice(0, 3).map((m) => String(m.nom ?? "?")).join(" · "), suggestion: "Crée la fiche salarié correspondante (ou retire l'accès s'il n'a plus lieu d'être).", href: "/dispensaire/rh" }));

      const ficheSansAcces = salaries.filter((s) => String(s.statut ?? "actif") === "actif" && cleNom(s.nom) && !accesActifs.has(cleNom(s.nom)));
      if (ficheSansAcces.length) constats.push(mk({ id: "rh-fiche-sans-acces", priorite: "faible", categorie: "RH", titre: `${ficheSansAcces.length} salarié(s) actif(s) sans accès`, detail: ficheSansAcces.slice(0, 3).map((s) => String(s.nom ?? "?")).join(" · "), suggestion: "Ajoute leur accès dans l'Administration s'ils doivent utiliser le site.", href: "/dispensaire/admin" }));
    }

    // ── Enrichissement : planning médical & chambres (détections transverses) ──
    // Toutes guardées (rows() renvoie [] si la table n'existe pas encore).
    const today = ymdParis(new Date().toISOString());
    const [rdvs, chambres] = await Promise.all([
      rows(() => admin.from("DispensaireRendezVous").select("patient,medecin,debut,etat").eq("etat", "prevu")),
      rows(() => admin.from("DispensaireChambre").select("etat")),
    ]);

    // RDV du jour encore « prévu » et sans praticien attribué → risque de consultation non couverte.
    const rdvSansMedecin = rdvs
      .filter((r) => { try { return ymdParis(String(r.debut)) === today; } catch { return false; } })
      .filter((r) => !String(r.medecin ?? "").trim());
    if (rdvSansMedecin.length) constats.push(mk({ id: "rdv-sans-medecin", priorite: "importante", categorie: "Planning", titre: `${rdvSansMedecin.length} rendez-vous aujourd'hui sans médecin`, detail: rdvSansMedecin.slice(0, 3).map((r) => String(r.patient ?? "?")).join(" · "), suggestion: "Attribue un praticien avant l'heure du rendez-vous.", href: "/dispensaire/rendez-vous" }));

    // Chambres : capacité saturée (plus aucune libre alors que des lits existent).
    if (chambres.length) {
      const libres = chambres.filter((c) => String(c.etat ?? "libre") === "libre").length;
      if (libres === 0) constats.push(mk({ id: "chambres-pleines", priorite: "importante", categorie: "Chambres", titre: "Plus aucune chambre libre", detail: `${chambres.length} chambre(s), toutes occupées, réservées ou en nettoyage.`, suggestion: "Libère ou nettoie une chambre pour pouvoir accueillir un patient.", href: "/dispensaire/chambres" }));
    }
  }

  // Couche d'état persistée (Non lue / En cours / Résolue / Archivée).
  const etats = await getEtatsOverlay(TABLE_ETAT_DISPENSAIRE);
  for (const c of constats) c.etat = etats[c.id] || "nouveau";

  return { pret, constats: trierConstats(constats), parGravite: compterGravite(constats), genereLe };
}
