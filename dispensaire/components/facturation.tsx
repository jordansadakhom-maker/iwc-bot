"use client";

import { useMemo, useState } from "react";
import { Building2, Pencil, Trash2, UserPlus, X, Stethoscope } from "lucide-react";
import { ajouterSherif, majSherif, supprimerSherif } from "@/app/actions";
import type { Sherif } from "@/lib/data";
import { Bloc, Vide } from "./ui";
import { useAction, useConfirm, useToast } from "./ux";

const BUREAUX = ["Valentine", "Rhodes", "Saint-Denis", "Strawberry", "Blackwater", "Annesburg", "Tumbleweed", "Van Horn", "Armadillo"];
const prix = (n: number) => `${n.toFixed(2).replace(".", ",")} $`;

function LigneSherif({ s }: { s: Sherif }) {
  const { run, isPending } = useAction();
  const confirm = useConfirm();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ bureau: s.bureau || "", nom: s.nom, prixSoin: String(s.prixSoin) });

  if (edit) return (
    <li className="grid gap-2 border-b border-[var(--line)]/60 px-4 py-2.5 last:border-0 sm:grid-cols-[1fr_1fr_120px_auto]">
      <input className="inp" value={f.bureau} list="disp-bureaux" onChange={(e) => setF({ ...f, bureau: e.target.value })} placeholder="Bureau" />
      <input className="inp" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} placeholder="Nom du shérif" />
      <input className="inp tabnum" type="number" step="0.01" min={0} value={f.prixSoin} onChange={(e) => setF({ ...f, prixSoin: e.target.value })} placeholder="Prix soin" />
      <div className="flex gap-1">
        <button className="btn-accent btn" disabled={isPending} onClick={() => run(() => majSherif(s.id, { bureau: f.bureau, nom: f.nom, prixSoin: Number(f.prixSoin) }), "Modifié.").then((ok) => { if (ok) setEdit(false); })}>OK</button>
        <button className="btn !px-2" onClick={() => setEdit(false)}><X className="h-4 w-4" /></button>
      </div>
    </li>
  );

  return (
    <li className="rise flex items-center gap-3 border-b border-[var(--line)]/60 px-4 py-2.5 last:border-0">
      <span className="min-w-0 flex-1 truncate font-medium">{s.nom}</span>
      <span className="tabnum text-[1rem] font-bold" style={{ color: "var(--accent)" }}>{prix(s.prixSoin)}</span>
      <button className="btn !px-2 !py-1" onClick={() => setEdit(true)} title="Modifier"><Pencil className="h-3.5 w-3.5" /></button>
      <button className="btn !px-2 !py-1" title="Retirer" style={{ color: "var(--oxblood)" }} onClick={async () => { if (await confirm(`Retirer ${s.nom} ?`, { danger: true, ok: "Retirer" })) run(() => supprimerSherif(s.id), "Retiré."); }}><Trash2 className="h-3.5 w-3.5" /></button>
    </li>
  );
}

export function Facturation({ sherifs }: { sherifs: Sherif[] }) {
  const { run, isPending } = useAction();
  const toast = useToast();
  const [nouv, setNouv] = useState({ bureau: "", nom: "", prixSoin: "" });

  const groupes = useMemo(() => {
    const map = new Map<string, Sherif[]>();
    for (const s of sherifs) { const k = s.bureau || "Sans bureau"; (map.get(k) || map.set(k, []).get(k)!).push(s); }
    return [...map.entries()];
  }, [sherifs]);

  function ajouter() {
    if (!nouv.nom.trim()) { toast("Nom requis.", "err"); return; }
    run(() => ajouterSherif({ bureau: nouv.bureau, nom: nouv.nom, prixSoin: Number(nouv.prixSoin) }), "Shérif ajouté.").then((ok) => { if (ok) setNouv({ bureau: nouv.bureau, nom: "", prixSoin: "" }); });
  }

  return (
    <div className="flex flex-col gap-5">
      <datalist id="disp-bureaux">{BUREAUX.map((b) => <option key={b} value={b} />)}</datalist>

      <div className="rounded-[8px] border border-[var(--line)] bg-[var(--card)] p-4">
        <div className="mb-3 flex items-center gap-2">
          <Stethoscope className="h-4 w-4 text-[var(--muted)]" />
          <h2 className="font-display text-[1.05rem]">Facturation des Forces de l&apos;Ordre</h2>
        </div>
        <p className="mb-3 text-[0.82rem] text-[var(--muted)]">Répertoire des shérifs par bureau et prix du soin facturé à chacun.</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_140px_auto]">
          <input className="inp" list="disp-bureaux" value={nouv.bureau} onChange={(e) => setNouv({ ...nouv, bureau: e.target.value })} placeholder="Bureau (Rhodes…)" />
          <input className="inp" value={nouv.nom} onChange={(e) => setNouv({ ...nouv, nom: e.target.value })} placeholder="Nom du shérif" onKeyDown={(e) => { if (e.key === "Enter") ajouter(); }} />
          <input className="inp tabnum" type="number" step="0.01" min={0} value={nouv.prixSoin} onChange={(e) => setNouv({ ...nouv, prixSoin: e.target.value })} placeholder="Prix soin $" />
          <button className="btn-accent btn" onClick={ajouter} disabled={isPending}>{isPending ? <span className="spin" /> : <UserPlus className="h-4 w-4" />} Ajouter</button>
        </div>
      </div>

      {sherifs.length === 0 ? (
        <Bloc titre="Shérifs" icon={<Building2 className="h-4 w-4 text-[var(--muted)]" />}><Vide>Aucun shérif enregistré.</Vide></Bloc>
      ) : (
        groupes.map(([bureau, list]) => (
          <Bloc key={bureau} titre={`Bureau de ${bureau}`} icon={<Building2 className="h-4 w-4 text-[var(--muted)]" />} compteur={list.length}>
            <ul>{list.map((s) => <LigneSherif key={s.id} s={s} />)}</ul>
          </Bloc>
        ))
      )}
    </div>
  );
}
