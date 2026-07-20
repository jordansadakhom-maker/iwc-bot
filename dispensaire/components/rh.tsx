"use client";

import { useEffect, useState, useCallback } from "react";
import { Lock, UserPlus, Pencil, Trash2, X, Archive, ArchiveRestore, Send, Landmark } from "lucide-react";
import { chargerRH, ajouterSalarie, majSalarie, supprimerSalarie } from "@/app/actions";
import type { Salarie } from "@/lib/data";
import { Bloc, Vide } from "./ui";
import { useConfirm, useToast } from "./ux";

const NIVEAUX = ["Interne", "Infirmier", "Médecin", "Médecin-chef", "Chirurgien", "Directeur"];

function LigneSalarie({ code, s, refresh }: { code: string; s: Salarie; refresh: () => void }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ nom: s.nom, niveau: s.niveau || "", qualifications: s.qualifications || "", compteBancaire: s.compteBancaire || "", telegramme: s.telegramme || "" });

  async function sauver() { setBusy(true); const r = await majSalarie(code, s.id, f); setBusy(false); if (r.ok) { setEdit(false); toast("Salarié mis à jour.", "ok"); refresh(); } else toast(r.error || "Échec.", "err"); }
  async function toggleActif() { const r = await majSalarie(code, s.id, { actif: !s.actif }); if (r.ok) { toast(s.actif ? "Archivé." : "Réactivé.", "ok"); refresh(); } else toast(r.error || "Échec.", "err"); }
  async function suppr() { if (!(await confirm(`Supprimer définitivement ${s.nom} ? (préfère « archiver »)`, { danger: true, ok: "Supprimer" }))) return; const r = await supprimerSalarie(code, s.id); if (r.ok) { toast("Supprimé.", "ok"); refresh(); } else toast(r.error || "Échec.", "err"); }

  if (edit) return (
    <li className="grid gap-2 border-b border-[var(--line)]/60 px-4 py-3 last:border-0 sm:grid-cols-2">
      <input className="inp" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} placeholder="Nom" />
      <input className="inp" list="disp-niveaux" value={f.niveau} onChange={(e) => setF({ ...f, niveau: e.target.value })} placeholder="Niveau" />
      <input className="inp sm:col-span-2" value={f.qualifications} onChange={(e) => setF({ ...f, qualifications: e.target.value })} placeholder="Qualifications" />
      <input className="inp" value={f.compteBancaire} onChange={(e) => setF({ ...f, compteBancaire: e.target.value })} placeholder="N° compte bancaire" />
      <input className="inp" value={f.telegramme} onChange={(e) => setF({ ...f, telegramme: e.target.value })} placeholder="N° télégramme" />
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn-accent btn" onClick={sauver} disabled={busy}>{busy ? <span className="spin" /> : null} Enregistrer</button>
        <button className="btn" onClick={() => setEdit(false)}><X className="h-4 w-4" /> Annuler</button>
      </div>
    </li>
  );

  return (
    <li className={`rise flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--line)]/60 px-4 py-3 last:border-0 ${s.actif ? "" : "opacity-55"}`}>
      <span className="min-w-0 flex-1">
        <span className="font-medium">{s.nom}</span>
        {s.niveau ? <span className="ml-2 rounded-full border border-[var(--line)] px-2 py-0.5 text-[0.7rem] text-[var(--accent)]">{s.niveau}</span> : null}
        {!s.actif ? <span className="ml-2 text-[0.72rem] uppercase tracking-wide text-[var(--faint)]">archivé</span> : null}
        {s.qualifications ? <div className="text-[0.82rem] text-[var(--muted)]">{s.qualifications}</div> : null}
        <div className="flex flex-wrap gap-x-4 text-[0.78rem] text-[var(--faint)]">
          {s.compteBancaire ? <span className="inline-flex items-center gap-1"><Landmark className="h-3 w-3" />{s.compteBancaire}</span> : null}
          {s.telegramme ? <span className="inline-flex items-center gap-1"><Send className="h-3 w-3" />{s.telegramme}</span> : null}
        </div>
      </span>
      <button className="btn !px-2 !py-1" onClick={() => setEdit(true)} title="Modifier"><Pencil className="h-3.5 w-3.5" /></button>
      <button className="btn !px-2 !py-1" onClick={toggleActif} title={s.actif ? "Archiver" : "Réactiver"}>{s.actif ? <Archive className="h-3.5 w-3.5" /> : <ArchiveRestore className="h-3.5 w-3.5" />}</button>
      <button className="btn !px-2 !py-1" onClick={suppr} title="Supprimer" style={{ color: "var(--oxblood)" }}><Trash2 className="h-3.5 w-3.5" /></button>
    </li>
  );
}

