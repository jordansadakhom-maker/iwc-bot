"use client";

import { useMemo, useState } from "react";
import { Beef, Store } from "lucide-react";
import { ChasseModule } from "@/components/chasse-module";
import { MarchesChasse } from "@/components/marches-chasse";
import type { ChasseData } from "@/lib/chasse";
import type { MarchesData } from "@/lib/marches-chasse";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

// Deux onglets dans la page Chasse : le stock (charrettes & ressources) et le
// module « Villes & Marchés » (prix de rachat + comparateur). Le stock est
// agrégé par ressource et transmis au module Marchés pour le total par ville.
export function ChasseTabs({ stock, marches }: { stock: ChasseData; marches: MarchesData }) {
  const [tab, setTab] = useState<"stock" | "marches">("stock");

  const stockRes = useMemo(() => {
    const m = new Map<string, { nom: string; quantite: number }>();
    for (const it of stock.stock) {
      const k = norm(it.nom);
      const e = m.get(k) || { nom: it.nom, quantite: 0 };
      e.quantite += it.quantite;
      m.set(k, e);
    }
    return [...m.values()].filter((x) => x.quantite > 0);
  }, [stock]);

  const onglets = [
    { key: "stock" as const, label: "Stock & charrettes", icon: Beef },
    { key: "marches" as const, label: "Villes & Marchés", icon: Store },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {onglets.map((o) => {
          const on = tab === o.key;
          const Ic = o.icon;
          return (
            <button
              key={o.key}
              onClick={() => setTab(o.key)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.82rem] font-semibold transition"
              style={on ? { background: "var(--accent)", color: "#000" } : { color: "var(--muted)", border: "1px solid var(--border)" }}
            >
              <Ic className="h-3.5 w-3.5" /> {o.label}
            </button>
          );
        })}
      </div>
      {tab === "stock" ? <ChasseModule data={stock} /> : <MarchesChasse data={marches} stockRes={stockRes} />}
    </div>
  );
}
