"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck, Archive, ArchiveRestore, Trash2, ArrowUpRight, Star, Search, ArrowDownWideNarrow } from "lucide-react";
import { toast } from "@/lib/toast";
import { NOTIF_FILTRES, correspondFiltre, compteNonLus, notifMeta, versCentreNotif, lienNotif, prioriteDe, PRIORITE_META, type CentreNotif } from "@/lib/notifications-centre";
import { useNotificationsRealtime } from "@/lib/use-notifications-realtime";
import { notifVisiblePour, type CibleActeur } from "@/lib/notif-ciblage";
import { marquerNotifLue, marquerToutesLues, archiverNotif, supprimerNotif } from "@/app/(app)/notifications/actions";

const TONE_TXT: Record<string, string> = { accent: "var(--accent)", good: "var(--good)", warn: "var(--warn)", oxblood: "var(--oxblood)", muted: "var(--faint)" };
const dtFR = (s: string) => { if (!s) return ""; try { return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(s)); } catch { return ""; } };

export function NotificationCenter({ initial, cible }: { initial: CentreNotif[]; cible?: CibleActeur }) {
  const router = useRouter();
  const [list, setList] = useState<CentreNotif[]>(initial);
  const [filtre, setFiltre] = useState<string>("tous");

  const [q, setQ] = useState("");
  const [triPrio, setTriPrio] = useState(false);
  const [favoris, setFavoris] = useState<Record<string, boolean>>({});

  // Favoris : état PAR APPAREIL (localStorage) — aucune colonne SQL requise.
  useEffect(() => { try { const r = localStorage.getItem("iwc.notifs.favoris"); if (r) setFavoris(JSON.parse(r)); } catch { /* ignore */ } }, []);
  const toggleFavori = (id: string) => setFavoris((p) => { const n = { ...p }; if (n[id]) delete n[id]; else n[id] = true; try { localStorage.setItem("iwc.notifs.favoris", JSON.stringify(n)); } catch { /* ignore */ } return n; });

  const nonLus = compteNonLus(list);
  const compteFiltre = (key: string) => (key === "favoris" ? list.filter((n) => !n.archive && favoris[n.id]).length : list.filter((n) => correspondFiltre(n, key)).length);
  const affiches = useMemo(() => {
    const t = q.trim().toLowerCase();
    let out = list.filter((n) => correspondFiltre(n, filtre));
    if (filtre === "favoris") out = out.filter((n) => favoris[n.id]);
    if (t) out = out.filter((n) => n.titre.toLowerCase().includes(t) || (n.corps || "").toLowerCase().includes(t));
    return [...out].sort((a, b) => (triPrio ? (PRIORITE_META[prioriteDe(a.type)].ordre - PRIORITE_META[prioriteDe(b.type)].ordre) : 0) || b.createdAt.localeCompare(a.createdAt));
  }, [list, filtre, q, favoris, triPrio]);

  // Temps réel : une nouvelle notification s'ajoute en tête instantanément
  // (sans recharger la page) + toast discret. Dédup par id.
  useNotificationsRealtime((raw) => {
    const r = raw as Record<string, unknown>;
    // Ciblage : n'ajoute que les notifications destinées à ce membre (équipe ou
    // ciblées lui/son rôle) — la liste live ne fuite plus celles des autres.
    if (cible && !notifVisiblePour({ membreId: r.membreId as string | null, roleCible: r.roleCible as string | null }, cible)) return;
    const nn = versCentreNotif(r);
    if (!nn.id) return;
    setList((p) => (p.some((x) => x.id === nn.id) ? p : [nn, ...p]));
    toast(`${notifMeta(nn.type).icon} ${nn.titre}`, "info");
  });

  async function lu(n: CentreNotif, valeur = true) {
    setList((p) => p.map((x) => (x.id === n.id ? { ...x, lu: valeur, luAt: valeur ? new Date().toISOString() : null } : x)));
    const r = await marquerNotifLue(n.id, valeur); if (!r.ok) toast("Action impossible.", "bad");
  }
  async function toutLu() {
    setList((p) => p.map((x) => (x.archive ? x : { ...x, lu: true, luAt: x.luAt || new Date().toISOString() })));
    const r = await marquerToutesLues(); if (r.ok) toast("Tout est marqué comme lu.", "ok"); else toast("Action impossible.", "bad");
  }
  async function archiver(n: CentreNotif, valeur = true) {
    setList((p) => p.map((x) => (x.id === n.id ? { ...x, archive: valeur, lu: valeur ? true : x.lu } : x)));
    const r = await archiverNotif(n.id, valeur); if (!r.ok) toast("Action impossible.", "bad");
  }
  async function supprimer(n: CentreNotif) {
    setList((p) => p.filter((x) => x.id !== n.id));
    const r = await supprimerNotif(n.id); if (!r.ok) { toast("Suppression impossible.", "bad"); router.refresh(); }
  }
  function ouvrir(n: CentreNotif) {
    if (!n.lu) void lu(n, true);          // ouvrir = lire
    const cible = lienNotif(n);           // deep-link → la bonne page ET le bon élément
    if (cible) router.push(cible);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* En-tête : filtres + compteur + tout marquer lu */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {NOTIF_FILTRES.map((f) => {
            const actif = filtre === f.key;
            const c = compteFiltre(f.key);
            return (
              <button key={f.key} onClick={() => setFiltre(f.key)} aria-pressed={actif}
                className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[0.74rem] font-semibold transition"
                style={actif ? { background: "var(--accent)", color: "#000", borderColor: "transparent" } : { color: "var(--muted)", borderColor: "var(--border)" }}>
                {f.label}
                {c ? <span className="rounded-full px-1.5 text-[0.64rem] font-bold" style={actif ? { background: "rgba(0,0,0,.18)" } : { background: "var(--surface-2)", color: "var(--faint)" }}>{c}</span> : null}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" className="w-32 rounded-lg border border-border bg-surface-2 py-1.5 pl-7 pr-2 text-[0.74rem] outline-none focus:border-accent sm:w-40" />
          </div>
          <button onClick={() => setTriPrio((v) => !v)} aria-pressed={triPrio} title="Trier par priorité"
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.74rem] font-semibold transition"
            style={triPrio ? { background: "var(--accent)", color: "#000", borderColor: "transparent" } : { color: "var(--muted)", borderColor: "var(--border)" }}>
            <ArrowDownWideNarrow className="h-3.5 w-3.5" /> Priorité
          </button>
          <button onClick={toutLu} disabled={!nonLus}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.74rem] font-semibold text-muted transition hover:text-ink disabled:opacity-40">
            <CheckCheck className="h-3.5 w-3.5" /> Tout lu{nonLus ? ` (${nonLus})` : ""}
          </button>
        </div>
      </div>

      {affiches.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-full border" style={{ borderColor: "color-mix(in srgb,var(--accent) 30%,var(--border))", background: "color-mix(in srgb,var(--accent) 8%,transparent)" }}>
            <Bell className="h-5 w-5" style={{ color: "color-mix(in srgb,var(--accent) 70%,var(--faint))" }} strokeWidth={1.6} />
          </span>
          <p className="max-w-md font-display text-[0.9rem] italic text-muted">
            {filtre === "archive" ? "Aucune notification archivée." : "Aucune notification ici. Les télégrammes, demandes de rendez-vous, réponses des clients et changements de statut s'afficheront ici au fil de l'eau."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {affiches.map((n) => {
            const meta = notifMeta(n.type);
            const tone = TONE_TXT[meta.tone] || "var(--faint)";
            const prio = PRIORITE_META[prioriteDe(n.type)];
            return (
              <div key={n.id} className="notif-in group flex items-start gap-3 rounded-[12px] border px-3 py-2.5 transition"
                style={{ borderColor: n.lu ? "var(--border)" : "color-mix(in srgb," + tone + " 40%,var(--border))", background: n.lu ? "var(--surface-2)" : "color-mix(in srgb," + tone + " 7%,var(--surface-2))" }}>
                <span className="mt-0.5 text-[1.05rem]" aria-hidden>{meta.icon}</span>
                <button onClick={() => ouvrir(n)} className="min-w-0 flex-1 text-left" title={n.lien ? "Ouvrir la page concernée" : undefined}>
                  <div className="flex items-center gap-2">
                    {!n.lu ? <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tone }} aria-label="Non lu" /> : null}
                    <span className="truncate text-[0.86rem] font-semibold">{n.titre}</span>
                  </div>
                  {n.corps ? <div className="mt-0.5 truncate text-[0.8rem] text-muted">{n.corps}</div> : null}
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.68rem] text-faint">
                    <span className="rounded-full px-1.5 py-0.5 font-semibold" style={{ background: `color-mix(in srgb,${prio.tone} 16%,transparent)`, color: prio.tone }}>{prio.label}</span>
                    <span style={{ color: tone }}>{meta.label}</span>
                    <span>· {dtFR(n.createdAt)}</span>
                    {n.luAt ? <span>· lu {dtFR(n.luAt)}</span> : null}
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-1 opacity-70 transition group-hover:opacity-100">
                  <button onClick={() => toggleFavori(n.id)} className="grid h-7 w-7 place-items-center rounded-md border border-border" style={{ color: favoris[n.id] ? "var(--warn)" : "var(--faint)" }} aria-label="Favori" title="Favori"><Star className="h-3.5 w-3.5" fill={favoris[n.id] ? "var(--warn)" : "none"} /></button>
                  {n.lien ? <button onClick={() => ouvrir(n)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-ink" aria-label="Ouvrir"><ArrowUpRight className="h-3.5 w-3.5" /></button> : null}
                  {!n.archive ? <button onClick={() => lu(n, !n.lu)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-ink" aria-label={n.lu ? "Marquer comme non lu" : "Marquer comme lu"} title={n.lu ? "Marquer comme non lu" : "Marquer comme lu"}><Check className="h-3.5 w-3.5" /></button> : null}
                  <button onClick={() => archiver(n, !n.archive)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-ink" aria-label={n.archive ? "Désarchiver" : "Archiver"} title={n.archive ? "Désarchiver" : "Archiver"}>{n.archive ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}</button>
                  <button onClick={() => supprimer(n)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-oxblood" aria-label="Supprimer" title="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
