"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAcces } from "@/lib/queries";

// Recherche globale instantanée dans tous les registres du dispensaire.
export type ResultItem = { type: string; label: string; sub: string | null; href: string };

async function q<T>(p: PromiseLike<{ data: T | null }>): Promise<T | null> { try { return (await p).data; } catch { return null; } }
const clean = (v: unknown) => { const t = String(v ?? "").replace(/[,()*%]/g, " ").trim(); return t.slice(0, 60); };

export async function rechercher(terme: string): Promise<ResultItem[]> {
  const s = clean(terme);
  if (s.length < 2) return [];
  const admin = createAdminClient();
  if (!admin) return [];
  const like = `*${s}*`;
  let habilite = false;
  try { habilite = (await getAcces()).peutMedical; } catch { habilite = true; }

  const [sal, stock, matieres, coffres, docs, rapports, ventes, certs, contacts, factures] = await Promise.all([
    q<Record<string, unknown>[]>(admin.from("DispensaireSalarie").select("nom,grade").or(`nom.ilike.${like},grade.ilike.${like}`).limit(6)),
    q<Record<string, unknown>[]>(admin.from("DispensaireStock").select("nom,coffre").or(`nom.ilike.${like},coffre.ilike.${like}`).limit(6)),
    q<Record<string, unknown>[]>(admin.from("DispensaireMatiere").select("nom,fournisseur").or(`nom.ilike.${like},fournisseur.ilike.${like}`).limit(6)),
    q<Record<string, unknown>[]>(admin.from("DispensaireCoffre").select("nom,emplacement,responsable").or(`nom.ilike.${like},emplacement.ilike.${like},responsable.ilike.${like}`).limit(6)),
    q<Record<string, unknown>[]>(admin.from("DispensaireDocument").select("titre,categorie").or(`titre.ilike.${like},categorie.ilike.${like}`).limit(6)),
    q<Record<string, unknown>[]>(admin.from("DispensaireRapport").select("titre,patient").or(`titre.ilike.${like},patient.ilike.${like}`).limit(6)),
    q<Record<string, unknown>[]>(admin.from("DispensaireVente").select("patient").ilike("patient", like).limit(20)),
    q<Record<string, unknown>[]>(admin.from("DispensaireCertificat").select("patient").ilike("patient", like).limit(20)),
    q<Record<string, unknown>[]>(admin.from("DispensaireContact").select("nom").ilike("nom", like).limit(6)),
    habilite ? q<Record<string, unknown>[]>(admin.from("DispensaireFacture").select("objet,destinataire").or(`objet.ilike.${like},destinataire.ilike.${like}`).limit(6)) : Promise.resolve(null),
  ]);

  const out: ResultItem[] = [];
  for (const r of sal || []) out.push({ type: "Salarié", label: String(r.nom), sub: r.grade ? String(r.grade) : null, href: "/dispensaire/rh" });
  for (const r of stock || []) out.push({ type: "Produit", label: String(r.nom), sub: r.coffre ? `Coffre ${r.coffre}` : null, href: "/dispensaire/stockage" });
  for (const r of matieres || []) out.push({ type: "Matière", label: String(r.nom), sub: r.fournisseur ? String(r.fournisseur) : null, href: "/dispensaire/matieres" });
  for (const r of coffres || []) out.push({ type: "Coffre", label: String(r.nom), sub: [r.emplacement, r.responsable].filter(Boolean).join(" · ") || null, href: "/dispensaire/coffres" });
  for (const r of docs || []) out.push({ type: "Document", label: String(r.titre), sub: r.categorie ? String(r.categorie) : null, href: "/dispensaire/documents" });
  for (const r of rapports || []) out.push({ type: "Rapport", label: String(r.titre), sub: r.patient ? String(r.patient) : null, href: "/dispensaire/rapports" });
  for (const r of contacts || []) out.push({ type: "Entreprise", label: String(r.nom), sub: null, href: "/repertoire" });
  for (const r of factures || []) out.push({ type: "Facture", label: String(r.objet), sub: r.destinataire ? String(r.destinataire) : null, href: "/dispensaire/factures" });

  // Patients (dédupliqués depuis ventes + certificats).
  const patients = new Set<string>();
  for (const r of [...(ventes || []), ...(certs || [])]) { const p = String(r.patient || "").trim(); if (p) patients.add(p); }
  [...patients].slice(0, 8).forEach((p) => out.push({ type: "Patient", label: p, sub: null, href: "/dispensaire/ventes" }));

  return out;
}
