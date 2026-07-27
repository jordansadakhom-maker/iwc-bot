"use server";

import { envoyerCommande, type CommandeResult } from "@/lib/commandes";
import { createAdminClient } from "@/lib/supabase/admin";
import { supprimerFiable } from "@/lib/suppression";
import { round2 } from "@/lib/format";
import { requireDirection } from "@/lib/authz";
import { emettreEvenement } from "@/lib/evenements";

// Ajuste un coffre (dépôt / retrait / montant exact).
// Double écriture : 1) reflet INSTANTANÉ dans la table Coffre (le site montre le
// nouveau solde tout de suite) ; 2) commande filée au bot, qui reste la SOURCE DE
// VÉRITÉ (data.json) et re-pousse le coffre à sa prochaine synchro — il confirme
// ou corrige le reflet. « Ne rien dérégler » : le bot a toujours le dernier mot.
export async function ajusterCoffre(
  cible: "commun" | "legal" | "illegal",
  montant: number,
  mode: "depot" | "retrait" | "set"
): Promise<CommandeResult & { solde?: number }> {
  if (!["commun", "legal", "illegal"].includes(cible)) return { ok: false, error: "Coffre inconnu." };
  if (!Number.isFinite(montant) || montant < 0) return { ok: false, error: "Montant invalide." };
  const m = round2(montant);

  // 1) Reflet instantané dans la table Coffre (service role → contourne RLS).
  let solde: number | undefined;
  const admin = createAdminClient();
  if (admin) {
    try {
      const id = cible === "commun" ? "coffre_commun" : cible === "legal" ? "coffre_legal" : "coffre_illegal";
      const pole = cible === "commun" ? "both" : cible;
      const { data } = await admin.from("Coffre").select("solde").eq("id", id).maybeSingle();
      const actuel = data ? Number((data as { solde: number }).solde) || 0 : 0;
      solde = Math.max(0, mode === "set" ? m : mode === "retrait" ? actuel - m : actuel + m);
      await admin.from("Coffre").upsert({ id, pole, solde, seuilAlerte: 0, updatedAt: new Date().toISOString() }, { onConflict: "id" });
    } catch { solde = undefined; }
  }

  // 2) Commande filée au bot (source de vérité).
  const r = await envoyerCommande("coffre.ajuster", { cible, montant: m, mode });
  if (!r.ok) return r;
  await emettreEvenement({ aggregate: "coffre", type: "coffre.ajuste", cibleLibelle: `Coffre ${cible}`, apres: solde != null ? { solde } : null, payload: { mode, montant: m } });
  return { ok: true, solde };
}

// ── Factures ──
export async function creerFacture(data: { objet: string; montant: number; clientNom?: string; type?: string; remuneration?: string }): Promise<CommandeResult> {
  if (!data.objet || data.objet.trim().length < 2) return { ok: false, error: "Indique l'objet de la facture." };
  if (!Number.isFinite(data.montant) || data.montant < 0) return { ok: false, error: "Montant invalide." };
  return envoyerCommande("facture.create", { ...data, montant: Math.round(data.montant) });
}
export async function supprimerFacture(id: string): Promise<CommandeResult> {
  return supprimerFiable({ type: "facture.delete", payload: { id }, table: "Facture", colonne: "id", valeur: id, okMsg: "Facture supprimée." });
}

