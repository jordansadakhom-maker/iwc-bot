import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAcces } from "@/lib/queries";

// ── Types du Répertoire des contacts (Dispensaire de Saint-Denis) ──
export type DispCategorie = { id: string; nom: string; couleur: string | null; ordre: number };
export type DispContact = {
  id: string; categorieId: string | null; nom: string; relation: string | null;
  responsable: string | null; description: string | null; adresse: string | null;
  telegramme: string | null; contactSecondaire: string | null; horaires: string | null; notes: string | null;
  typeService: string | null; produits: string | null; tarifs: string | null; banque: string | null; moyensContact: string | null;
  source: string; createdAt: string | null; updatedAt: string | null; updatedBy: string | null;
};
export type DispHisto = {
  id: string; createdAt: string | null; contactId: string | null; contactNom: string | null;
  action: string; champ: string | null; ancien: string | null; nouveau: string | null; par: string | null;
};
export type DispData = {
  connecte: boolean; pret: boolean; canEdit: boolean;
  categories: DispCategorie[]; contacts: DispContact[]; historique: DispHisto[];
};

const CATS_DEFAUT: DispCategorie[] = [
  { id: "cat-fournisseurs", nom: "Fournisseurs", couleur: null, ordre: 1 },
  { id: "cat-entreprises", nom: "Entreprises", couleur: null, ordre: 2 },
  { id: "cat-services", nom: "Services publics", couleur: null, ordre: 3 },
  { id: "cat-artisans", nom: "Artisans", couleur: null, ordre: 4 },
  { id: "cat-mines", nom: "Mines", couleur: null, ordre: 5 },
  { id: "cat-menuiseries", nom: "Menuiseries", couleur: null, ordre: 6 },
  { id: "cat-armuriers", nom: "Armuriers", couleur: null, ordre: 7 },
  { id: "cat-autres", nom: "Autres partenaires", couleur: null, ordre: 8 },
];

type Raw = Record<string, unknown>;
const s = (v: unknown) => (v == null ? null : String(v));

export async function getDispensaire(): Promise<DispData> {
  const vide: DispData = { connecte: false, pret: false, canEdit: false, categories: CATS_DEFAUT, contacts: [], historique: [] };
  const admin = createAdminClient();
  if (!admin) return vide;

  const acces = await getAcces();
  const [catR, ctR, hiR] = await Promise.all([
    admin.from("DispensaireCategorie").select("*").order("ordre", { ascending: true }),
    admin.from("DispensaireContact").select("*"),
    admin.from("DispensaireHistorique").select("*").order("createdAt", { ascending: false }).limit(120),
  ]);

  const pret = !catR.error && !ctR.error;
  if (!pret) return { ...vide, connecte: true, canEdit: acces.peutMedical };

  const catsRaw = ((catR.data || []) as Raw[]).map((c) => ({ id: String(c.id), nom: String(c.nom || c.id), couleur: s(c.couleur), ordre: Number(c.ordre) || 0 }));
  const categories = catsRaw.length ? catsRaw.sort((a, b) => a.ordre - b.ordre) : CATS_DEFAUT;

  const contacts: DispContact[] = ((ctR.data || []) as Raw[]).map((c) => ({
    id: String(c.id), categorieId: s(c.categorieId), nom: String(c.nom || "Contact"), relation: s(c.relation),
    responsable: s(c.responsable), description: s(c.description), adresse: s(c.adresse),
    telegramme: s(c.telegramme), contactSecondaire: s(c.contactSecondaire), horaires: s(c.horaires), notes: s(c.notes),
    typeService: s(c.typeService), produits: s(c.produits), tarifs: s(c.tarifs), banque: s(c.banque), moyensContact: s(c.moyensContact),
    source: String(c.source || "site"), createdAt: s(c.createdAt), updatedAt: s(c.updatedAt), updatedBy: s(c.updatedBy),
  }));

  const historique: DispHisto[] = hiR.error ? [] : ((hiR.data || []) as Raw[]).map((h) => ({
    id: String(h.id), createdAt: s(h.createdAt), contactId: s(h.contactId), contactNom: s(h.contactNom),
    action: String(h.action || "modification"), champ: s(h.champ), ancien: s(h.ancien), nouveau: s(h.nouveau), par: s(h.par),
  }));

  return { connecte: true, pret: true, canEdit: acces.peutMedical, categories, contacts, historique };
}
