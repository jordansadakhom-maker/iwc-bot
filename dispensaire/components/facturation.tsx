"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Pencil, Trash2, UserPlus, X, Stethoscope } from "lucide-react";
import { ajouterSherif, majSherif, supprimerSherif } from "@/app/actions";
import type { Sherif } from "@/lib/data";
import { Bloc, Vide } from "./ui";

const BUREAUX = ["Valentine", "Rhodes", "Saint-Denis", "Strawberry", "Blackwater", "Annesburg", "Tumbleweed", "Van Horn", "Armadillo"];
const prix = (n: number) => `${n.toFixed(2).replace(".", ",")} $`;

function LigneSherif({ s, refresh }: { s: Sherif; refresh: () => void }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ bureau: s.bureau || "", nom: s.nom, prixSoin: String(s.prixSoin) });
  const [busy, setBusy] = useState(false);

  async function sauver() {
    setBusy(true); const r = await majSherif(s.id, { bureau: f.bureau, nom: f.nom, prixSoin: Number(f.prixSoin) }); setBusy(false);
    if (r.ok) { setEdit(false); refresh(); }
  }
  async function suppr() {
    if (!confirm(`Retirer ${s.nom} ?`)) return;
    await supprimerSherif(s.id); refresh();
  }

  if (edit) return (
    <li className="grid gap-2 border-b border-[var(--line)]/60 px-4 py-2.5 last:border-0 sm:grid-cols-[1fr_1fr_120px_auto]">
      <input className="inp" value={f.bureau} list="disp-bureaux" onChange={(e) => setF({ ...f, bureau: e.target.value })} placeholder="Bureau" />
      <input className="inp" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} placeholder="Nom du shérif" />
      <input className="inp tabnum" type="number" step="0.01" min={0} value={f.prixSoin} onChange={(e) => setF({ ...f, prixSoin: e.target.value })} placeholder="Prix soin" />
      <div className="flex gap-1">
        <button className="btn-accent btn" onClick={sauver} disabled={busy}>OK</button>
        <button className="btn !px-2" onClick={() => setEdit(false)}><X className="h-4 w-4" /></button>
      </div>
    </li>
  );

  return (
    <li className="flex items-center gap-3 border-b border-[var(--line)]/60 px-4 py-2.5 last:border-0">
      <span className="min-w-0 flex-1 truncate font-medium">{s.nom}</span>
      <span className="tabnum text-[1rem] font-bold" style={{ color: "var(--accent)" }}>{prix(s.prixSoin)}</span>
      <button className="btn !px-2 !py-1" onClick={() => setEdit(true)} title="Modifier"><Pencil className="h-3.5 w-3.5" /></button>
      <button className="btn !px-2 !py-1" onClick={suppr} title="Retirer" style={{ color: "var(--oxblood)" }}><Trash2 className="h-3.5 w-3.5" /></button>
    </li>
  );
}

export function Facturation({ sherifs }: { sherifs: Sherif[] }) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [nouv, setNouv] = useState({ bureau: "", nom: "", prixSoin: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const groupes = useMemo(() => {
    const map = new Map<string, Sherif[]>();
    for (const s of sherifs) { const k = s.bureau || "Sans bureau"; (map.get(k) || map.set(k, []).get(k)!).push(s); }
    return [...map.entries()];
  }, [sherifs]);

  async function ajouter() {
    if (!nouv.nom.trim()) { setErr("Nom requis."); return; }
    setBusy(true); const r = await ajouterSherif({ bureau: nouv.bureau, nom: nouv.nom, prixSoin: Number(nouv.prixSoin) }); setBusy(false);
    if (!r.ok) { setErr(r.error || "Échec."); return; }
    setNouv({ bureau: nouv.bureau, nom: "", prixSoin: "" }); setErr(null); refresh();
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
          <button className="btn-accent btn" onClick={ajouter} disabled={busy}><UserPlus className="h-4 w-4" /> Ajouter</button>
        </div>
        {err ? <p className="mt-2 text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
      </div>

      {sherifs.length === 0 ? (
        <Bloc titre="Shérifs" icon={<Building2 className="h-4 w-4 text-[var(--muted)]" />}><Vide>Aucun shérif enregistré.</Vide></Bloc>
      ) : (
        groupes.map(([bureau, list]) => (
          <Bloc key={bureau} titre={`Bureau de ${bureau}`} icon={<Building2 className="h-4 w-4 text-[var(--muted)]" />} compteur={list.length}>
            <ul>{list.map((s) => <LigneSherif key={s.id} s={s} refresh={refresh} />)}</ul>
          </Bloc>
        ))
      )}
    </div>
  );
}
