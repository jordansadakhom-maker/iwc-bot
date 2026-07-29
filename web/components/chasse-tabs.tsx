"use client";

import { useState } from "react";
import { Beef, Store } from "lucide-react";
import { ChasseModule } from "@/components/chasse-module";
import { MarchesChasse } from "@/components/marches-chasse";
import type { ChasseData } from "@/lib/chasse";
import type { MarchesData } from "@/lib/marches-chasse";

// Deux onglets dans la page Chasse : le stock (charrettes & ressources) et le
// module « Villes & Marchés » (prix de rachat + comparateur).
export function ChasseTabs({ stock, marches }: { stock: ChasseData; marches: MarchesData }) {
  const [tab, setTab] = useState<"stock" | "marches">("stock");
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
      {tab === "stock" ? <ChasseModule data={stock} /> : <MarchesChasse data={marches} />}
    </div>
  );
}
