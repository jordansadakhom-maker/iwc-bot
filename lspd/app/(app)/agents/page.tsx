import { Lock, AlertTriangle, Database } from "lucide-react";
import { requirePerm, peut } from "@/lib/rbac";
import { getRoster } from "@/lib/agents";
import { Card, Banner } from "@/components/ui";
import { AgentsRoster } from "@/components/agents-roster";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const a = await requirePerm("agents.voir");
  if (!a) {
    return (
      <Card className="text-center">
        <Lock className="mx-auto h-6 w-6 text-faint" />
        <p className="mt-2 text-[0.9rem] text-muted">Ton grade ne donne pas accès à l&apos;effectif.</p>
      </Card>
    );
  }

  const canGerer = peut(a, "agents.gerer");
  const { pret, connectee, agents, grades, unites } = await getRoster();

  return (
    <div className="flex flex-col gap-4">
      {!connectee ? (
        <Banner tone="warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--warn)" }} />
          <span>Base de données non connectée. Renseigne les variables Supabase, puis lance <code className="font-num text-[0.8em]">sql/00-socle.sql</code> pour gérer l&apos;effectif.</span>
        </Banner>
      ) : !pret ? (
        <Banner tone="warn">
          <Database className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--warn)" }} />
          <span>La table des agents n&apos;est pas encore prête. Lance <code className="font-num text-[0.8em]">sql/00-socle.sql</code> dans Supabase pour activer la gestion de l&apos;effectif.</span>
        </Banner>
      ) : null}

      <AgentsRoster agents={agents} grades={grades} unites={unites} canGerer={canGerer} />
    </div>
  );
}
