import { ShieldAlert } from "lucide-react";
import { LogoutButton } from "@/components/logout-button";

// Écran affiché quand un compte connecté n'est PAS autorisé (liste blanche
// stricte du site autonome). On montre l'identité + l'ID Discord pour qu'un
// responsable puisse l'ajouter facilement dans l'Administration.
export function DispensaireAccesReserve({ nom, identifiant }: { nom: string; identifiant: string | null }) {
  return (
    <main
      className="grid min-h-screen place-items-center px-5 py-10"
      style={{ background: "radial-gradient(1000px 520px at 50% -10%, color-mix(in srgb,var(--accent) 12%,transparent), transparent 62%), var(--bg)" }}
    >
      <div className="w-full max-w-[440px] rounded-card border border-border bg-surface p-7 text-center shadow-card" style={{ background: "linear-gradient(180deg,var(--surface),color-mix(in srgb,var(--surface) 88%,#000))" }}>
        <div
          className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-border-2 text-accent"
          style={{ background: "radial-gradient(circle at 30% 25%, color-mix(in srgb,var(--accent) 30%,transparent), transparent 70%), var(--surface)" }}
        >
          <ShieldAlert className="h-7 w-7" strokeWidth={2} />
        </div>
        <h1 className="font-display text-xl tracking-[0.03em]">Accès réservé au personnel</h1>
        <p className="mx-auto mt-2 max-w-[340px] text-[0.86rem] leading-relaxed text-muted">
          Cet espace est réservé au personnel du Dispensaire de Saint-Denis. Ton compte n&apos;est pas encore autorisé.
        </p>

        <div className="mt-4 rounded-[12px] border border-border bg-surface-2 px-3 py-2.5 text-left text-[0.82rem]">
          <div className="text-[0.68rem] uppercase tracking-[0.06em] text-faint">Connecté en tant que</div>
          <div className="mt-0.5 font-semibold">{nom || "—"}</div>
          {identifiant ? <div className="mt-0.5 font-num text-[0.74rem] text-faint">ID Discord : {identifiant}</div> : null}
        </div>

        <p className="mt-3 text-[0.8rem] text-faint">
          Demande à un responsable de t&apos;ajouter dans l&apos;Administration{identifiant ? " (avec l'ID ci-dessus)" : ""}, puis reconnecte-toi.
        </p>

        <div className="mt-5 flex justify-center">
          <LogoutButton />
        </div>
      </div>
    </main>
  );
}
