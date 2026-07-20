"use client";

import { useMemo, useState } from "react";
import { FolderOpen, Plus, Trash2, ExternalLink } from "lucide-react";
import { ajouterDocument, supprimerDocument } from "@/app/actions";
import type { Doc } from "@/lib/data";
import { Bloc, Vide } from "./ui";
import { useAction, useConfirm, useToast } from "./ux";

const CATS = ["Règlement", "Procédure", "Contrat", "Formation", "Autre"];

export function Documents({ docs }: { docs: Doc[] }) {
  const { run, isPending } = useAction();
  const confirm = useConfirm();
  const toast = useToast();
  const [nouv, setNouv] = useState({ titre: "", categorie: "", url: "", notes: "" });

  const groupes = useMemo(() => {
    const map = new Map<string, Doc[]>();
    for (const d of docs) { const k = d.categorie || "Autre"; (map.get(k) || map.set(k, []).get(k)!).push(d); }
    return [...map.entries()];
  }, [docs]);

  function ajouter() {
    if (!nouv.titre.trim()) { toast("Titre requis.", "err"); return; }
    run(() => ajouterDocument(nouv), "Document ajouté.").then((ok) => { if (ok) setNouv({ titre: "", categorie: "", url: "", notes: "" }); });
  }

  return (
    <div className="flex flex-col gap-5">
      <datalist id="disp-doccat">{CATS.map((c) => <option key={c} value={c} />)}</datalist>

      <div className="rounded-[8px] border border-[var(--line)] bg-[var(--card)] p-4">
        <h2 className="mb-1 flex items-center gap-2 font-display text-[1.05rem]"><FolderOpen className="h-4 w-4 text-[var(--muted)]" /> Documents importants</h2>
        <p className="mb-3 text-[0.82rem] text-[var(--muted)]">Règlements, procédures, contrats… Ajoute un lien (Discord, image) et une description.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="inp" value={nouv.titre} onChange={(e) => setNouv({ ...nouv, titre: e.target.value })} placeholder="Titre du document" />
          <input className="inp" list="disp-doccat" value={nouv.categorie} onChange={(e) => setNouv({ ...nouv, categorie: e.target.value })} placeholder="Catégorie" />
          <input className="inp sm:col-span-2" value={nouv.url} onChange={(e) => setNouv({ ...nouv, url: e.target.value })} placeholder="Lien (https://…) — optionnel" />
          <textarea className="inp sm:col-span-2" rows={2} value={nouv.notes} onChange={(e) => setNouv({ ...nouv, notes: e.target.value })} placeholder="Description / notes" />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button className="btn-accent btn" onClick={ajouter} disabled={isPending}>{isPending ? <span className="spin" /> : <Plus className="h-4 w-4" />} Ajouter</button>
        </div>
      </div>

      {docs.length === 0 ? (
        <Bloc titre="Documents" icon={<FolderOpen className="h-4 w-4 text-[var(--muted)]" />}><Vide>Aucun document enregistré.</Vide></Bloc>
      ) : (
        groupes.map(([cat, list]) => (
          <Bloc key={cat} titre={cat} icon={<FolderOpen className="h-4 w-4 text-[var(--muted)]" />} compteur={list.length}>
            <ul>
              {list.map((d) => (
                <li key={d.id} className="rise flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--line)]/60 px-4 py-3 last:border-0">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{d.titre}</span>
                    {d.url ? <a href={d.url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-[0.8rem]" style={{ color: "var(--accent)" }}><ExternalLink className="h-3 w-3" /> ouvrir</a> : null}
                    {d.notes ? <div className="text-[0.82rem] italic text-[var(--faint)]">{d.notes}</div> : null}
                  </span>
                  <button className="btn !px-2 !py-1" title="Supprimer" style={{ color: "var(--oxblood)" }} onClick={async () => { if (await confirm(`Supprimer « ${d.titre} » ?`, { danger: true, ok: "Supprimer" })) run(() => supprimerDocument(d.id), "Supprimé."); }}><Trash2 className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
          </Bloc>
        ))
      )}
    </div>
  );
}