export function RH() {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [saisie, setSaisie] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [salaries, setSalaries] = useState<Salarie[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nouv, setNouv] = useState({ nom: "", niveau: "", qualifications: "", compteBancaire: "", telegramme: "" });

  const charger = useCallback(async (c: string) => {
    const r = await chargerRH(c);
    if (!r.ok) { setErr(r.error || "Échec."); setUnlocked(false); return false; }
    setSalaries(r.salaries || []); setCode(c); setUnlocked(true); setErr(null);
    try { sessionStorage.setItem("disp_code", c); } catch {}
    return true;
  }, []);
  useEffect(() => { try { const c = sessionStorage.getItem("disp_code"); if (c) charger(c); } catch {} }, [charger]);
  const refresh = () => charger(code);

  async function deverrouiller() { setBusy(true); await charger(saisie.trim()); setBusy(false); }
  async function ajouter() {
    if (!nouv.nom.trim()) { toast("Nom requis.", "err"); return; }
    setBusy(true); const r = await ajouterSalarie(code, nouv); setBusy(false);
    if (!r.ok) { toast(r.error || "Échec.", "err"); return; }
    toast("Salarié ajouté.", "ok"); setNouv({ nom: "", niveau: "", qualifications: "", compteBancaire: "", telegramme: "" }); refresh();
  }

  if (!unlocked) return (
    <div className="mx-auto max-w-[420px] rounded-[8px] border border-[var(--line)] bg-[var(--card)] p-6 text-center">
      <Lock className="mx-auto mb-2 h-6 w-6 text-[var(--accent)]" />
      <h2 className="font-display text-[1.2rem]">Onglet réservé — Personnel</h2>
      <p className="mb-4 mt-1 text-[0.84rem] text-[var(--muted)]">Accès réservé aux membres habilités. Saisis le code du dispensaire.</p>
      <div className="flex gap-2">
        <input className="inp" type="password" value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder="Code d'accès" onKeyDown={(e) => { if (e.key === "Enter") deverrouiller(); }} autoFocus />
        <button className="btn-accent btn" onClick={deverrouiller} disabled={busy}>{busy ? <span className="spin" /> : null} Ouvrir</button>
      </div>
      {err ? <p className="mt-2 text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <datalist id="disp-niveaux">{NIVEAUX.map((n) => <option key={n} value={n} />)}</datalist>

      <div className="rounded-[8px] border border-[var(--line)] bg-[var(--card)] p-4">
        <h2 className="mb-3 flex items-center gap-2 font-display text-[1.05rem]"><UserPlus className="h-4 w-4 text-[var(--muted)]" /> Ajouter un salarié</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="inp" value={nouv.nom} onChange={(e) => setNouv({ ...nouv, nom: e.target.value })} placeholder="Prénom Nom" />
          <input className="inp" list="disp-niveaux" value={nouv.niveau} onChange={(e) => setNouv({ ...nouv, niveau: e.target.value })} placeholder="Niveau / grade" />
          <input className="inp sm:col-span-2" value={nouv.qualifications} onChange={(e) => setNouv({ ...nouv, qualifications: e.target.value })} placeholder="Qualifications (secourisme, chirurgie…)" />
          <input className="inp" value={nouv.compteBancaire} onChange={(e) => setNouv({ ...nouv, compteBancaire: e.target.value })} placeholder="N° compte bancaire" />
          <input className="inp" value={nouv.telegramme} onChange={(e) => setNouv({ ...nouv, telegramme: e.target.value })} placeholder="N° télégramme" />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button className="btn-accent btn" onClick={ajouter} disabled={busy}>{busy ? <span className="spin" /> : <UserPlus className="h-4 w-4" />} Ajouter le salarié</button>
        </div>
      </div>

      <Bloc titre="Salariés du dispensaire" compteur={salaries.length}>
        {salaries.length === 0 ? <Vide>Aucun salarié enregistré.</Vide> : <ul>{salaries.map((s) => <LigneSalarie key={s.id} code={code} s={s} refresh={refresh} />)}</ul>}
      </Bloc>
    </div>
  );
}
