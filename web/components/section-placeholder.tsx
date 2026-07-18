import { NAV } from "@/lib/data";
import { Hammer, type LucideIcon } from "lucide-react";

// Page « en préparation » réutilisable pour les sections pas encore construites.
// Évite les 404 : le menu est complet, chaque section affiche un état propre et
// cohérent avec le design en attendant d'être développée.
const DESCRIPTIONS: Record<string, string> = {
  "/finances": "Coffres légal & illégal, mouvements, courbes et exports comptables.",
  "/operations": "Préparation par étapes, opérations en cours et terminées, contrats de la Confrérie.",
  "/renseignement": "Informateurs, rapports, fiabilité des sources et personnes traquées.",
  "/membres": "Annuaire de la meute, grades, pôles, candidatures et sanctions.",
  "/medical": "Dossiers médicaux, blessures, ordonnances et suivis de traitement.",
  "/agenda": "Rendez-vous clients, créneaux, contacts et carnet d'adresses.",
  "/documents": "Papiers officiels, livre d'or et archives de la maison.",
  "/inventaire": "Matériel, stock d'armement et véhicules des deux pôles.",
  "/communication": "Annonces, télégrammes et messages diffusés à la meute.",
  "/notifications": "Centre de notifications : validations, RDV, changements de statut.",
  "/administration": "Réglages, permissions, journal d'audit et outils de direction.",
};

export function SectionPlaceholder({ href }: { href: string }) {
  const item = NAV.flatMap((g) => g.items).find((i) => i.href === href);
  const Icon: LucideIcon = item?.icon ?? Hammer;
  const titre = item?.label ?? "Section";
  const desc = DESCRIPTIONS[href] ?? "Cette section arrive prochainement.";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.9rem] tracking-[0.01em]">{titre}</h1>
          <div className="mt-1 text-[0.85rem] text-muted">{desc}</div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[0.72rem] text-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} />
          En préparation
        </span>
      </div>

      <section
        className="grid place-items-center rounded-card border border-border bg-surface px-6 py-16 text-center shadow-card"
        style={{ background: "linear-gradient(180deg,var(--surface),color-mix(in srgb,var(--surface) 88%,#000))" }}
      >
        <span className="mb-4 grid h-16 w-16 place-items-center rounded-2xl text-accent" style={{ background: "color-mix(in srgb,var(--accent) 14%,transparent)" }}>
          <Icon className="h-7 w-7" strokeWidth={1.7} />
        </span>
        <h2 className="font-display text-xl">Section en préparation</h2>
        <p className="mt-2 max-w-md text-[0.88rem] leading-relaxed text-muted">{desc}</p>
        <p className="mt-4 max-w-md text-[0.8rem] leading-relaxed text-faint">
          Le tableau de bord est déjà connecté à tes vraies données. Les autres sections arrivent progressivement — dis-moi laquelle tu veux en priorité.
        </p>
      </section>
    </>
  );
}
