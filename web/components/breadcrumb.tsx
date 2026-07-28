"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { NAV } from "@/lib/data";

// Libellés lisibles par segment de route (complète les entrées de nav).
const LABELS: Record<string, string> = {
  demandes: "Demandes", operations: "Opérations", armurerie: "Armurerie", membres: "Membres & RH",
  finances: "Finances", recrutement: "Recrutement", communication: "Communication", taches: "Tâches",
  notifications: "Notifications", audit: "Mode Audit", licences: "Licences", dispensaire: "Dispensaire",
  statistiques: "Statistiques", repertoire: "Répertoire", carte: "Carte", inventaire: "Inventaire",
  documents: "Documents", chasse: "Chasse", direction: "Direction", journal: "Journal", messages: "Messagerie",
  dashboard: "Tableau de bord", agenda: "Agenda", medical: "Médical", renseignement: "Renseignement",
  wanted: "Avis de recherche", absences: "Absences", "rendez-vous": "Rendez-vous", telegramme: "Télégramme",
};

const navHref = new Set(NAV.flatMap((g) => g.items.map((it) => it.href.replace(/^\//, ""))));

// Fil d'Ariane : à tout moment, l'utilisateur sait où il est et peut revenir en
// arrière d'un clic. Masqué sur les pages racine (le titre suffit).
export function Breadcrumb() {
  const path = usePathname();
  if (!path || path === "/" || path === "/dashboard") return null;
  const segs = path.split("/").filter(Boolean);
  if (segs.length < 2 && navHref.has(segs[0])) return null; // page simple : pas de fil

  const items: { label: string; href: string }[] = [];
  let acc = "";
  for (const seg of segs) {
    acc += `/${seg}`;
    const brut = decodeURIComponent(seg);
    // Les identifiants (longs / techniques) s'affichent tels quels, raccourcis.
    const label = LABELS[seg] || (brut.length > 22 ? brut.slice(0, 10) + "…" : brut);
    items.push({ label, href: acc });
  }

  return (
    <nav aria-label="Fil d'Ariane" className="flex items-center gap-1 text-[0.74rem] text-faint">
      <Link href="/dashboard" className="inline-flex items-center gap-1 transition hover:text-ink"><Home className="h-3.5 w-3.5" /></Link>
      {items.map((it, i) => (
        <span key={it.href} className="inline-flex items-center gap-1">
          <ChevronRight className="h-3 w-3 opacity-60" />
          {i === items.length - 1 ? <span className="font-semibold text-muted">{it.label}</span> : <Link href={it.href} className="transition hover:text-ink">{it.label}</Link>}
        </span>
      ))}
    </nav>
  );
}
