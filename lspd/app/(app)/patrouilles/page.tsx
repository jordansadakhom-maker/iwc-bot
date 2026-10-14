import { Lock, AlertTriangle, Database } from "lucide-react";
import { requirePerm, peut } from "@/lib/rbac";
import { getPatrouillesData } from "@/lib/patrouilles";
import { Card, Banner } from "@/components/ui";
import { PatrouillesBoard } from "@/components/patrouilles-board";

export const dynamic = "force-dynamic";

export default async function PatrouillesPage() {
  const a = await requirePerm("interventions.voir");
  if (!a) {
    return (
      <Card className="text-center">
        <Lock className="mx-auto h-6 w-6 text-faint" />
        <p className="mt-2 text-[0.9rem] text-muted">Ton grade ne donne pas accès aux patrouilles.</p>
      </Card>
    );
  }

  const canGerer = peut(a, "interventions.gerer");
  const { pret, connectee, patrouilles, agentsDispo, canaux, indicatifPropose } = await getPatrouillesData();

  return (
    <div className="flex flex-col gap-4">
      {!connectee ? (
        <Banner tone="warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--warn)" }} />
          <span>Base de données non connectée. Renseigne les variables Supabase pour gérer les patrouilles.</span>
        </Banner>
      ) : !pret ? (
        <Banner tone="warn">
          <Database className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--warn)" }} />
          <span>La table des patrouilles n&apos;est pas encore prête. Lance <code className="font-num text-[0.8em]">sql/01-operations.sql</code> dans Supabase pour activer ce module.</span>
        </Banner>
      ) : null}

      <PatrouillesBoard patrouilles={patrouilles} agentsDispo={agentsDispo} canaux={canaux} indicatifPropose={indicatifPropose} canGerer={canGerer} />
    </div>
  );
}
