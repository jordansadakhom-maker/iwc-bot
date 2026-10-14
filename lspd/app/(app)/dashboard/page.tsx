import { Users, Radio, AlertTriangle, Building2, Lock, History } from "lucide-react";
import { requirePerm } from "@/lib/rbac";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader, StatTile, Card, Banner, EmptyState, Pill } from "@/components/ui";
import { dateHeureFR } from "@/lib/dates";
import { getCanaux, getMonService, indicatifLibre } from "@/lib/service";
import { MonService } from "@/components/mon-service";

export const dynamic = "force-dynamic";

const OUVERTES = ["nouvelle", "attente", "prise", "en_cours", "renfort"];

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function compte(admin: Admin, table: string, build?: (q: any) => any): Promise<number> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = admin.from(table).select("id", { count: "exact", head: true });
    if (build) q = build(q);
    const { count, error } = await q;
    return error ? 0 : (count ?? 0);
  } catch {
    return 0;
  }
}

export default async function DashboardPage() {
  const a = await requirePerm("dashboard.voir");
  if (!a) {
    return <Card className="text-center"><Lock className="mx-auto h-6 w-6 text-faint" /><p className="mt-2 text-[0.9rem] text-muted">Ton grade ne donne pas accès au tableau de bord.</p></Card>;
  }

  const admin = createAdminClient();
  const connectee = !!admin;

  let agents = 0, enService = 0, ouvertes = 0, urgentes = 0, unites = 0;
  let activite: { id: string; type: string; cible: string | null; par: string | null; at: string }[] = [];

  if (admin) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    agents = await compte(admin, "LspdAgent", (q: any) => q.eq("actif", true));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    enService = await compte(admin, "LspdService", (q: any) => q.is("fin", null));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ouvertes = await compte(admin, "LspdIntervention", (q: any) => q.in("statut", OUVERTES));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    urgentes = await compte(admin, "LspdIntervention", (q: any) => q.eq("priorite", "urgente").in("statut", OUVERTES));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unites = await compte(admin, "LspdUnite", (q: any) => q.eq("actif", true));
    try {
      const { data } = await admin.from("LspdAudit").select("id,type,cibleLibelle,parNom,createdAt").order("createdAt", { ascending: false }).limit(6);
      activite = ((data || []) as Record<string, unknown>[]).map((r) => ({ id: String(r.id), type: String(r.type || ""), cible: r.cibleLibelle == null ? null : String(r.cibleLibelle), par: r.parNom == null ? null : String(r.parNom), at: String(r.createdAt) }));
    } catch { /* table absente */ }
  }

  // Prise de service « en quelques clics » : service ouvert de l'agent, canaux
  // radio, et indicatif libre pré-proposé.
  const monService = await getMonService(a.agentId);
  const canaux = await getCanaux();
  const indicatifPropose = monService ? null : await indicatifLibre();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader titre={`Bonjour, ${a.nom.split(" ")[0]}`} sous={`Centre opérationnel du LSPD${a.gradeNom ? ` · ${a.gradeNom}` : ""}`}
        action={<Pill tone="navy">{a.source === "amorcage" ? "Amorçage" : "En service"}</Pill>} />

      <MonService
        enService={monService ? { id: monService.id, indicatif: monService.indicatif, canalNom: monService.canalNom, statutRadio: monService.statutRadio, debut: monService.debut } : null}
        canaux={canaux}
        agentId={a.agentId}
        indicatifPropose={indicatifPropose}
      />

      {!connectee ? (
        <Banner tone="warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--warn)" }} />
          <span>Base de données non connectée. Renseigne les variables Supabase (<code className="font-num text-[0.8em]">NEXT_PUBLIC_SUPABASE_URL</code>, <code className="font-num text-[0.8em]">SUPABASE_SERVICE_ROLE_KEY</code>…) et lance <code className="font-num text-[0.8em]">sql/00-socle.sql</code>. Les indicateurs ci-dessous resteront à zéro d&apos;ici là.</span>
        </Banner>
      ) : null}

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatTile icon={Users} label="Agents actifs" value={agents} sous={`${enService} actuellement en service`} tone="navy" />
        <StatTile icon={Radio} label="Interventions ouvertes" value={ouvertes} sous="en cours de traitement" tone="good" />
        <StatTile icon={AlertTriangle} label="Urgentes" value={urgentes} sous="priorité maximale" tone="crit" />
        <StatTile icon={Building2} label="Unités actives" value={unites} sous="divisions configurées" tone="gold" />
      </div>

      <Card>
        <h2 className="mb-2 flex items-center gap-2 font-display text-[1.05rem] uppercase tracking-[0.02em] text-ink"><History className="h-4 w-4 text-navy-hi" /> Dernières actions</h2>
        {activite.length === 0 ? (
          <EmptyState icon={History} titre="Aucune action enregistrée" sous="Le journal se remplira dès les premières opérations (création d'agents, interventions…). Chaque action sensible est tracée ici." />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {activite.map((e) => (
              <li key={e.id} className="flex items-center gap-2 py-2 text-[0.82rem]">
                <span className="font-num text-[0.7rem] text-faint">{dateHeureFR(e.at)}</span>
                <span className="min-w-0 flex-1 truncate"><b className="text-ink">{e.type}</b>{e.cible ? <span className="text-muted"> — {e.cible}</span> : null}</span>
                {e.par ? <span className="shrink-0 text-[0.72rem] text-faint">{e.par}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-[0.72rem] text-faint">
        Socle en place : connexion Discord, rôles &amp; permissions, journal d&apos;audit, tableau de bord branché sur les vraies données.
        Prochains modules : <b className="text-muted">Agents &amp; grades</b>, puis <b className="text-muted">Dispatch &amp; interventions</b>.
      </p>
    </div>
  );
}
