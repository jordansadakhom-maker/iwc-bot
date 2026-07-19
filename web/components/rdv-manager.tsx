"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, MapPin, User, MessageSquare, Loader2, Send, Globe, Users, ImageIcon, Check } from "lucide-react";
import type { RdvComm, MembreLite } from "@/lib/queries";
import { Modal, Flash, Picker, inputCls } from "@/components/edit-ui";
import { Badge } from "@/components/ui";
import { PhotoDrop } from "@/components/photo-drop";
import { majStatutRdv, repondreRdv, assignerRdv, definirLieuPhotoRdv } from "@/app/(app)/communication/actions";

type Router = ReturnType<typeof useRouter>;

const STATUTS = [
  { key: "nouveau", label: "Nouveau", tone: "var(--warn)" },
  { key: "confirme", label: "Confirmé", tone: "var(--steel)" },
  { key: "honore", label: "Honoré", tone: "var(--good)" },
  { key: "annule", label: "Annulé", tone: "var(--muted)" },
  { key: "lapin", label: "Lapin", tone: "var(--oxblood)" },
];
const norm = (s: string) => (s || "").toLowerCase().replace(/[éè]/g, "e").replace(/[^a-z]/g, "");
const sInfo = (k: string) => STATUTS.find((s) => s.key === norm(k)) || { key: norm(k), label: k, tone: "var(--muted)" };
const badgeTone = (t: string): "good" | "warn" | "muted" | "oxblood" | "accent" =>
  t === "var(--good)" ? "good" : t === "var(--warn)" ? "warn" : t === "var(--oxblood)" ? "oxblood" : t === "var(--steel)" ? "accent" : "muted";