// ── Portefeuilles perso ──
// Payer un autre membre (l'émetteur = le membre connecté, résolu côté bot).
export async function payerMembre(membreId: string, versNom: string, montant: number, raison: string): Promise<CommandeResult> {
  if (!membreId) return { ok: false, error: "Choisis un destinataire." };
  const m = Math.round(Number(montant) || 0);
  if (m <= 0) return { ok: false, error: "Montant invalide." };
  return envoyerCommande("wallet.payer", { membreId, versNom, montant: m, raison: (raison || "").slice(0, 120) });
}
// Créditer / débiter un portefeuille (Direction). Créer de la monnaie sur un
// portefeuille arbitraire est un pouvoir de Direction — garde fail-closed.
export async function ajusterArgent(membreId: string, montant: number, raison: string): Promise<CommandeResult> {
  if (!(await requireDirection())) return { ok: false, error: "Accès refusé — réservé à la Direction." };
  if (!membreId) return { ok: false, error: "Choisis un membre." };
  const m = Math.round(Number(montant) || 0);
  if (!m) return { ok: false, error: "Montant nul." };
  const r = await envoyerCommande("wallet.ajuster", { membreId, montant: m, raison: (raison || "").slice(0, 120) });
  if (r.ok) await emettreEvenement({ aggregate: "wallet", type: "wallet.ajuste", cibleId: membreId, cibleLibelle: "Portefeuille", payload: { montant: m, raison: (raison || "").slice(0, 120) } });
  return r;
}

// ── DOSSIER CLIENT (miroir IWC du dossier patient, dérivé à la lecture) ───────
// Reconstruit toute l'activité d'un client (ventes & contrats & RDV armurerie +
// factures) à partir des tables existantes, sans nouvelle table.
const _normCli = (v: unknown) => String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
const _rowsCli = async (p: PromiseLike<{ data: unknown }>): Promise<Record<string, unknown>[]> => { try { return ((await p).data as Record<string, unknown>[]) || []; } catch { return []; } };
export type ClientActe = { id: string; type: "Vente" | "Contrat" | "Rendez-vous" | "Facture" | "Télégramme"; libelle: string; montant: number | null; statut: string | null; date: string };
export type DossierClient = { nom: string; totalDepense: number; nbActes: number; actes: ClientActe[] };
// Fiche 360° : le dossier + la fiche client (statut/blacklist/notes) + RDV
// généraux & télégrammes. Vue unique, dérivée à la lecture (aucune table neuve).
export type FicheClient = { nom: string; statut: string | null; notes: string | null; contact: string | null; totalDepense: number; nbActes: number; actes: ClientActe[] };

export async function getClientsListe(): Promise<string[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  const [cli, ventes, contrats] = await Promise.all([
    _rowsCli(admin.from("ArmurerieClient").select("nom").limit(500)),
    _rowsCli(admin.from("ArmurerieVente").select("acquereur").order("createdAt", { ascending: false }).limit(300)),
    _rowsCli(admin.from("ArmurerieContrat").select("clientNom").limit(300)),
  ]);
  const set = new Set<string>();
  const add = (v: unknown) => { const t = String(v ?? "").trim(); if (t) set.add(t); };
  for (const r of cli) add(r.nom);
  for (const r of ventes) add(r.acquereur);
  for (const r of contrats) add(r.clientNom);
  return [...set].sort((a, b) => a.localeCompare(b)).slice(0, 400);
}

