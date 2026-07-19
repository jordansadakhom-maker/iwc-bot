"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BookUser, Pencil, Trash2, Plus, X, Send } from "lucide-react";
import { ajouterRepertoire, majRepertoire, supprimerRepertoire } from "@/app/actions";
import type { Repert } from "@/lib/data";
import { Bloc, Vide } from "./ui";

const CATS = ["Mine", "Menuiserie", "Forgeron", "Armurerie", "Épicerie", "Écurie", "Banque", "Journal", "Autre"];

function Fiche({ r, refresh }: { r: Repert; refresh: () => void }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ entreprise: r.entreprise, categorie: r.categorie || "", contact: r.contact || "", telegramme: r.telegramme || "", notes: r.notes || "" });
  const [busy, setBusy] = useState(false);

  async function sauver() {
    setBusy(true); const res = await majRepertoire(r.id, f); setBusy(false);
    if (res.ok) { setEdit(false); refresh(); }
  }
  async function suppr() { if (confirm(`Supprimer ${r.entreprise} ?`)) { await supprimerRepertoire(r.id); refresh(); } }

  if (edit) return (
    <li className="grid gap-2 border-b border-[var(--line)]/60 px-4 py-3 last:border-0 sm:grid-cols-2">
      <input className="inp" value={f.entreprise} onChange={(e) => setF({ ...f, entreprise: e.target.value })} placeholder="Entreprise" />
      <input className="inp" list="disp-repcat" value={f.categorie} onChange={(e) => setF({ ...f, categorie: e.target.value })} placeholder="Catégorie" />
      <input className="inp" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} placeholder="Contact / responsable" />
      <input className="inp" value={f.telegramme} onChange={(e) => setF({ ...f, telegramme: e.target.value })} placeholder="N° télégramme" />
      <textarea className="inp sm:col-span-2" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Notes" />
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn-accent btn" onClick={sauver} disabled={busy}>Enregistrer</button>
        <button className="btn" onClick={() => setEdit(false)}><X className="h-4 w-4" /> Annuler</button>
      </div>
    </li>
  );

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--line)]/60 px-4 py-3 last:border-0">
      <span className="min-w-0 flex-1">
        <span className="font-medium">{r.entreprise}</span>
        {r.contact ? <span className="text-[0.82rem] text-[var(--muted)]"> · {r.contact}</span> : null}
        {r.telegramme ? <span className="ml-1 inline-flex items-center gap-1 text-[0.78rem] text-[var(--accent)]"><Send className="h-3 w-3" />{r.telegramme}</span> : null}
        {r.notes ? <div className="text-[0.8rem] italic text-[var(--faint)]">{r.notes}</div> : null}
      </span>
      <button className="btn !px-2 !py-1" onClick={() => setEdit(true)} title="Modifier"><Pencil className="h-3.5 w-3.5" /></button>
      <button className="btn !px-2 !py-1" onClick={suppr} title="Supprimer" style={{ color: "var(--oxblood)" }}><Trash2 className="h-3.5 w-3.5" /></button>
    </li>
  );
}

export function Repertoire({ entrees }: { entrees: Repert[] }) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [nouv, setNouv] = useState({ entreprise: "", categorie: "", contact: "", telegramme: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const groupes = useMemo(() => {
    const map = new Map<string, Repert[]>();
    for (const r of entrees) { const k = r.categorie || "Autre"; (map.get(k) || map.set(k, []).get(k)!).push(r); }
    return [...map.entries()];
  }, [entrees]);

  async function ajouter() {
    if (!nouv.entreprise.trim()) { setErr("Nom d'entreprise requis."); return; }
    setBusy(true); const r = await ajouterRepertoire(nouv); setBusy(false);
    if (!r.ok) { setErr(r.error || "Échec."); return; }
    setNouv({ entreprise: "", categorie: "", contact: "", telegramme: "", notes: "" }); setErr(null); refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <datalist id="disp-repcat">{CATS.map((c) => <option key={c} value={c} />)}</datalist>

      <div className="rounded-[8px] border border-[var(--line)] bg-[var(--card)] p-4">
        <h2 className="mb-1 flex items-center gap-2 font-display text-[1.05rem]"><BookUser className="h-4 w-4 text-[var(--muted)]" /> Répertoire des entreprises</h2>
        <p className="mb-3 text-[0.82rem] text-[var(--muted)]">Coordonnées des partenaires : mine, menuiserie, forgeron, etc.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="inp" value={nouv.entreprise} onChange={(e) => setNouv({ ...nouv, entreprise: e.target.value })} placeholder="Entreprise" />
          <input className="inp" list="disp-repcat" value={nouv.categorie} onChange={(e) => setNouv({ ...nouv, categorie: e.target.value })} placeholder="Catégorie (Mine…)" />
          <input className="inp" value={nouv.contact} onChange={(e) => setNouv({ ...nouv, contact: e.target.value })} placeholder="Contact / responsable" />
          <input className="inp" value={nouv.telegramme} onChange={(e) => setNouv({ ...nouv, telegramme: e.target.value })} placeholder="N° télégramme" />
          <textarea className="inp sm:col-span-2" rows={2} value={nouv.notes} onChange={(e) => setNouv({ ...nouv, notes: e.target.value })} placeholder="Notes (horaires, tarifs négociés…)" />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button className="btn-accent btn" onClick={ajouter} disabled={busy}><Plus className="h-4 w-4" /> Ajouter</button>
          {err ? <span className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</span> : null}
        </div>
      </div>

      {entrees.length === 0 ? (
        <Bloc titre="Entreprises" icon={<BookUser className="h-4 w-4 text-[var(--muted)]" />}><Vide>Aucune entreprise enregistrée.</Vide></Bloc>
      ) : (
        groupes.map(([cat, list]) => (
          <Bloc key={cat} titre={cat} icon={<BookUser className="h-4 w-4 text-[var(--muted)]" />} compteur={list.length}>
            <ul>{list.map((r) => <Fiche key={r.id} r={r} refresh={refresh} />)}</ul>
          </Bloc>
        ))
      )}
    </div>
  );
}
