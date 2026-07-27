"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessagesSquare, Loader2, Plus, Send, ArrowLeft, Archive, ArchiveRestore, Circle } from "lucide-react";
import { Card, CardHeader, Empty, Badge } from "@/components/ui";
import { Modal, Flash, Champ, inputCls } from "@/components/edit-ui";
import { useNotificationsRealtime } from "@/lib/use-notifications-realtime";
import { trierConversations, estArchivee, type ConversationListe, type Conversation, type Message } from "@/lib/conversations";
import { ouvrirConversation, creerConversation, envoyerMessage, archiverConversation } from "@/app/(app)/messages/actions";

const heureFR = (s: string) => { try { return new Date(s).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
const jourFR = (s: string) => { try { return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }); } catch { return "—"; } };
function quand(s: string): string {
  const d = new Date(s).getTime();
  if (!Number.isFinite(d)) return "";
  const diff = Date.now() - d;
  if (diff < 60000) return "à l'instant";
  if (diff < 3600000) return `il y a ${Math.floor(diff / 60000)} min`;
  if (diff < 86400000) return heureFR(s);
  return jourFR(s);
}

function poleBadge(pole: string | null) {
  if (pole === "confrerie") return <Badge tone="oxblood">Confrérie</Badge>;
  if (pole === "iwc") return <Badge tone="accent">IWC</Badge>;
  return null;
}

