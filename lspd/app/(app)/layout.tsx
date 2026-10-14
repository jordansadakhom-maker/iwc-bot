import { redirect } from "next/navigation";
import { Shield } from "lucide-react";
import { getActeur, peut, type Perm } from "@/lib/rbac";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";

// Accès à chaque module par permission (le menu n'affiche que l'autorisé).
const ACCES: { href: string; perm: Perm }[] = [
  { href: "/dashboard", perm: "dashboard.voir" },
  { href: "/agents", perm: "agents.voir" },
  { href: "/patrouilles", perm: "interventions.voir" },
  { href: "/dispatch", perm: "interventions.voir" },
  { href: "/audit", perm: "audit.voir" },
  { href: "/admin", perm: "admin.config" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const a = await getActeur();
  if (!a.connecte) redirect("/login");

  // Compte Discord reconnu mais pas (encore) dans l'effectif → écran d'attente.
  if (!a.autorise) {
    return (
      <main className="grid min-h-screen place-items-center bg-bg px-5">
        <div className="w-full max-w-md text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl" style={{ background: "color-mix(in srgb,var(--warn) 20%,transparent)" }}>
            <Shield className="h-6 w-6" style={{ color: "var(--warn)" }} />
          </span>
          <h1 className="mt-4 font-display text-xl font-bold uppercase tracking-[0.04em] text-ink">Compte en attente d&apos;affectation</h1>
          <p className="mt-2 text-[0.88rem] text-muted">
            Bonjour <b className="text-ink">{a.nom}</b> — ton compte Discord est bien reconnu, mais il n&apos;est pas encore rattaché à l&apos;effectif du LSPD.
            Un responsable doit t&apos;ajouter comme agent et t&apos;attribuer un grade pour débloquer l&apos;accès.
          </p>
        </div>
      </main>
    );
  }

  const allowed = ACCES.filter((x) => peut(a, x.perm)).map((x) => x.href);
  return (
    <Shell nomAgent={a.nom} gradeNom={a.gradeNom} allowed={allowed}>
      {children}
    </Shell>
  );
}
