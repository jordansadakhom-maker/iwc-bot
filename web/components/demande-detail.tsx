"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2, UserCheck, UserPlus, LogOut, History, MessageSquare, Sparkles, FileText, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { PhotoDrop } from "@/components/photo-drop";
import { STATUTS_DEMANDE, statutDemandeDef, prioriteDemandeDef, typeDemandeDef, depuis, type DemandeDetail } from "@/lib/demandes-const";
import { repondreDemande, prendreEnCharge, libererDemande, changerStatutDemande, resumerDemande, brouillonReponseDemande } from "@/app/(app)/demandes/actions";

const dtFR = (s: string) => { if (!s) return ""; try { return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(s)); } catch { return ""; } };
const LIB_EVT: Record<string, string> = { creation: "a ouvert la demande", statut: "a changé le statut", prise_en_charge: "a pris en charge", transfert: "a réassigné", message: "a répondu", cloture: "a clôturé", reouverture: "a rouvert" };

export function DemandeDetailVue({ demande, monId }: { demande: DemandeDetail; monId: string | null }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [pj, setPj] = useState<{ nom: string; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [resume, setResume] = useState<string | null>(null);
  const [iaBusy, setIaBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const rafraichir = () => start(() => router.refresh());

  async function resumer() {
    setIaBusy("resume");
    const r = await resumerDemande(demande.id);
    setIaBusy(null);
    if (!r.ok || !r.texte) { toast(r.error || "IA indisponible.", "bad"); return; }
    setResume(r.texte);
  }
  async function brouillon() {
    setIaBusy("brouillon");
    const r = await brouillonReponseDemande(demande.id);
    setIaBusy(null);
    if (!r.ok || !r.texte) { toast(r.error || "IA indisponible.", "bad"); return; }
    setMsg(r.texte);
    toast("Brouillon inséré — relis avant d'envoyer.", "ok");
  }

  const st = statutDemandeDef(demande.statut);
  const pr = prioriteDemandeDef(demande.priorite);
  const ty = typeDemandeDef(demande.type);
  const mien = demande.assigneId && demande.assigneId === monId;

  async function envoyer() {
    const t = msg.trim();
    if (!t && !pj.length) return;
    setBusy(true);
    const r = await repondreDemande(demande.id, t, pj);
    setBusy(false);
    if (!r.ok) { toast(r.error || "Envoi impossible.", "bad"); return; }
    setMsg(""); setPj([]);
    rafraichir();
  }
  async function agir(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    const r = await fn();
    if (!r.ok) { toast(r.error || "Action impossible.", "bad"); return; }
    toast(ok, "ok");
    rafraichir();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      {/* Colonne conversation */}
      <div className="flex flex-col gap-3">
        <div className="rounded-[14px] border border-border bg-surface p-4">
          <div className="mb-3 flex items-center gap-2"><MessageSquare className="h-4 w-4 text-accent" /><h3 className="text-[0.9rem] font-semibold">Conversation</h3><span className="ml-auto font-num text-[0.78rem] text-faint">{demande.messages.length}</span></div>
          {demande.messages.length === 0 ? <p className="py-6 text-center text-[0.84rem] italic text-faint">Aucun message. Écris le premier ci-dessous.</p> : (
            <div className="flex flex-col gap-3">
              {demande.messages.map((m) => {
                const moi = m.auteurId && m.auteurId === monId;
                return (
                  <div key={m.id} className={`flex flex-col ${moi ? "items-end" : "items-start"}`}>
                    <div className="max-w-[85%] rounded-[12px] border px-3 py-2" style={moi ? { background: "color-mix(in srgb,var(--accent) 12%,var(--surface-2))", borderColor: "color-mix(in srgb,var(--accent) 30%,var(--border))" } : { background: "var(--surface-2)", borderColor: "var(--border)" }}>
                      <div className="mb-0.5 flex items-center gap-2 text-[0.68rem] text-faint"><span className="font-semibold text-muted">{m.auteurNom}</span><span>· {dtFR(m.createdAt)}</span>{m.editedAt ? <span>· modifié</span> : null}</div>
                      <div className="whitespace-pre-wrap text-[0.85rem] leading-relaxed">{m.corps}</div>
                      {m.pieces.length ? <div className="mt-1.5 flex flex-wrap gap-1.5">{m.pieces.map((p, i) => <a key={i} href={p.url} target="_blank" rel="noreferrer" className="rounded-md border border-border px-2 py-0.5 text-[0.7rem] text-accent hover:underline">📎 {p.nom}</a>)}</div> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {/* Zone de réponse */}
          <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
            <textarea value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) envoyer(); }} rows={3} placeholder="Répondre sur le site… (Ctrl/⌘+Entrée pour envoyer)" className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[0.85rem] outline-none focus:border-accent" />
            {pj.length ? (
              <div className="flex flex-wrap gap-2">
                {pj.map((p, i) => (
                  <div key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="pièce jointe" className="h-14 w-14 rounded-md border border-border object-cover" />
                    <button onClick={() => setPj((a) => a.filter((_, j) => j !== i))} className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full text-white" style={{ background: "var(--oxblood)" }} aria-label="Retirer"><X className="h-2.5 w-2.5" /></button>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-2">
              <div className="max-w-[180px]"><PhotoDrop dossier="demandes" onUploaded={(url) => setPj((a) => [...a, { nom: "image", url }])} label="Joindre une image" maxDim={1400} compact /></div>
              <button onClick={envoyer} disabled={busy || (!msg.trim() && !pj.length)} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.8rem] font-semibold text-black/85 disabled:opacity-50" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Envoyer</button>
            </div>
          </div>
        </div>
      </div>

      {/* Colonne latérale : statut, attribution, historique */}
      <div className="flex flex-col gap-3">
        <div className="rounded-[14px] border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[1.05rem]">{ty.icon}</span>
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.66rem] font-semibold" style={{ background: `color-mix(in srgb,${pr.tone} 16%,transparent)`, color: pr.tone }}>{pr.label}</span>
            <span className="text-[0.72rem] text-faint">{ty.label}</span>
          </div>
          {/* Statut */}
          <label className="mt-3 block text-[0.72rem] font-semibold uppercase tracking-wide text-faint">Statut</label>
          <select value={demande.statut} onChange={(e) => agir(() => changerStatutDemande(demande.id, e.target.value), "Statut mis à jour.")} disabled={pending} className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-2 py-2 text-[0.82rem] font-semibold" style={{ color: st.tone }}>
            {STATUTS_DEMANDE.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>

          {/* Attribution */}
          <label className="mt-3 block text-[0.72rem] font-semibold uppercase tracking-wide text-faint">Prise en charge</label>
          <div className="mt-1">
            {demande.assigneNom ? (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-[0.82rem]">
                <UserCheck className="h-4 w-4" style={{ color: mien ? "var(--good)" : "var(--accent)" }} />
                <span className="min-w-0 flex-1 truncate font-semibold">{mien ? "Toi" : demande.assigneNom}</span>
                <span className="shrink-0 text-[0.68rem] text-faint">{depuis(demande.assigneAt)}</span>
              </div>
            ) : <p className="text-[0.8rem] italic text-faint">Personne ne traite encore cette demande.</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {!mien ? <button onClick={() => agir(() => prendreEnCharge(demande.id), "Tu prends en charge cette demande.")} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><UserPlus className="h-3.5 w-3.5" /> {demande.assigneNom ? "Reprendre" : "Prendre en charge"}</button> : null}
              {mien ? <button onClick={() => agir(() => libererDemande(demande.id), "Demande libérée.")} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[0.76rem] font-semibold text-muted hover:text-ink"><LogOut className="h-3.5 w-3.5" /> Libérer</button> : null}
            </div>
          </div>

          {demande.resume ? <><label className="mt-3 block text-[0.72rem] font-semibold uppercase tracking-wide text-faint">Détails</label><p className="mt-1 whitespace-pre-wrap text-[0.82rem] text-muted">{demande.resume}</p></> : null}
          {demande.lien ? <a href={demande.lien} className="mt-3 inline-block text-[0.78rem] text-accent hover:underline">↗ Élément lié</a> : null}
        </div>

        {/* Assistant IA */}
        <div className="rounded-[14px] border border-border bg-surface p-4">
          <div className="mb-2 flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent" /><h3 className="text-[0.88rem] font-semibold">Assistant</h3></div>
          <div className="flex flex-wrap gap-2">
            <button onClick={resumer} disabled={!!iaBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[0.76rem] font-semibold transition hover:border-accent disabled:opacity-60">{iaBusy === "resume" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Résumer</button>
            <button onClick={brouillon} disabled={!!iaBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[0.76rem] font-semibold transition hover:border-accent disabled:opacity-60">{iaBusy === "brouillon" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Brouillon de réponse</button>
          </div>
          {resume ? <div className="mt-2 whitespace-pre-wrap rounded-lg border border-border bg-surface-2 p-2.5 text-[0.8rem] leading-relaxed">{resume}</div> : <p className="mt-2 text-[0.72rem] text-faint">L&apos;IA propose, tu décides : le résumé reprend le dossier ; le brouillon remplit la zone de réponse (à relire avant d&apos;envoyer).</p>}
        </div>

        {/* Historique */}
        <div className="rounded-[14px] border border-border bg-surface p-4">
          <div className="mb-2 flex items-center gap-2"><History className="h-4 w-4 text-accent" /><h3 className="text-[0.88rem] font-semibold">Historique</h3></div>
          <div className="flex flex-col gap-2">
            {demande.evenements.length === 0 ? <p className="text-[0.8rem] italic text-faint">—</p> : demande.evenements.slice().reverse().map((e) => (
              <div key={e.id} className="flex items-start gap-2 text-[0.76rem]">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
                <div className="min-w-0 flex-1">
                  <span className="font-semibold">{e.par || "Système"}</span> <span className="text-muted">{LIB_EVT[e.type] || e.type}</span>
                  {e.details?.statut ? <span className="text-faint"> → {statutDemandeDef(String(e.details.statut)).label}</span> : null}
                  <div className="text-[0.68rem] text-faint">{dtFR(e.at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
