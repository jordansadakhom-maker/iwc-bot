"use server";

import { createAdminClient } from "@/lib/supabase/admin";

// Recherche globale (palette ⌘K) : cherche à travers membres, opérations,
// clients d'armurerie, contrats et armes. Lecture seule via la clé service.
export type ResultatRecherche = { type: string; label: string; sous: string; href: string };
type Row = Record<string, unknown>;

export async function rechercheGlobale(q: string): Promise<ResultatRecherche[]> {
  const terme = q.trim();
  if (terme.length < 2) return [];
  const admin = createAdminClient();
  if (!admin) return [];
  const like = `%${terme.replace(/[%_,]/g, " ")}%`;
  const safe = async (p: PromiseLike<{ data: Row[] | null; error: unknown }>): Promise<Row[]> => {
    try { const { data, error } = await p; return error ? [] : (data || []); } catch { return []; }
  };
  const [membres, ops, clients, contrats, armes] = await Promise.all([
    safe(admin.from("Membre").select("id,nomIC,grade").ilike("nomIC", like).limit(6)),
    safe(admin.from("Operation").select("id,cible,phase").ilike("cible", like).limit(6)),
    safe(admin.from("ArmurerieClient").select("id,nom,telegramme").ilike("nom", like).limit(6)),
    safe(admin.from("ArmurerieContrat").select("id,clientNom,arme,statut").ilike("clientNom", like).limit(6)),
    safe(admin.from("Arme").select("id,serie,type").ilike("serie", like).limit(6)),
  ]);
  const s = (v: unknown) => (v == null ? "" : String(v));
  const out: ResultatRecherche[] = [];
  membres.forEach((m) => out.push({ type: "Membre", label: s(m.nomIC) || "—", sous: s(m.grade), href: "/membres" }));
  ops.forEach((o) => out.push({ type: "Opération", label: s(o.cible) || "—", sous: s(o.phase), href: "/operations" }));
  clients.forEach((c) => out.push({ type: "Client", label: s(c.nom) || "—", sous: s(c.telegramme), href: "/armurerie" }));
  contrats.forEach((c) => out.push({ type: "Contrat", label: s(c.clientNom) || "—", sous: [s(c.arme), s(c.statut)].filter(Boolean).join(" · "), href: "/armurerie" }));
  armes.forEach((a) => out.push({ type: "Arme", label: s(a.serie) || "—", sous: s(a.type), href: "/inventaire" }));
  return out;
}
