import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAcces } from "@/lib/queries";
import { getConfig } from "@/lib/dispensaire-roles";

// ── Centre de notifications (alertes intelligentes dérivées de l'état courant) ─
export type Notif = { id: string; severite: "alerte" | "attention" | "info"; type: string; texte: string; href: string };
// Fil d'activité récente : mouvements de stock (± / déplacements) et coffres.
export type Activite = { id: string; genre: "entree" | "sortie" | "deplacement" | "coffre"; texte: string; par: string | null; at: string; href: string };

const PARIS = "Europe/Paris";
const ymdParis = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: PARIS, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const num = (v: unknown) => Number(v) || 0;
const str = (v: unknown) => (v == null ? null : String(v));
async function q<T>(p: PromiseLike<{ data: T | null }>): Promise<T | null> { try { return (await p).data; } catch { return null; } }

function lundiCourant(): string {
  const today = ymdParis(new Date().toISOString());
  const base = new Date(today + "T12:00:00Z");
  const dow = (base.getUTCDay() + 6) % 7;          // 0 = lundi
  base.setUTCDate(base.getUTCDate() - dow);
  return base.toISOString().slice(0, 10);
}

export async function getNotifications(): Promise<{ items: Notif[]; count: number }> {
  const admin = createAdminClient();
  if (!admin) return { items: [], count: 0 };
  let habilite = false;
  try { habilite = (await getAcces()).peutMedical; } catch { habilite = true; }
  const cfg = await getConfig();
  const monday = lundiCourant();

  const [stock, matieres, factures, ventes, frais, salaries] = await Promise.all([
    q<Record<string, unknown>[]>(admin.from("DispensaireStock").select("nom,stock,seuil,unite")),
    q<Record<string, unknown>[]>(admin.from("DispensaireMatiere").select("nom,quantite,seuil")),
    q<Record<string, unknown>[]>(admin.from("DispensaireFacture").select("objet,montant,statut,dateEcheance")),
    q<Record<string, unknown>[]>(admin.from("DispensaireVente").select("patient,quantite,item,createdAt").order("createdAt", { ascending: false }).limit(300)),
    q<Record<string, unknown>[]>(admin.from("DispensaireFrais").select("statut")),
    q<Record<string, unknown>[]>(admin.from("DispensaireSalarie").select("nom,statut,absInjustifiees")),
  ]);

  const items: Notif[] = [];
  const today = ymdParis(new Date().toISOString());

  for (const r of stock || []) if (num(r.seuil) > 0 && num(r.stock) <= num(r.seuil)) items.push({ id: "st-" + r.nom, severite: "alerte", type: "Stock faible", texte: `Stock faible : ${r.nom} (${num(r.stock)}${r.unite ? " " + r.unite : ""} / seuil ${num(r.seuil)})`, href: "/dispensaire/stockage" });
  for (const r of matieres || []) if (num(r.seuil) > 0 && num(r.quantite) <= num(r.seuil)) items.push({ id: "mp-" + r.nom, severite: "alerte", type: "Matière première", texte: `Matière première basse : ${r.nom} (${num(r.quantite)} / seuil ${num(r.seuil)})`, href: "/dispensaire/matieres" });

  if (habilite) for (const f of factures || []) { const ouv = String(f.statut) === "non_payee" || String(f.statut) === "dossier_police"; if (ouv && f.dateEcheance && String(f.dateEcheance).slice(0, 10) < today) items.push({ id: "fa-" + f.objet, severite: "alerte", type: "Facture", texte: `Facture en retard : ${f.objet} (${num(f.montant)}$)`, href: "/dispensaire/factures" }); }

  // Ventes : patients ayant dépassé 10 bandages cette semaine.
  const bandagesSem = new Map<string, number>();
  for (const v of ventes || []) if (/bandage/i.test(String(v.item || "")) && ymdParis(String(v.createdAt)) >= monday) bandagesSem.set(String(v.patient), (bandagesSem.get(String(v.patient)) || 0) + num(v.quantite));
  for (const [patient, n] of bandagesSem) if (n > cfg.plafondBandage) items.push({ id: "vt-" + patient, severite: "attention", type: "Limite de vente", texte: `${patient} a dépassé la limite (${n}/${cfg.plafondBandage} bandages cette semaine)`, href: "/dispensaire/ventes" });

  const fraisAttente = (frais || []).filter((f) => String(f.statut) === "en_attente").length;
  if (fraisAttente) items.push({ id: "fr", severite: "attention", type: "Notes de frais", texte: `${fraisAttente} note(s) de frais à valider`, href: "/dispensaire/frais" });

  if (habilite) for (const s of salaries || []) if (String(s.statut || "actif") === "actif" && num(s.absInjustifiees) >= cfg.seuilRenvoi) items.push({ id: "rh-" + s.nom, severite: "alerte", type: "RH", texte: `${s.nom} : ${num(s.absInjustifiees)} absences injustifiées — éligible au renvoi`, href: "/dispensaire/rh" });

  const ordre = { alerte: 0, attention: 1, info: 2 };
  items.sort((a, b) => ordre[a.severite] - ordre[b.severite]);
  return { items, count: items.length };
}

// Compteur léger pour la pastille de l'en-tête.
export async function getNotifCount(): Promise<number> {
  try { return (await getNotifications()).count; } catch { return 0; }
}

// Fil d'activité récente autour des coffres & du stock : objet ±, déplacement
// d'un coffre à l'autre, coffre créé ou modifié. Distinct des alertes (ne compte
// pas dans la pastille) — c'est une chronologie « ce qui vient de se passer ».
export async function getActiviteRecente(): Promise<Activite[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  const [mvts, coffres] = await Promise.all([
    q<Record<string, unknown>[]>(admin.from("DispensaireStockMouvement").select("id,nomItem,coffre,delta,apres,motif,par,createdAt").order("createdAt", { ascending: false }).limit(25)),
    q<Record<string, unknown>[]>(admin.from("DispensaireCoffre").select("id,nom,createdAt,updatedAt,updatedBy").order("updatedAt", { ascending: false }).limit(10)),
  ]);
  const out: Activite[] = [];
  for (const r of mvts || []) {
    const delta = num(r.delta), apres = num(r.apres);
    const deplacement = delta === 0 && /^déplac/i.test(String(r.motif || ""));
    if (deplacement) out.push({ id: "d" + r.id, genre: "deplacement", texte: `${r.nomItem} — ${r.motif}`, par: str(r.par), at: String(r.createdAt), href: "/dispensaire/coffres" });
    else out.push({ id: "m" + r.id, genre: delta >= 0 ? "entree" : "sortie", texte: `${r.nomItem} ${delta >= 0 ? "+" : ""}${delta} → ${apres}${r.coffre ? ` (${r.coffre})` : ""}${r.motif ? ` · ${r.motif}` : ""}`, par: str(r.par), at: String(r.createdAt), href: "/dispensaire/coffres" });
  }
  for (const r of coffres || []) {
    const cree = r.createdAt && r.updatedAt && String(r.createdAt) === String(r.updatedAt);
    out.push({ id: "cf" + r.id, genre: "coffre", texte: cree ? `Nouveau coffre : ${r.nom}` : `Coffre modifié : ${r.nom}`, par: str(r.updatedBy), at: String(r.updatedAt), href: "/dispensaire/coffres" });
  }
  return out.filter((a) => a.at && a.at !== "null").sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 20);
}
