import { ShieldAlert } from "lucide-react";

// Écran de refus pour un outil de l'espace Direction : affiché à la place du
// contenu quand le grade du compte ne porte pas la permission requise — y compris
// en accédant directement à l'URL (protection serveur, aucune donnée exposée).
export function AccesDirection({ titre = "Accès réservé à la Direction", sous }: { titre?: string; sous?: string }) {
  return (
    <div className="rounded-[14px] border border-border bg-surface p-8 text-center">
      <ShieldAlert className="mx-auto h-6 w-6 text-faint" />
      <p className="mt-2 text-[0.9rem] font-semibold text-ink">{titre}</p>
      <p className="mx-auto mt-1 max-w-sm text-[0.82rem] leading-relaxed text-muted">{sous || "Cet outil fait partie de l'espace Direction. Ton grade ne t'y donne pas accès."}</p>
    </div>
  );
}
