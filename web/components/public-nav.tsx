import Link from "next/link";
import { CalendarCheck, MessageSquare, UserPlus, type LucideIcon } from "lucide-react";

// Sélecteur à 3 catégories, partagé par les pages publiques (rendez-vous /
// télégramme / recrutement). La catégorie active est mise en avant.
const ITEMS: { key: string; href: string; label: string; sub: string; icon: LucideIcon }[] = [
  { key: "rdv", href: "/rendez-vous", label: "Rendez-vous", sub: "Une prestation", icon: CalendarCheck },
  { key: "telegramme", href: "/telegramme", label: "Télégramme", sub: "Une question", icon: MessageSquare },
  { key: "rejoindre", href: "/rejoindre", label: "Recrutement", sub: "Nous rejoindre", icon: UserPlus },
];

export function PublicNav({ active }: { active: "rdv" | "telegramme" | "rejoindre" }) {
  return (
    <div className="mb-5 grid grid-cols-3 gap-2">
      {ITEMS.map((it) => {
        const on = it.key === active;
        return (
          <Link
            key={it.key}
            href={it.href}
            aria-current={on ? "page" : undefined}
            className="flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center transition hover:-translate-y-0.5"
            style={{ borderColor: on ? "var(--accent)" : "var(--border)", background: on ? "color-mix(in srgb,var(--accent) 12%,var(--surface))" : "var(--surface)" }}
          >
            <span className="grid h-9 w-9 place-items-center rounded-lg" style={{ color: on ? "var(--accent)" : "var(--muted)", background: on ? "color-mix(in srgb,var(--accent) 16%,transparent)" : "var(--surface-2)" }}>
              <it.icon className="h-5 w-5" strokeWidth={1.8} />
            </span>
            <span className="text-[0.8rem] font-semibold leading-tight" style={{ color: on ? "var(--ink)" : "var(--muted)" }}>{it.label}</span>
            <span className="hidden text-[0.66rem] text-faint sm:block">{it.sub}</span>
          </Link>
        );
      })}
    </div>
  );
}