export async function getDossierClient(nom: string): Promise<DossierClient> {
  const vide: DossierClient = { nom: String(nom ?? "").trim(), totalDepense: 0, nbActes: 0, actes: [] };
  const admin = createAdminClient();
  const cible = _normCli(nom);
  if (!admin || !cible) return vide;
  const [ventes, contrats, rdvs, factures] = await Promise.all([
    _rowsCli(admin.from("ArmurerieVente").select("id,acquereur,marque,modele,prix,quantite,statut,createdAt,dateVente").order("createdAt", { ascending: false }).limit(500)),
    _rowsCli(admin.from("ArmurerieContrat").select("id,clientNom,arme,prix,statut,createdAt").order("createdAt", { ascending: false }).limit(300)),
    _rowsCli(admin.from("ArmurerieRdv").select("id,clientNom,commande,lieu,statut,dateRdv").order("dateRdv", { ascending: false }).limit(300)),
    _rowsCli(admin.from("Facture").select("id,clientNom,objet,montant,createdAt").order("createdAt", { ascending: false }).limit(300)),
  ]);
  const actes: ClientActe[] = [];
  let dep = 0;
  for (const v of ventes) { if (_normCli(v.acquereur) !== cible) continue; const m = Number(v.prix) || 0; dep += m; const lib = [v.marque, v.modele].filter(Boolean).join(" ") || "Vente"; actes.push({ id: "v" + v.id, type: "Vente", libelle: `${Number(v.quantite) || 1}× ${lib}`, montant: m, statut: v.statut ? String(v.statut) : null, date: String(v.createdAt || v.dateVente || "") }); }
  for (const c of contrats) { if (_normCli(c.clientNom) !== cible) continue; actes.push({ id: "c" + c.id, type: "Contrat", libelle: String(c.arme || "Contrat"), montant: Number(c.prix) || 0, statut: c.statut ? String(c.statut) : null, date: String(c.createdAt || "") }); }
  for (const r of rdvs) { if (_normCli(r.clientNom) !== cible) continue; actes.push({ id: "r" + r.id, type: "Rendez-vous", libelle: String(r.commande || r.lieu || "Rendez-vous"), montant: null, statut: r.statut ? String(r.statut) : null, date: String(r.dateRdv || "") }); }
  for (const f of factures) { if (_normCli(f.clientNom) !== cible) continue; actes.push({ id: "f" + f.id, type: "Facture", libelle: String(f.objet || "Facture"), montant: Number(f.montant) || 0, statut: null, date: String(f.createdAt || "") }); }
  actes.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { nom: String(nom).trim(), totalDepense: dep, nbActes: actes.length, actes };
}

// Fiche client 360° : le dossier (getDossierClient) ENRICHI de la fiche
// ArmurerieClient (statut/blacklist/notes/contact), des RDV généraux (table Rdv)
// et des télégrammes. Vue unique, deep-linkable via /repertoire/client/[nom].
export async function getFicheClient(nom: string): Promise<FicheClient> {
  const base = await getDossierClient(nom);
  const vide: FicheClient = { nom: base.nom, statut: null, notes: null, contact: null, totalDepense: base.totalDepense, nbActes: base.nbActes, actes: base.actes };
  const admin = createAdminClient();
  const cible = _normCli(nom);
  if (!admin || !cible) return vide;
  const [clients, rdvsGen, tgWeb] = await Promise.all([
    _rowsCli(admin.from("ArmurerieClient").select("nom,statut,notes,telegramme").limit(500)),
    _rowsCli(admin.from("Rdv").select("id,nomRP,type,creneau,statut,createdAt").order("createdAt", { ascending: false }).limit(300)),
    _rowsCli(admin.from("TelegrammeWeb").select("id,nom,message,statut,createdAt").order("createdAt", { ascending: false }).limit(300)),
  ]);
  const meta = clients.find((c) => _normCli(c.nom) === cible);
  const actes: ClientActe[] = [...base.actes];
  for (const r of rdvsGen) { if (_normCli(r.nomRP) !== cible) continue; actes.push({ id: "gr" + r.id, type: "Rendez-vous", libelle: String(r.type || "Rendez-vous"), montant: null, statut: r.statut ? String(r.statut) : null, date: String(r.creneau || r.createdAt || "") }); }
  for (const t of tgWeb) { if (_normCli(t.nom) !== cible) continue; actes.push({ id: "tg" + t.id, type: "Télégramme", libelle: String(t.message || "Télégramme").slice(0, 90), montant: null, statut: t.statut ? String(t.statut) : null, date: String(t.createdAt || "") }); }
  actes.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return {
    nom: base.nom,
    statut: meta ? String(meta.statut || "actif") : null,
    notes: meta && meta.notes ? String(meta.notes) : null,
    contact: meta && meta.telegramme ? String(meta.telegramme) : null,
    totalDepense: base.totalDepense, nbActes: actes.length, actes,
  };
}