const dateFR = (s: string | null) => { if (!s) return ""; try { return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

export function RdvManager({ rdvs, membres }: { rdvs: RdvComm[]; membres: MembreLite[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<RdvComm | null>(null);

  return (
    <>
      <div className="mb-3.5 flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <h3 className="text-[0.8rem] font-semibold uppercase tracking-[0.06em] text-muted">Rendez-vous clients</h3>
          <span className="font-num text-[0.8rem] text-faint">{rdvs.length}</span>
        </div>
        <a href="/rendez-vous" target="_blank" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.74rem] font-semibold text-muted transition hover:border-border-2 hover:text-ink">
          <Globe className="h-3.5 w-3.5" /> Page de réservation
        </a>
      </div>

      {rdvs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-full border" style={{ borderColor: "color-mix(in srgb,var(--accent) 30%,var(--border))", background: "color-mix(in srgb,var(--accent) 8%,transparent)" }}>
            <CalendarClock className="h-5 w-5" style={{ color: "color-mix(in srgb,var(--accent) 70%,var(--faint))" }} strokeWidth={1.6} />
          </span>
          <p className="max-w-md font-display text-[0.9rem] italic text-muted">Aucun rendez-vous. Les demandes prises par les clients sur la page publique arriveront ici.</p>
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {rdvs.map((r) => {
            const st = sInfo(r.statut);
            return (
              <button key={r.id} onClick={() => setSel(r)} className="rounded-[12px] border border-border bg-surface-2 px-3.5 py-3 text-left transition hover:-translate-y-0.5 hover:border-border-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 truncate text-[0.9rem] font-semibold">{r.nomRP || "Client"}</div>
                  <Badge tone={badgeTone(st.tone)}>{st.label}</Badge>
                </div>
                <div className="mt-2 flex flex-col gap-1 text-[0.74rem] text-muted">
                  {r.type ? <span className="truncate">{r.type}</span> : null}
                  <span className="flex items-center gap-3 text-faint">
                    {r.creneau ? <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {r.creneau}</span> : null}
                    {r.lieu ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {r.lieu}</span> : null}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[0.68rem] text-faint">
                  {r.source === "web" ? <span className="inline-flex items-center gap-1" style={{ color: "var(--accent)" }}><Globe className="h-3 w-3" /> via le site</span> : <span>Discord</span>}
                  <span className="flex items-center gap-2">
                    {r.assignes.length ? <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {r.assignes.length}</span> : null}
                    {r.lieuPhoto ? <ImageIcon className="h-3 w-3" /> : null}
                    {r.reponses.length ? <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {r.reponses.length}</span> : null}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {sel ? <RdvModal rdv={sel} membres={membres} onClose={() => setSel(null)} router={router} /> : null}
    </>
  );
}

function RdvModal({ rdv, membres, onClose, router }: { rdv: RdvComm; membres: MembreLite[]; onClose: () => void; router: Router }) {
  const [statut, setStatut] = useState(sInfo(rdv.statut).key);
  const [reponses, setReponses] = useState(rdv.reponses);
  const [texte, setTexte] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [lieuPhoto, setLieuPhoto] = useState<string | null>(rdv.lieuPhoto);
  const [assignes, setAssignes] = useState<string[]>(rdv.assignes);
  // Assignation
  const [q, setQ] = useState("");
  const [choisis, setChoisis] = useState<Record<string, boolean>>({});
  const [groupe, setGroupe] = useState<string>("");

  const filtres = membres.filter((m) => m.nom.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
  const nbChoisis = Object.values(choisis).filter(Boolean).length;

  async function changer(s: string) {
    if (s === statut) return;
    const prev = statut; setStatut(s); setBusy("statut");
    const r = await majStatutRdv(rdv.id, s);
    setBusy(null);
    if (!r.ok) { setStatut(prev); setFlash(r.error || "Échec."); return; }
    setFlash("Statut enregistré."); router.refresh();
  }
  async function repondre() {
    if (texte.trim().length < 1) return;
    setBusy("rep");
    const r = await repondreRdv(rdv.id, texte);
    setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    setReponses((p) => [...p, { texte, par: "moi", at: new Date().toISOString() }]);
    setTexte(""); setFlash("Réponse enregistrée (trace conservée)."); router.refresh();
  }
  async function assigner() {
    const ids = membres.filter((m) => choisis[m.id]).map((m) => m.id);
    const noms = membres.filter((m) => choisis[m.id]).map((m) => m.nom);
    const g = groupe || null;
    if (!ids.length && !g) { setFlash("Choisis au moins une personne ou un pôle."); return; }
    setBusy("assign");
    const r = await assignerRdv(rdv.id, ids, noms, g, { nom: rdv.nomRP, lieu: rdv.lieu, creneau: rdv.creneau });
    setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    setAssignes([...new Set([...assignes, ...noms, ...(g ? [g === "illegal" ? "Pôle Confrérie" : "Pôle Iron Wolf"] : [])])]);
    setChoisis({}); setGroupe("");
    setFlash("Assignation transmise — les concernés sont prévenus sur Discord."); router.refresh();
  }
  async function majPhoto(url: string) {
    setLieuPhoto(url);
    const r = await definirLieuPhotoRdv(rdv.id, url);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    setFlash("Photo du lieu enregistrée."); router.refresh();
  }

  return (
    <Modal titre={rdv.nomRP || "Rendez-vous"} onClose={onClose} max={540}>
      {flash ? <div className="mb-3"><Flash>{flash}</Flash></div> : null}
      <div className="flex flex-col gap-1.5 rounded-[10px] border border-border bg-surface-2 px-3 py-2.5 text-[0.84rem]">
        {rdv.type ? <div><span className="text-faint">Prestation :</span> {rdv.type}</div> : null}
        {rdv.creneau ? <div className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5 text-faint" /> {rdv.creneau}</div> : null}
        {rdv.lieu ? <div className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-faint" /> {rdv.lieu}</div> : null}
        {rdv.contact ? <div className="flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-faint" /> {rdv.contact}</div> : null}
        {rdv.message ? <div className="mt-1 border-t border-border pt-2 text-muted"><span className="text-faint">Message : </span>{rdv.message}</div> : null}
        {assignes.length ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
            <span className="text-faint">Assignés :</span>
            {assignes.map((a, i) => <span key={i} className="rounded-full border border-border bg-surface px-2 py-0.5 text-[0.74rem]">{a}</span>)}
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col gap-1">
        <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Statut {busy === "statut" ? "· …" : ""}</span>
        <Picker options={STATUTS} value={statut} onChange={changer} />
      </div>

      {/* Lieu du RDV (photo) */}
      <div className="mt-3 border-t border-border pt-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-[0.72rem] uppercase tracking-[0.05em] text-faint"><MapPin className="h-3.5 w-3.5" /> Photo du lieu</div>
        {lieuPhoto ? (
          <div className="flex flex-col gap-2">
            <a href={lieuPhoto} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={lieuPhoto} alt="Lieu du rendez-vous" className="max-h-56 w-full rounded-[10px] border border-border object-cover" />
            </a>
            <PhotoDrop dossier="rdv-lieux" onUploaded={majPhoto} compact label="Remplacer la photo du lieu" />
          </div>
        ) : (
          <PhotoDrop dossier="rdv-lieux" onUploaded={majPhoto} label="Glisse la photo du lieu — elle montrera l'endroit du RDV" />
        )}
      </div>

      {/* Assigner / prévenir */}
      <div className="mt-3 border-t border-border pt-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-[0.72rem] uppercase tracking-[0.05em] text-faint"><Users className="h-3.5 w-3.5" /> Assigner &amp; prévenir</div>
        <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un membre…" />
        <div className="mt-1.5 max-h-40 overflow-y-auto rounded-[10px] border border-border bg-surface-2">
          {filtres.length === 0 ? <p className="px-3 py-2 text-[0.78rem] text-faint">Aucun membre.</p> : filtres.map((m) => (
            <button key={m.id} onClick={() => setChoisis((c) => ({ ...c, [m.id]: !c[m.id] }))} className="flex w-full items-center gap-2 border-b border-border px-3 py-1.5 text-left text-[0.82rem] last:border-b-0 hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]">
              <span className="grid h-4 w-4 place-items-center rounded border" style={{ borderColor: choisis[m.id] ? "var(--accent)" : "var(--border)", background: choisis[m.id] ? "var(--accent)" : "transparent" }}>
                {choisis[m.id] ? <Check className="h-3 w-3 text-black" /> : null}
              </span>
              {m.nom}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-col gap-1">
          <span className="text-[0.72rem] text-faint">Ou pinguer un pôle entier :</span>
          <Picker options={[{ key: "legal", label: "⚖️ Iron Wolf" }, { key: "illegal", label: "🔪 La Confrérie" }]} value={groupe} onChange={(v) => setGroupe(groupe === v ? "" : v)} />
        </div>
        <div className="mt-2 flex justify-end">
          <button onClick={assigner} disabled={busy === "assign" || (nbChoisis === 0 && !groupe)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85 disabled:opacity-50" style={{ background: "var(--accent)" }}>
            {busy === "assign" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" strokeWidth={2} />} Assigner &amp; prévenir{nbChoisis ? ` (${nbChoisis})` : ""}
          </button>
        </div>
      </div>

      <div className="mt-3 border-t border-border pt-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-[0.72rem] uppercase tracking-[0.05em] text-faint"><MessageSquare className="h-3.5 w-3.5" /> Réponses &amp; trace</div>
        {reponses.length === 0 ? <p className="text-[0.8rem] text-faint">Aucune réponse enregistrée pour l&apos;instant.</p> : (
          <div className="flex flex-col gap-1.5">
            {reponses.map((rp, i) => (
              <div key={i} className="rounded-[8px] border border-border bg-surface-2 px-2.5 py-1.5 text-[0.82rem]">
                <p className="text-ink">{rp.texte}</p>
                <p className="mt-0.5 text-[0.68rem] text-faint">{rp.par || "Équipe"}{rp.at ? ` · ${dateFR(rp.at)}` : ""}</p>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 flex items-end gap-2">
          <textarea className={inputCls + " min-h-[44px] resize-y"} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Écris une réponse / une note (gardée en trace)…" maxLength={2000} />
          <button onClick={repondre} disabled={busy === "rep"} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>
            {busy === "rep" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" strokeWidth={2} />}
          </button>
        </div>
      </div>

      <div className="mt-4 flex justify-end border-t border-border pt-3">
        <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}>Fermer</button>
      </div>
    </Modal>
  );
}
