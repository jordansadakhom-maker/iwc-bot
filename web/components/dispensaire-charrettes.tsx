"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Caravan, Plus, Loader2, Trash2, UserCheck, Undo2, ArrowRightLeft,
  ChevronDown, Pencil, X, Bell, History, CheckCircle2,
} from "lucide-react";
import { VideRegistre, Cartouche } from "@/components/dispensaire-ui";
import { Flash, inputCls } from "@/components/edit-ui";
import { type CharrettesData, type Charrette, estDisponible } from "@/lib/dispensaire-charrettes-const";
import {
  creerCharrette, majCharrette, assignerCharrette, rendreCharrette,
  ajouterBesoin, retirerBesoin, supprimerCharrette,
} from "@/app/dispensaire/charrettes/actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
const labelCls = "text-[0.68rem] uppercase tracking-[0.05em] text-faint";
const P = { timeZone: "Europe/Paris" } as const;
const dateFR = (iso: string | null) => { if (!iso) return "—"; try { return new Intl.DateTimeFormat("fr-FR", { ...P, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso)); } catch { return "—"; } };

export function DispensaireCharrettes({ data }: { data: CharrettesData }) {
  const router = useRouter();
  const [charrettes, setCharrettes] = useState<Charrette[]>(data.charrettes);
  useEffect(() => { setCharrettes(data.charrettes); }, [data]);
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState({ nom: "", detenteur: "", dateReception: "", note: "" });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  const [assign, setAssign] = useState<Charrette | null>(null);
  const [edit, setEdit] = useState<Charrette | null>(null);

  const detenteurs = useMemo(() => [...new Set(charrettes.flatMap((c) => [c.detenteur, ...c.historique.map((h) => h.detenteur)]).filter(Boolean))] as string[], [charrettes]);
  const stats = useMemo(() => {
    const total = charrettes.length;
    const dispo = charrettes.filter((c) => estDisponible(c)).length;
    const besoins = charrettes.reduce((a, c) => a + c.besoins.length, 0);
    return { total, dispo, sorties: total - dispo, besoins };
  }, [charrettes]);

  async function ajouter() {
    if (!v.nom.trim()) { setFlash({ t: "bad", m: "Donne un nom à la charrette." }); return; }
    setBusy(true);
    const r = await creerCharrette(v);
    setBusy(false);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    setV({ nom: "", detenteur: "", dateReception: "", note: "" });
    setFlash({ t: "ok", m: "Charrette ajoutée au registre." });
    router.refresh();
  }
  async function supprimer(id: string) {
    setCharrettes((p) => p.filter((x) => x.id !== id));
    const r = await supprimerCharrette(id);
    if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh();
  }
  async function rendre(id: string) {
    const r = await rendreCharrette(id);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    setFlash({ t: "ok", m: "Charrette rendue — de nouveau disponible." });
    router.refresh();
  }
  async function besoinPlus(id: string, nom: string, quand: string) {
    const r = await ajouterBesoin(id, nom, quand);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); return false; }
    router.refresh();
    return true;
  }
  async function besoinMoins(id: string, besoinId: string) {
    const r = await retirerBesoin(id, besoinId);
    if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      {!data.pret ? <Flash tone="bad">Lance <b>web/prisma/sql/dispensaire-charrettes.sql</b> dans Supabase, puis recharge.</Flash> : null}
      {flash ? <Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash> : null}

      {/* Tableau de bord */}
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Cartouche icon={Caravan} label="Charrettes" valeur={stats.total} sous="au registre" />
        <Cartouche icon={CheckCircle2} label="Disponibles" valeur={stats.dispo} ton="var(--good)" sous="prêtes à partir" />
        <Cartouche icon={UserCheck} label="Sorties" valeur={stats.sorties} ton={stats.sorties ? "var(--warn)" : undefined} sous="chez un détenteur" />
        <Cartouche icon={Bell} label="Besoins signalés" valeur={stats.besoins} ton={stats.besoins ? "var(--accent)" : undefined} sous="demandes en attente" />
      </div>

      {/* Ajouter une charrette */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <h3 className="mb-3 flex items-center gap-2 text-[0.9rem] font-semibold"><Caravan className="h-4 w-4 text-accent" /> Ajouter une charrette</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1"><span className={labelCls}>Nom de la charrette *</span><input className={inputCls} value={v.nom} onChange={set("nom")} placeholder="Charrette n°1, Chariot bâché…" /></label>
          <label className="flex flex-col gap-1"><span className={labelCls}>Détenteur (facultatif)</span><input className={inputCls} value={v.detenteur} onChange={set("detenteur")} placeholder="À qui elle est confiée" list="chr-detenteurs" /><datalist id="chr-detenteurs">{detenteurs.map((d) => <option key={d} value={d} />)}</datalist></label>
          <label className="flex flex-col gap-1"><span className={labelCls}>Date de réception</span><input type="date" className={inputCls} value={v.dateReception} onChange={set("dateReception")} /></label>
          <label className="flex flex-col gap-1"><span className={labelCls}>Note</span><input className={inputCls} value={v.note} onChange={set("note")} placeholder="État, remarque…" /></label>
        </div>
        <div className="mt-3 flex justify-end">
          <button onClick={ajouter} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Enregistrer</button>
        </div>
      </section>

      {/* Registre des charrettes */}
      {charrettes.length === 0 ? (
        <VideRegistre icon={Caravan} titre="Aucune charrette au registre" sous="Ajoute une première charrette — tu pourras suivre qui la détient, qui en a besoin et son historique." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {charrettes.map((c) => (
            <CharretteCarte
              key={c.id}
              c={c}
              onAssign={() => setAssign(c)}
              onRendre={() => rendre(c.id)}
              onEdit={() => setEdit(c)}
              onSupprimer={() => supprimer(c.id)}
              onBesoinPlus={besoinPlus}
              onBesoinMoins={besoinMoins}
            />
          ))}
        </div>
      )}

      {assign ? <AssignModal c={assign} onClose={() => setAssign(null)} onDone={() => { setAssign(null); router.refresh(); }} detenteurs={detenteurs} setFlash={setFlash} /> : null}
      {edit ? <EditModal c={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); router.refresh(); }} setFlash={setFlash} /> : null}
    </div>
  );
}