export function Messagerie({ moiId, conversations }: { moiId: string | null; conversations: ConversationListe[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<{ conversation: Conversation; messages: Message[] } | null>(null);
  const [chargement, setChargement] = useState(false);
  const [flash, setFlash] = useState<{ t: "good" | "bad"; m: string } | null>(null);

  const liste = trierConversations(conversations);

  // Deep-link ?c=<id> (notifications) — lu une fois au montage.
  useEffect(() => {
    try {
      const c = new URLSearchParams(window.location.search).get("c");
      if (c) setSelected(c);
    } catch { /* ignore */ }
  }, []);

  // Charge le fil sélectionné puis rafraîchit la liste (pastille lu à jour).
  useEffect(() => {
    if (!selected) { setThread(null); return; }
    let vivant = true;
    setChargement(true);
    ouvrirConversation(selected)
      .then((r) => { if (!vivant) return; if (r.ok && r.conversation) { setThread({ conversation: r.conversation, messages: r.messages }); router.refresh(); } else { setThread(null); setFlash({ t: "bad", m: r.error || "Conversation introuvable." }); } })
      .finally(() => { if (vivant) setChargement(false); });
    return () => { vivant = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Temps réel : une nouvelle conversation (notification) rafraîchit la liste.
  useNotificationsRealtime(() => router.refresh());

  return (
    <>
      <div className="grid items-start gap-4 md:grid-cols-[320px_1fr]">
        <div className={selected ? "hidden md:block" : "block"}>
          <ListePane liste={liste} selected={selected} onSelect={setSelected} onNouveau={() => setFlash(null)} flash={flash && !selected ? flash : null} />
        </div>
        <div className={selected ? "block" : "hidden md:block"}>
          <ThreadPane
            moiId={moiId} thread={thread} chargement={chargement}
            onBack={() => setSelected(null)}
            onEnvoye={() => { if (selected) ouvrirConversation(selected).then((r) => { if (r.ok && r.conversation) setThread({ conversation: r.conversation, messages: r.messages }); router.refresh(); }); }}
            onArchive={async (archive) => { if (!selected) return; const r = await archiverConversation(selected, archive); if (r.ok) { setThread((t) => t ? { ...t, conversation: { ...t.conversation, statut: archive ? "archivee" : "ouverte" } } : t); router.refresh(); } }}
          />
        </div>
      </div>
    </>
  );
}

function ListePane({ liste, selected, onSelect, flash }: { liste: ConversationListe[]; selected: string | null; onSelect: (id: string) => void; onNouveau: () => void; flash: { t: "good" | "bad"; m: string } | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sujet, setSujet] = useState("");
  const [corps, setCorps] = useState("");
  const [pole, setPole] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function creer() {
    if (!sujet.trim() || !corps.trim()) { setErr("Un sujet et un premier message sont requis."); return; }
    setSaving(true); setErr(null);
    const res = await creerConversation({ sujet, corps, pole: pole || undefined });
    setSaving(false);
    if (res.ok) { setOpen(false); setSujet(""); setCorps(""); setPole(""); router.refresh(); if (res.id) onSelect(res.id); }
    else setErr(res.error || "Échec de la création.");
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <CardHeader titre="Conversations" compteur={liste.length} />
        <button onClick={() => { setErr(null); setOpen(true); }} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}>
          <Plus className="h-3.5 w-3.5" /> Nouvelle
        </button>
      </div>
      {flash ? <div className="mb-3"><Flash tone={flash.t}>{flash.m}</Flash></div> : null}
      {liste.length === 0 ? (
        <Empty icon={MessagesSquare}>Aucune conversation. Lance-en une pour coordonner la compagnie.</Empty>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {liste.map((c) => {
            const on = c.id === selected;
            return (
              <button key={c.id} onClick={() => onSelect(c.id)} className="flex items-start gap-2.5 py-2.5 text-left transition" style={on ? { background: "color-mix(in srgb,var(--accent) 8%,transparent)" } : undefined}>
                <span className="mt-1 shrink-0" style={{ color: c.nonLu ? "var(--accent)" : "transparent" }}><Circle className="h-2 w-2 fill-current" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={"truncate text-[0.86rem] " + (c.nonLu ? "font-bold text-ink" : "font-semibold text-ink")}>{c.sujet}</span>
                    {estArchivee(c) ? <Badge tone="muted">Archivée</Badge> : poleBadge(c.pole)}
                  </div>
                  <div className="mt-0.5 truncate text-[0.76rem] text-faint">{c.lastAuteur ? <span className="text-muted">{c.lastAuteur} : </span> : null}{c.lastApercu || "—"}</div>
                </div>
                <span className="mt-0.5 shrink-0 text-[0.68rem] text-faint">{quand(c.lastMessageAt)}</span>
              </button>
            );
          })}
        </div>
      )}

      {open ? (
        <Modal titre="Nouvelle conversation" onClose={() => setOpen(false)} max={480}>
          <div className="flex flex-col gap-3.5">
            {err ? <Flash tone="bad">{err}</Flash> : null}
            <Champ label="Sujet"><input className={inputCls} value={sujet} onChange={(e) => setSujet(e.target.value)} placeholder="Ex. Répartition de la garde de nuit" maxLength={200} autoFocus /></Champ>
            <Champ label="Premier message"><textarea className={inputCls + " min-h-[96px] resize-y"} value={corps} onChange={(e) => setCorps(e.target.value)} placeholder="Écris ton message…" maxLength={4000} /></Champ>
            <Champ label="Pôle (optionnel)">
              <select className={inputCls} value={pole} onChange={(e) => setPole(e.target.value)}>
                <option value="">— Aucun —</option>
                <option value="iwc">IWC</option>
                <option value="confrerie">Confrérie</option>
              </select>
            </Champ>
            <div className="mt-1 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-xl border border-border px-4 py-2.5 text-[0.85rem] font-semibold text-muted hover:text-ink">Annuler</button>
              <button onClick={creer} disabled={saving} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[0.85rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "linear-gradient(180deg,var(--accent-hi),var(--accent))" }}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessagesSquare className="h-4 w-4" />} Lancer
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </Card>
  );
}

function ThreadPane({ moiId, thread, chargement, onBack, onEnvoye, onArchive }: {
  moiId: string | null; thread: { conversation: Conversation; messages: Message[] } | null; chargement: boolean;
  onBack: () => void; onEnvoye: () => void; onArchive: (archive: boolean) => void;
}) {
  const [corps, setCorps] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { finRef.current?.scrollIntoView({ block: "end" }); }, [thread?.messages.length]);

  async function envoyer() {
    if (!thread || !corps.trim()) return;
    setEnvoi(true); setErr(null);
    const res = await envoyerMessage(thread.conversation.id, corps);
    setEnvoi(false);
    if (res.ok) { setCorps(""); onEnvoye(); }
    else setErr(res.error || "Échec de l'envoi.");
  }

  if (!thread) {
    return (
      <Card>
        {chargement ? (
          <div className="flex items-center justify-center py-16 text-muted"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <Empty icon={MessagesSquare}>Choisis une conversation pour l'ouvrir.</Empty>
        )}
      </Card>
    );
  }

  const c = thread.conversation;
  const archivee = c.statut === "archivee";
  return (
    <Card className="flex max-h-[74vh] flex-col">
      <div className="mb-2 flex items-center gap-2 border-b border-border pb-3">
        <button onClick={onBack} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted hover:text-ink md:hidden" aria-label="Retour"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5"><span className="truncate text-[0.98rem] font-semibold">{c.sujet}</span>{poleBadge(c.pole)}</div>
          <div className="text-[0.72rem] text-faint">Ouverte par {c.creePar || "—"} · {jourFR(c.createdAt)}</div>
        </div>
        <button onClick={() => onArchive(!archivee)} title={archivee ? "Désarchiver" : "Archiver"} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted hover:text-ink">
          {archivee ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto py-1 pr-1">
        {thread.messages.map((m) => {
          const mine = !!moiId && m.auteurId === moiId;
          return (
            <div key={m.id} className={"flex flex-col " + (mine ? "items-end" : "items-start")}>
              <div className="max-w-[85%] rounded-[12px] border px-3 py-2 text-[0.85rem]" style={mine ? { background: "color-mix(in srgb,var(--accent) 16%,transparent)", borderColor: "color-mix(in srgb,var(--accent) 35%,var(--border))" } : { background: "var(--surface-2)", borderColor: "var(--border)" }}>
                {!mine ? <div className="mb-0.5 text-[0.7rem] font-semibold text-muted">{m.auteurNom || "Membre"}</div> : null}
                <div className="whitespace-pre-wrap break-words">{m.corps}</div>
              </div>
              <div className="mt-0.5 px-1 text-[0.66rem] text-faint">{quand(m.createdAt)}</div>
            </div>
          );
        })}
        <div ref={finRef} />
      </div>

      {err ? <div className="pt-2"><Flash tone="bad">{err}</Flash></div> : null}
      <div className="mt-2 flex items-end gap-2 border-t border-border pt-3">
        <textarea
          className={inputCls + " max-h-32 min-h-[42px] resize-y"} value={corps} onChange={(e) => setCorps(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); envoyer(); } }}
          placeholder="Écris un message… (Ctrl/⌘ + Entrée pour envoyer)" maxLength={4000}
        />
        <button onClick={envoyer} disabled={envoi || !corps.trim()} className="inline-flex h-[42px] shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-[0.82rem] font-semibold text-black/85 disabled:opacity-50" style={{ background: "var(--accent)" }}>
          {envoi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </Card>
  );
}
