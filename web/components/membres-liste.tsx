"use client";

import { useState } from "react";
import { Users, Search } from "lucide-react";
import type { MembreDetail } from "@/lib/queries";
import { Card, CardHeader, Empty } from "@/components/ui";
import { MembreRow } from "@/components/membre-row";
import { inputCls } from "@/components/edit-ui";

// Liste des membres avec recherche (nom IC / grade / spécialité / statut) sur les
// données DÉJÀ chargées. Les deux colonnes (Iron Wolf / Confrérie) arrivent déjà
// triées par grade depuis le serveur.
export function MembresListe({ iwc, conf }: { iwc: MembreDetail[]; conf: MembreDetail[] }) {
  const [q, setQ] = useState("");
  const t = q.trim().toLowerCase();
  const filtre = (list: MembreDetail[]) =>
    !t ? list : list.filter((m) => `${m.nomIC} ${m.grade || ""} ${m.ficheRH?.specialite || ""} ${m.statut || ""}`.toLowerCase().includes(t));
  const fi = filtre(iwc);
  const fc = filtre(conf);

  function Bloc({ titre, tone, list }: { titre: string; tone: "accent" | "oxblood"; list: MembreDetail[] }) {
    return (
      <Card>
        <CardHeader titre={titre} compteur={list.length} />
        {list.length === 0 ? (
          <Empty icon={Users}>{t ? "Aucun membre ne correspond à ta recherche." : "Aucun membre synchronisé dans ce pôle pour l'instant."}</Empty>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {list.map((m) => <MembreRow key={m.id} m={m} tone={tone} />)}
          </div>
        )}
      </Card>
    );
  }

  return (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <input className={inputCls + " pl-8"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un membre (nom, grade, spécialité)…" />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Bloc titre="Iron Wolf Company" tone="accent" list={fi} />
        <Bloc titre="La Confrérie" tone="oxblood" list={fc} />
      </div>
    </>
  );
}