// ── Carte d'une charrette ─────────────────────────────────────────────────────
function CharretteCarte({
  c, onAssign, onRendre, onEdit, onSupprimer, onBesoinPlus, onBesoinMoins,
}: {
  c: Charrette; onAssign: () => void; onRendre: () => void; onEdit: () => void; onSupprimer: () => void;
  onBesoinPlus: (id: string, nom: string, quand: string) => Promise<boolean>; onBesoinMoins: (id: string, besoinId: string) => void;
}) {
  const dispo = estDisponible(c);
  const [histo, setHisto] = useState(false);
  const [bNom, setBNom] = useState("");
  const [bQuand, setBQuand] = useState("");
  const [bBusy, setBBusy] = useState(false);
  const tone = dispo ? "var(--good)" : "var(--warn)";

  async function addBesoin() {
    if (!bNom.trim()) return;
    setBBusy(true);
    const ok = await onBesoinPlus(c.id, bNom, bQuand);
    setBBusy(false);
    if (ok) { setBNom(""); setBQuand(""); }
  }

  return (
    <section className="relative overflow-hidden rounded-[14px] border border-border shadow-card" style={{ background: "linear-gradient(180deg, color-mix(in srgb,var(--accent) 5%,var(--surface)), var(--surface))" }}>
      <span aria-hidden className="absolute left-0 top-0 h-full w-1.5" style={{ background: tone }} />
      <div className="p-4 pl-5">
        {/* En-tête */}
        <div className="flex items-start gap-2">
          <Caravan className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-display text-[1.05rem] text-ink">{c.nom}</h3>
              <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.04em]" style={{ color: tone, background: `color-mix(in srgb,${tone} 15%,transparent)` }}>{dispo ? "Disponible" : "Sortie"}</span>
            </div>
            {c.note ? <div className="mt-0.5 text-[0.72rem] italic text-faint">{c.note}</div> : null}
          </div>
          <button onClick={onEdit} className="shrink-0 rounded-md p-1 text-faint transition hover:text-accent" title="Modifier"><Pencil className="h-3.5 w-3.5" /></button>
          <button onClick={onSupprimer} className="shrink-0 rounded-md p-1 text-faint transition hover:text-oxblood" title="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>

        {/* Détenteur actuel */}
        <div className="mt-3 rounded-[10px] border border-border bg-surface-2 px-3 py-2">
          {dispo ? (
            <div className="flex items-center gap-2 text-[0.82rem] text-muted"><CheckCircle2 className="h-4 w-4 text-good" /> Disponible au dispensaire</div>
          ) : (
            <div className="flex items-center gap-2 text-[0.82rem]">
              <UserCheck className="h-4 w-4 shrink-0 text-accent" />
              <span className="font-semibold">{c.detenteur}</span>
              <span className="text-faint">· reçue le {dateFR(c.dateReception)}</span>
            </div>
          )}
        </div>

        {/* Actions détenteur */}
        <div className="mt-2 flex flex-wrap gap-2">
          <button onClick={onAssign} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><ArrowRightLeft className="h-3.5 w-3.5" /> {dispo ? "Attribuer" : "Changer de détenteur"}</button>
          {!dispo ? <button onClick={onRendre} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[0.76rem] font-semibold transition hover:border-accent"><Undo2 className="h-3.5 w-3.5" /> Rendre</button> : null}
        </div>

        {/* Besoins : qui en a besoin et quand */}
        <div className="mt-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.05em] text-faint"><Bell className="h-3.5 w-3.5" /> Besoins signalés</div>
          {c.besoins.length ? (
            <ul className="mb-2 flex flex-col gap-1">
              {c.besoins.map((b) => (
                <li key={b.id} className="group flex items-center gap-2 rounded-[8px] border border-border bg-surface-2 px-2.5 py-1.5 text-[0.78rem]">
                  <Bell className="h-3 w-3 shrink-0 text-accent" />
                  <span className="font-semibold">{b.nom}</span>
                  {b.quand ? <span className="text-faint">· {b.quand}</span> : null}
                  <button onClick={() => onBesoinMoins(c.id, b.id)} className="ml-auto shrink-0 text-faint opacity-0 transition hover:text-oxblood group-hover:opacity-100" aria-label="Retirer"><X className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
          ) : <div className="mb-2 text-[0.74rem] italic text-faint">Personne ne l&apos;a demandée pour l&apos;instant.</div>}
          <div className="flex gap-1.5">
            <input className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] outline-none" value={bNom} onChange={(e) => setBNom(e.target.value)} placeholder="Qui en a besoin" onKeyDown={(e) => { if (e.key === "Enter") addBesoin(); }} />
            <input className="w-28 shrink-0 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] outline-none" value={bQuand} onChange={(e) => setBQuand(e.target.value)} placeholder="Quand" onKeyDown={(e) => { if (e.key === "Enter") addBesoin(); }} />
            <button onClick={addBesoin} disabled={bBusy} className="grid h-[34px] w-9 shrink-0 place-items-center rounded-lg text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{bBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}</button>
          </div>
        </div>

        {/* Historique : qui l'avait en dernier */}
        {c.historique.length ? (
          <div className="mt-3 border-t border-border pt-2">
            <button onClick={() => setHisto((h) => !h)} className="flex w-full items-center gap-1.5 text-[0.72rem] font-semibold text-faint">
              <History className="h-3.5 w-3.5" /> Historique des détenteurs ({c.historique.length})
              <ChevronDown className={`ml-auto h-3.5 w-3.5 transition ${histo ? "rotate-180" : ""}`} />
            </button>
            {histo ? (
              <ul className="mt-1.5 flex flex-col gap-1">
                {[...c.historique].reverse().map((h, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-[8px] bg-surface-2 px-2.5 py-1 text-[0.74rem]">
                    <span className="font-semibold">{h.detenteur}</span>
                    <span className="text-faint">du {dateFR(h.dateReception)} au {dateFR(h.dateRetour)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

// ── Modale : attribuer / changer de détenteur ─────────────────────────────────
function AssignModal({ c, onClose, onDone, detenteurs, setFlash }: { c: Charrette; onClose: () => void; onDone: () => void; detenteurs: string[]; setFlash: (f: FlashMsg) => void }) {
  const [nom, setNom] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!nom.trim()) { setFlash({ t: "bad", m: "Indique le détenteur." }); return; }
    setBusy(true);
    const r = await assignerCharrette(c.id, nom, date);
    setBusy(false);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    setFlash({ t: "ok", m: `Charrette confiée à ${nom.trim()}.` });
    onDone();
  }
  return (
    <ModaleCadre titre={`Détenteur — ${c.nom}`} onClose={onClose}>
      <div className="grid gap-2 p-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 sm:col-span-2"><span className={labelCls}>Nouveau détenteur *</span><input className={inputCls} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom du détenteur" list="chr-assign-det" autoFocus /><datalist id="chr-assign-det">{detenteurs.map((d) => <option key={d} value={d} />)}</datalist></label>
        <label className="flex flex-col gap-1"><span className={labelCls}>Date de réception</span><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></label>
      </div>
      {c.detenteur ? <p className="px-4 text-[0.72rem] text-faint">Détenteur actuel : <b>{c.detenteur}</b> — il sera versé à l&apos;historique.</p> : null}
      <PiedModale busy={busy} onClose={onClose} onSave={save} />
    </ModaleCadre>
  );
}

// ── Modale : modifier nom / note ──────────────────────────────────────────────
function EditModal({ c, onClose, onDone, setFlash }: { c: Charrette; onClose: () => void; onDone: () => void; setFlash: (f: FlashMsg) => void }) {
  const [nom, setNom] = useState(c.nom);
  const [note, setNote] = useState(c.note || "");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!nom.trim()) { setFlash({ t: "bad", m: "Le nom ne peut pas être vide." }); return; }
    setBusy(true);
    const r = await majCharrette(c.id, { nom, note });
    setBusy(false);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    setFlash({ t: "ok", m: "Charrette modifiée." });
    onDone();
  }
  return (
    <ModaleCadre titre="Modifier la charrette" onClose={onClose}>
      <div className="grid gap-2 p-4">
        <label className="flex flex-col gap-1"><span className={labelCls}>Nom</span><input className={inputCls} value={nom} onChange={(e) => setNom(e.target.value)} autoFocus /></label>
        <label className="flex flex-col gap-1"><span className={labelCls}>Note</span><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="État, remarque…" /></label>
      </div>
      <PiedModale busy={busy} onClose={onClose} onSave={save} />
    </ModaleCadre>
  );
}

function ModaleCadre({ titre, onClose, children }: { titre: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-auto bg-black/55 p-4" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="iwc-pop w-full max-w-[480px] rounded-[14px] border border-border-2 bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 font-display text-[1.05rem]"><Caravan className="h-4 w-4 text-accent" /> {titre}</h2>
          <button onClick={onClose} className="text-faint hover:text-ink"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
function PiedModale({ busy, onClose, onSave }: { busy: boolean; onClose: () => void; onSave: () => void }) {
  return (
    <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
      <button onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-[0.8rem] font-semibold transition hover:border-accent">Annuler</button>
      <button onClick={onSave} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Enregistrer</button>
    </div>
  );
}
