import type { createAdminClient } from "@/lib/supabase/admin";

// ============================================================
// Réapprovisionnement de l'armurerie — « réappro quotidien » RÉEL.
// Chaque produit vendable (hors « à la demande ») est remonté à un niveau
// CIBLE par catégorie. Règle de sécurité : on ne RÉDUIT jamais un stock —
// on remplit seulement jusqu'à la cible si l'article est en-dessous (top-up
// « par-level », comme un vrai magasin qui se recharge).
//
// Aucune migration SQL n'est requise : les cibles vivent ici, dans le code.
// Pour ajuster un niveau, il suffit de modifier ce tableau.
// ============================================================

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

// Niveaux cibles par catégorie de produit. Les munitions se rechargent haut,
// les armes plus bas (pièces onéreuses), les accessoires au milieu.
export const CIBLES_REAPPRO: Record<string, number> = {
  Armes: 5,
  Accessoires: 12,
  Munitions: 250,
  Consommables: 25,
};
// Cible pour toute catégorie non listée ci-dessus.
export const CIBLE_DEFAUT = 10;

export function cibleReappro(categorie?: string | null): number {
  if (!categorie) return CIBLE_DEFAUT;
  return CIBLES_REAPPRO[categorie] ?? CIBLE_DEFAUT;
}

// Remonte chaque produit sous sa cible jusqu'à celle-ci. Regroupe les mises à
// jour par valeur cible → une seule requête par palier (chunké à 100 ids), au
// lieu d'une requête par produit. Retourne le nombre de produits remis à niveau.
export async function reapprovisionner(admin: Admin): Promise<{ maj: number; total: number }> {
  const { data, error } = await admin.from("ArmurerieProduit").select("id,categorie,stock,aLaDemande");
  if (error || !data) return { maj: 0, total: 0 };
  const produits = data as { id: string; categorie?: string | null; stock?: number | null; aLaDemande?: boolean | null }[];

  // id à mettre à jour, regroupés par valeur cible.
  const parCible = new Map<number, string[]>();
  for (const p of produits) {
    if (p.aLaDemande) continue; // « à la demande » = fabriqué sur commande, jamais stocké
    const cible = cibleReappro(p.categorie);
    const actuel = Number(p.stock) || 0;
    if (actuel >= cible) continue; // déjà au niveau (ou au-dessus) → on n'y touche pas
    const arr = parCible.get(cible) ?? [];
    arr.push(p.id);
    parCible.set(cible, arr);
  }

  let maj = 0;
  for (const [cible, ids] of parCible) {
    for (let i = 0; i < ids.length; i += 100) {
      const lot = ids.slice(i, i + 100);
      const { error: e } = await admin.from("ArmurerieProduit").update({ stock: cible }).in("id", lot);
      if (!e) maj += lot.length;
    }
  }
  return { maj, total: produits.length };
}
