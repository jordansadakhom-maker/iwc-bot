import { ShieldAlert } from "lucide-react";
import { getRoleDispensaire, getMembres, getConfig, getGrades } from "@/lib/dispensaire-roles";
import { getJournalAudit } from "@/lib/dispensaire-evenements";
import { DispensaireAdmin } from "@/components/dispensaire-admin";
import { DispensaireJournalAudit } from "@/components/dispensaire-journal-audit";

export const dynamic = "force-dynamic";

export default async function DispensaireAdminPage() {
  const moi = await getRoleDispensaire();
  if (!moi.perms.admin) {
    return (
      <div className="rounded-[14px] border border-border bg-surface p-8 text-center">
        <ShieldAlert className="mx-auto h-6 w-6 text-faint" />
        <p className="mt-2 text-[0.9rem] text-muted">Le panneau d&apos;administration est réservé à la direction du dispensaire.</p>
      </div>
    );
  }
  const [{ pret, membres }, config, grades, journal] = await Promise.all([getMembres(), getConfig(), getGrades(), getJournalAudit({ limit: 100 })]);
  return (
    <div className="flex flex-col gap-4">
      <DispensaireAdmin membres={membres} config={config} grades={grades} moi={moi} pret={pret} />
      <DispensaireJournalAudit data={journal} />
    </div>
  );
}
