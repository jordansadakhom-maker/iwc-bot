import Link from "next/link";
import { AlertTriangle, ArrowRight, Boxes, FlaskConical, Receipt, FileText, BadgeDollarSign, Package, Bandage, Stethoscope, Clock } from "lucide-react";
import { getAccueil } from "@/lib/dispensaire-accueil";
import { getRoleDispensaire } from "@/lib/dispensaire-roles";
import { DISP_NAV } from "@/lib/dispensaire-nav";
import { STANDALONE } from "@/lib/standalone";
import { AccueilService } from "@/components/dispensaire-accueil-service";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${Math.round(n).toLocaleString("fr-FR")}`;
const ACT_ICON: Record<string, typeof Package> = { stock: Package, vente: Bandage, service: Clock, frais: FileText, certificat: Stethoscope };
const heureCourte = (iso: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return "—"; } };

export default async function DispensaireAccueil() {
  const [d, role] = await Promise.all([getAccueil(), getRoleDispensaire()]);
  const habilite = role.perms.rh || role.perms.factures || role.perms.admin;
  const modules = DISP_NAV.filter((t) => t.href !== "/dispensaire" && (!t.restreint || habilite) && (!t.admin || role.perms.admin) && !(STANDALONE && t.href === "/repertoire"));

  // Tuiles d'alerte du tableau de bord.
  const tuiles = [
    { href: "/dispensaire/stockage", icon: Boxes, label: "Stocks en alerte", val: d.stockAlertes.length, tone: d.stockAlertes.length ? "var(--oxblood)" : "var(--faint)", sous: d.stockAlertes.slice(0, 2).map((s) => `${s.nom} (${s.stock}${s.unite ? " " + s.unite : ""})`).join(" · ") || "Tout au-dessus du seuil" },
    { href: "/dispensaire/matieres", icon: FlaskConical, label: "Matières en rupture", val: d.matieresRupture.length, tone: d.matieresRupture.length ? "var(--oxblood)" : "var(--faint)", sous: d.matieresRupture.slice(0, 2).map((m) => `${m.nom} (${m.quantite})`).join(" · ") || "Rien à commander" },
    { href: "/dispensaire/ventes", icon: BadgeDollarSign, label: "Ventes du jour", val: d.ventesJourNb, tone: "var(--good)", sous: `Recette ${money(d.ventesJourCa)}` },
    { href: "/dispensaire/frais", icon: FileText, label: "Frais en attente", val: d.fraisEnAttente, tone: d.fraisEnAttente ? "var(--warn)" : "var(--faint)", sous: d.fraisEnAttente ? "À valider" : "Rien en attente" },
  ];
  if (d.habilite) tuiles.push({ href: "/dispensaire/factures", icon: Receipt, label: "Factures impayées", val: d.facturesImpayees, tone: d.facturesRetard ? "var(--oxblood)" : "var(--warn)", sous: `${d.facturesRetard} en retard · ${money(d.du)} dû` });

  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-2xl font-display text-[1rem] italic text-muted">Bienvenue au registre du Dispensaire. Tout ce qui se passe ici — soins, stocks, personnel, factures — se tient à jour d&apos;un même endroit.</p>

      {/* Tuiles d'alerte */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tuiles.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.href} href={t.href} className="group flex items-center gap-3 rounded-[14px] border border-border bg-surface-2 p-4 transition hover:border-border-2">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: `color-mix(in srgb,${t.tone} 15%,transparent)` }}><Icon className="h-5 w-5" style={{ color: t.tone }} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[0.88rem] font-semibold">{t.label} <span className="font-num" style={{ color: t.tone }}>{t.val}</span></div>
                <div className="truncate text-[0.74rem] text-faint">{t.sous}</div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-faint transition group-hover:translate-x-0.5" />
            </Link>
          );
        })}
      </div>

      {/* Personnel en service (live) + prise de service */}
      <AccueilService enService={d.enService} roster={d.roster} />

      {/* Dernières activités */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <h3 className="mb-2 flex items-center gap-2 text-[0.9rem] font-semibold"><Clock className="h-4 w-4 text-accent" /> Dernières activités</h3>
        {d.activites.length === 0 ? (
          <p className="py-4 text-center text-[0.82rem] italic text-faint">Aucune activité récente.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {d.activites.map((a) => {
              const Icon = ACT_ICON[a.type] || Package;
              return (
                <div key={a.id} className="flex items-center gap-2.5 py-1.5 text-[0.8rem]">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md" style={{ background: "color-mix(in srgb,var(--accent) 12%,transparent)" }}><Icon className="h-3.5 w-3.5 text-accent" /></span>
                  <span className="min-w-0 flex-1 truncate">{a.texte}</span>
                  {a.par ? <span className="shrink-0 text-faint">{a.par}</span> : null}
                  <span className="shrink-0 font-num text-faint">{heureCourte(a.at)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Accès aux modules */}
      <div>
        <div className="mb-2 text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-faint">Modules du dispensaire</div>
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map((t) => {
            const Icon = t.icon;
            const inner = (
              <>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: "color-mix(in srgb,var(--accent) 14%,transparent)" }}><Icon className="h-4 w-4 text-accent" /></span>
                <span className="min-w-0 flex-1"><span className="block text-[0.86rem] font-semibold">{t.label}</span>{!t.pret ? <span className="text-[0.68rem] text-faint">Bientôt disponible</span> : <span className="text-[0.68rem] text-faint">Ouvrir</span>}</span>
                {t.pret ? <ArrowRight className="h-4 w-4 text-faint" /> : <span className="rounded-full border border-border px-1.5 text-[0.58rem] uppercase text-faint">bientôt</span>}
              </>
            );
            return t.pret
              ? <Link key={t.href} href={t.href} className="flex items-center gap-3 rounded-[12px] border border-border bg-surface-2 p-3 transition hover:border-border-2 hover:bg-[color-mix(in_srgb,var(--ink)_3%,var(--surface-2))]">{inner}</Link>
              : <div key={t.href} className="flex cursor-not-allowed items-center gap-3 rounded-[12px] border border-border bg-surface-2 p-3 opacity-60">{inner}</div>;
          })}
        </div>
      </div>
    </div>
  );
}
