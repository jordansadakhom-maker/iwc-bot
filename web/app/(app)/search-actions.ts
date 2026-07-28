"use server";

import { createAdminClient } from "@/lib/supabase/admin";

// Recherche globale (palette ⌘K) : membres, opérations, clients & contrats
// d'armurerie, armes, demandes, licences, rendez-vous, télégrammes et factures.
// Lecture seule via la clé service. Chaque source est tolérante (une table/colonne
// absente n'empêche jamais les autres résultats).
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
  const [membres, ops, clients, contrats, armes, demandes, licences, rdvs, telegrammes, factures] = await Promise.all([
    safe(admin.from("Membre").select("id,nomIC,grade").or(`nomIC.ilike.${like},grade.ilike.${like}`).limit(6)),
    safe(admin.from("Operation").select("id,cible,phase").ilike("cible", like).limit(6)),
    safe(admin.from("ArmurerieClient").select("id,nom,telegramme").ilike("nom", like).limit(6)),
    safe(admin.from("ArmurerieContrat").select("id,clientNom,arme,statut").ilike("clientNom", like).limit(6)),
    safe(admin.from("Arme").select("id,serie,type").or(`serie.ilike.${like},type.ilike.${like}`).limit(6)),
    safe(admin.from("Demande").select("id,ref,titre,statut").or(`titre.ilike.${like},ref.ilike.${like}`).limit(6)),
    safe(admin.from("Licence").select("id,numero,nom,prenom,typeCode,statut").or(`nom.ilike.${like},prenom.ilike.${like},numero.ilike.${like}`).limit(6)),
    safe(admin.from("Rdv").select("id,nomRP,type,statut").or(`nomRP.ilike.${like},lieu.ilike.${like}`).limit(6)),
    safe(admin.from("TelegrammeWeb").select("id,nom,statut").or(`nom.ilike.${like},message.ilike.${like}`).limit(6)),
    safe(admin.from("Facture").select("id,numero,objet,clientNom").or(`clientNom.ilike.${like},numero.ilike.${like},objet.ilike.${like}`).limit(6)),
  ]);
  const s = (v: unknown) => (v == null ? "" : String(v));
  const out: ResultatRecherche[] = [];
  membres.forEach((m) => out.push({ type: "Membre", label: s(m.nomIC) || "—", sous: s(m.grade), href: "/membres" }));
  ops.forEach((o) => out.push({ type: "Opération", label: s(o.cible) || "—", sous: s(o.phase), href: "/operations" }));
  clients.forEach((c) => { const n = s(c.nom); out.push({ type: "Client", label: n || "—", sous: s(c.telegramme), href: n ? `/repertoire/client/${encodeURIComponent(n)}` : "/armurerie" }); });
  contrats.forEach((c) => { const n = s(c.clientNom); out.push({ type: "Contrat", label: n || "—", sous: [s(c.arme), s(c.statut)].filter(Boolean).join(" · "), href: n ? `/repertoire/client/${encodeURIComponent(n)}` : "/armurerie" }); });
  armes.forEach((a) => out.push({ type: "Arme", label: s(a.serie) || "—", sous: s(a.type), href: "/inventaire" }));
  demandes.forEach((d) => out.push({ type: "Demande", label: s(d.titre) || "—", sous: [s(d.ref), s(d.statut)].filter(Boolean).join(" · "), href: `/demandes/${s(d.id)}` }));
  licences.forEach((l) => { const nom = [s(l.prenom), s(l.nom)].filter(Boolean).join(" ") || s(l.numero); out.push({ type: "Licence", label: nom || "—", sous: [s(l.numero), s(l.statut)].filter(Boolean).join(" · "), href: "/licences" }); });
  rdvs.forEach((r) => out.push({ type: "Rendez-vous", label: s(r.nomRP) || "—", sous: [s(r.type), s(r.statut)].filter(Boolean).join(" · "), href: "/communication#rdv-clients" }));
  telegrammes.forEach((t) => out.push({ type: "Télégramme", label: s(t.nom) || "—", sous: s(t.statut), href: "/communication#telegrammes" }));
  factures.forEach((f) => out.push({ type: "Facture", label: s(f.clientNom) || s(f.numero) || "—", sous: [s(f.numero), s(f.objet)].filter(Boolean).join(" · "), href: "/finances" }));

  // Tri de pertinence : commence par le terme > contient le terme > reste
  // (stable, sans changer le contenu — juste l'ordre d'apparition).
  const t = terme.toLowerCase();
  const score = (r: ResultatRecherche) => { const l = r.label.toLowerCase(); return l.startsWith(t) ? 0 : l.includes(t) ? 1 : 2; };
  return out.map((r, i) => ({ r, i })).sort((a, b) => score(a.r) - score(b.r) || a.i - b.i).map((x) => x.r);
}
