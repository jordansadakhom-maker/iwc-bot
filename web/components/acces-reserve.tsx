import Link from "next/link";
import { Lock, ArrowLeft } from "lucide-react";

// Écran « Accès réservé » : affiché à la place d'une page sensible quand le
// membre connecté n'a pas le rôle requis. Le calcul du droit (fail-open si le
// grade est inconnu) se fait côté serveur — voir getAcces().
export function AccesReserve({ titre, detail }: { titre: string; detail?: string }) {
  return (
    <div className="grid min-h-[60vh] place-items-center px-5">
      <div className="flex max-w-[440px] flex-col items-center text-center">
        <span className="mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-border-2 text-accent" style={{ background: "radial-gradient(circle at 30% 25%, color-mix(in srgb,var(--accent) 24%,transparent), transparent 70%), var(--surface)" }}>
          <Lock className="h-7 w-7" strokeWidth={1.7} />
        </span>
        <h1 className="font-display text-2xl tracking-[0.06em]">Accès réservé — {titre}</h1>
        <p className="mt-3 text-[0.88rem] leading-relaxed text-muted">
          {detail || "Cette section est réservée à la Direction et aux membres habilités. Si tu penses devoir y accéder, rapproche-toi d'un membre de la Direction."}
        </p>
        <Link href="/dashboard" className="mt-6 inline-flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-[0.85rem] font-semibold text-muted transition hover:border-border-2 hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Retour au tableau de bord
        </Link>
      </div>
    </div>
  );
}
