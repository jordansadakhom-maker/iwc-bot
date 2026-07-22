"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Loader2, Send, Globe, CalendarPlus, Check, StickyNote } from "lucide-react";
import type { TelegrammeItem } from "@/lib/queries";
import { Modal, Flash, inputCls } from "@/components/edit-ui";
import { Badge } from "@/components/ui";
import { repondreTelegramme, repondreTelegrammeWeb, creerRdvDepuisTelegramme } from "@/app/(app)/communication/telegramme-actions";

type Router = ReturnType<typeof useRouter>;

const dateFR = (n?: number) => { if (!n) return ""; try { return new Date(n).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
const apercu = (t: TelegrammeItem) => { const m = [...t.messages].reverse().find((x) => x.content); return m?.content?.slice(0, 90) || "—"; };
const statutTone = (s: string): "good" | "warn" | "muted" => /ouvert/i.test(s) ? "warn" : /clotur|classe/i.test(s) ? "muted" : "good";

export function TelegrammesPanel({ telegrammes }: { telegrammes: TelegrammeItem[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<TelegrammeItem | null>(null);

  if (telegrammes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-full border" style={{ borderColor: "color-mix(in srgb,var(--accent) 30%,var(--border))", background: "color-mix(in srgb,var(--accent) 8%,transparent)" }}>
          <MessageSquare className="h-5 w-5" style={{ color: "color-mix(in srgb,var(--accent) 70%,var(--faint))" }} strokeWidth={1.6} />
        </span>
        <p className="max-w-md font-display text-[0.9rem] italic text-muted">Aucun télégramme pour l&apos;instant. Les télégrammes reçus sur Discord arriveront ici — tu pourras répondre (le client reçoit ta réponse en message privé) et une trace est toujours gardée.</p>
      </div>
    );
  }

  const aTraiterN = telegrammes.filter((t) => !/clotur|classe/i.test(t.statut)).length;

  return (
    <>
      {aTraiterN ? (
        <div className="mb-2.5 flex items-center gap-1.5 text-[0.74rem]">
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-bold" style={{ color: "#fff", background: "var(--warn)" }}>{aTraiterN} à traiter</span>
          <span className="text-faint">— les télégrammes encore ouverts ressortent en surbrillance.</span>
        </div>
      ) : null}
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {telegrammes.map((t) => {
          const aTraiter = !/clotur|classe/i.test(t.statut); // encore ouvert → pas traité
          return (
          <button key={t.id} onClick={() => setSel(t)}
            className="relative rounded-[12px] border px-3.5 py-3 text-left transition hover:-translate-y-0.5"
            style={aTraiter
              ? { borderColor: "color-mix(in srgb,var(--warn) 60%,var(--border))", background: "color-mix(in srgb,var(--warn) 9%,var(--surface-2))", boxShadow: "0 0 0 1px color-mix(in srgb,var(--warn) 30%,transparent)" }
              : { borderColor: "var(--border)", background: "var(--surface-2)", opacity: 0.82 }}>
            {aTraiter ? (
              <span className="absolute right-2.5 top-2.5 flex h-2.5 w-2.5" title="Pas encore traité">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: "var(--warn)" }} />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: "var(--warn)" }} />
              </span>
            ) : null}
            <div className="flex items-center justify-between gap-2 pr-4">
              <div className="min-w-0 truncate text-[0.9rem] font-semibold">{t.clientNom}</div>
              <Badge tone={statutTone(t.statut)}>{/ouvert/i.test(t.statut) ? "À traiter" : /clotur/i.test(t.statut) ? "Clôturé" : t.statut}</Badge>
            </div>
            <p className="mt-1.5 line-clamp-2 text-[0.76rem] text-muted">{apercu(t)}</p>
            <div className="mt-2 flex items-center justify-between gap-2 text-[0.68rem] text-faint">
              <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {t.messages.length}</span>
              {t.rdvCree ? <span className="inline-flex items-center gap-1" style={{ color: "var(--good)" }}><Check className="h-3 w-3" /> RDV créé</span> : null}
            </div>
          </button>
          );
        })}
      </div>
      {sel ? <TgModal tg={sel} onClose={() => setSel(null)} router={router} /> : null}
    </>
  );
}

