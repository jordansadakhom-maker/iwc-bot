import { ShieldAlert } from "lucide-react";
import { getRoleDispensaire, getMembres, getConfig, getGrades } from "@/lib/dispensaire-roles";
import { DispensaireAdmin } from "@/components/dispensaire-admin";

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
  const [{ pret, membres }, config, grades] = await Promise.all([getMembres(), getConfig(), getGrades()]);
  return <DispensaireAdmin membres={membres} config={config} grades={grades} moi={moi} pret={pret} />;
}
