import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAcces } from "@/lib/queries";
import { getConfig } from "@/lib/dispensaire-roles";

// ── Centre de notifications (alertes intelligentes dérivées de l'état courant) ─
export type Notif = { id: string; severite: "alerte" | "attention" | "info"; type: string; texte: string; href: string };

const PARIS = "Europe/Paris";
const ymdParis = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: PARIS, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const num = (v: unknown) => Number(v) || 0;
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