function TgModal({ tg, onClose, router }: { tg: TelegrammeItem; onClose: () => void; router: Router }) {
  const [texte, setTexte] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [envoyes, setEnvoyes] = useState<string[]>([]);
  const [rdvFait, setRdvFait] = useState(tg.rdvCree);

  const texteClient = tg.messages.filter((m) => m.from === "client").map((m) => m.content || "").join(" ");

  async function repondre() {
    if (texte.trim().length < 1) return;
    setBusy("rep");
    const r = tg.source === "web" ? await repondreTelegrammeWeb(tg.id, texte, "Équipe") : await repondreTelegramme(tg.id, texte);
    setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    setEnvoyes((p) => [...p, texte]); setTexte("");
    setFlash(r.info || "Réponse transmise."); router.refresh();
  }
  async function creerRdv() {
    setBusy("rdv");
    const r = await creerRdvDepuisTelegramme(tg.id, tg.clientNom, texteClient);
    setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    setRdvFait(true); setFlash(r.info || "RDV créé."); router.refresh();
  }

  return (
    <Modal titre={`Télégramme — ${tg.clientNom}`} onClose={onClose} max={560}>
      {flash ? <div className="mb-3"><Flash>{flash}</Flash></div> : null}

      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[0.74rem] text-faint"><Globe className="h-3.5 w-3.5" /> {tg.source === "web" ? "Envoyé depuis le site" : "Reçu sur Discord · relayé ici"}</span>
        {rdvFait ? (
          <Badge tone="good">RDV créé</Badge>
        ) : (
          <button onClick={creerRdv} disabled={busy === "rdv"} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-[0.76rem] font-semibold hover:border-border-2 disabled:opacity-60">
            {busy === "rdv" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarPlus className="h-3.5 w-3.5" />} Créer le RDV
          </button>
        )}
      </div>

      {tg.source === "web" ? (
        /discord/i.test(tg.contact || "") ? (
          <div className="mb-3 flex items-start gap-2 rounded-[8px] border px-2.5 py-2 text-[0.78rem]" style={{ borderColor: "color-mix(in srgb,var(--good) 40%,var(--border))", background: "color-mix(in srgb,var(--good) 8%,transparent)" }}>
            <span style={{ color: "var(--good)" }}>✅</span>
            <span className="text-muted">Contact <b className="text-ink">Discord</b> fourni : ta réponse est <b>livrée en MP Discord</b> (si le pseudo est trouvé sur le serveur). Contact : <b className="text-ink">{tg.contact}</b></span>
          </div>
        ) : (
          <div className="mb-3 flex items-start gap-2 rounded-[8px] border px-2.5 py-2 text-[0.78rem]" style={{ borderColor: "color-mix(in srgb,var(--warn) 45%,var(--border))", background: "color-mix(in srgb,var(--warn) 8%,transparent)" }}>
            <span style={{ color: "var(--warn)" }}>⚠️</span>
            <span className="text-muted">Contact <b className="text-ink">en jeu</b> : pas de MP Discord. Ta réponse est <b>gardée en trace</b> ; recontacte-le via son moyen de contact{tg.contact ? <> : <b className="text-ink">{tg.contact}</b></> : null}.</span>
          </div>
        )
      ) : null}

      {/* Fil de conversation */}
      <div className="flex max-h-[46vh] flex-col gap-2 overflow-y-auto rounded-[10px] border border-border bg-surface-2 p-3">
        {tg.messages.length === 0 ? <p className="text-[0.8rem] text-faint">Aucun message.</p> : tg.messages.map((m, i) => {
          const equipe = m.from === "equipe";
          const note = m.from === "note";
          if (note) return (
            <div key={i} className="mx-auto max-w-[90%] rounded-[8px] border border-dashed border-border px-2.5 py-1.5 text-[0.78rem] text-muted">
              <span className="inline-flex items-center gap-1 text-faint"><StickyNote className="h-3 w-3" /> Note interne · {m.name || "Équipe"}</span>
              <p className="mt-0.5">{m.content}</p>
            </div>
          );
          return (
            <div key={i} className={`max-w-[82%] rounded-[10px] px-3 py-1.5 text-[0.83rem] ${equipe ? "self-end" : "self-start"}`}
              style={{ background: equipe ? "color-mix(in srgb,var(--accent) 14%,var(--surface))" : "var(--surface)", border: "1px solid var(--border)" }}>
              <p className="text-ink">{m.content}</p>
              <p className="mt-0.5 text-[0.64rem] text-faint">{equipe ? (m.name || "Équipe") : tg.clientNom}{m.at ? ` · ${dateFR(m.at)}` : ""}</p>
            </div>
          );
        })}
        {envoyes.map((e, i) => (
          <div key={`e${i}`} className="max-w-[82%] self-end rounded-[10px] px-3 py-1.5 text-[0.83rem]" style={{ background: "color-mix(in srgb,var(--accent) 10%,var(--surface))", border: "1px dashed color-mix(in srgb,var(--accent) 40%,var(--border))" }}>
            <p className="text-ink">{e}</p>
            <p className="mt-0.5 text-[0.64rem] text-faint">En cours de livraison…</p>
          </div>
        ))}
      </div>

      {/* Réponse */}
      {/ouvert/i.test(tg.statut) ? (
        <div className="mt-3 flex items-end gap-2">
          <textarea className={inputCls + " min-h-[46px] resize-y"} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder={tg.source === "web" ? "Réponse gardée en trace — recontacte via le contact ci-dessus (pas de MP Discord)…" : "Réponds au client — il le reçoit en message privé sur Discord (trace conservée)…"} maxLength={2000} />
          <button onClick={repondre} disabled={busy === "rep"} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>
            {busy === "rep" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" strokeWidth={2} />}
          </button>
        </div>
      ) : (
        <p className="mt-3 text-[0.78rem] text-faint">Conversation clôturée — trace conservée.</p>
      )}

      <div className="mt-4 flex justify-end border-t border-border pt-3">
        <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}>Fermer</button>
      </div>
    </Modal>
  );
}
