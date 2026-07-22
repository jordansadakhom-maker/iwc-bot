"use client";

import { useEffect, useState } from "react";
import { Sunrise, Sun, Sunset, Moon, type LucideIcon } from "lucide-react";

// Horloge « de campagne » : l'heure et la date RÉELLES du poste (aucune donnée
// inventée), habillées d'une ambiance western. Le moment du jour (aube, grand
// jour, crépuscule, nuit) est déduit de l'heure réelle — pur habillage.
function momentDuJour(h: number): { label: string; icon: LucideIcon } {
  if (h >= 5 && h < 11) return { label: "Aube", icon: Sunrise };
  if (h >= 11 && h < 17) return { label: "Grand jour", icon: Sun };
  if (h >= 17 && h < 21) return { label: "Crépuscule", icon: Sunset };
  return { label: "Nuit", icon: Moon };
}

export function HorlogeCampagne() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 20000);
    return () => clearInterval(id);
  }, []);
  if (!now) return null; // rendu côté client seulement → évite le mismatch d'hydratation

  const { label, icon: Icon } = momentDuJour(now.getHours());
  const date = now.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" });
  const heure = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[0.72rem] text-muted"
      title={`${label} sur le poste — heure réelle`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--accent)" }} strokeWidth={1.8} />
      <span className="hidden capitalize sm:inline">{date}</span>
      <span className="font-num text-ink">{heure}</span>
    </span>
  );
}
