"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Store, Search, Plus, Trash2, Loader2, Check, X, Trophy, History, ChevronDown,
  Power, Pencil, ShieldAlert, Leaf, AlertTriangle,
} from "lucide-react";
import { Modal, Flash } from "@/components/edit-ui";
import type { MarchesData, VilleMarche, RessourceMarche, CategorieMarche } from "@/lib/marches-chasse";
import {
  creerVilleMarche, renommerVilleMarche, basculerVilleMarche, supprimerVilleMarche,
  creerRessourceMarche, supprimerRessourceMarche, definirPrixMarche,
} from "@/app/(app)/chasse/marches-actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
const money = (n: number) => "$" + n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFR = (s: string | null) => { if (!s) return ""; try { return new Date(s).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
const CAT: Record<CategorieMarche, { label: string; c: string; icon: typeof Leaf }> = {
  legal: { label: "Légal", c: "var(--good)", icon: Leaf },
  illegal: { label: "Illégal", c: "var(--oxblood)", icon: ShieldAlert },
};

// Comparateur (client) : meilleure ville pour une ressource + écart avec la 2e.
function meilleure(prixParVille: Record<string, number>, villes: VilleMarche[]) {
  const e = villes.map((v) => ({ id: v.id, nom: v.nom, prix: Number(prixParVille[v.id]) || 0 })).filter((x) => x.prix > 0).sort((a, b) => b.prix - a.prix);
  if (!e.length) return null;
  return { villeId: e[0].id, nom: e[0].nom, prix: e[0].prix, ecart: Math.round((e[0].prix - (e[1]?.prix ?? 0)) * 100) / 100 };
}

export function MarchesChasse({ data }: { data: MarchesData }) {
  const router = useRouter();
  const peut = data.peut;
  const [villes, setVilles] = useState<VilleMarche[]>(data.villes);
  const [ressources, setRessources] = useState<RessourceMarche[]>(data.ressources);
  const [prix, setPrix] = useState<Record<string, Record<string, number>>>(data.prix);
  const [q, setQ] = useState("");
  const [fVille, setFVille] = useState<string>("all");
  const [fCat, setFCat] = useState<"all" | CategorieMarche>("all");
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [histo, setHisto] = useState(false);
  const [modal, setModal] = useState<null | "villes" | "ressource">(null);
  const [saving, setSaving] = useState<string | null>(null);

  const actives = villes.filter((v) => v.actif);
  const colonnes = fVille === "all" ? actives : actives.filter((v) => v.id === fVille);
  const query = q.trim().toLowerCase();

  const setPrixLocal = (villeId: string, res: string, val: number) =>
    setPrix((p) => ({ ...p, [villeId]: { ...(p[villeId] || {}), [res]: val } }));

  async function sauverPrix(v: VilleMarche, res: string, valeur: string) {
    const val = Math.max(0, Math.round((Number(valeur.replace(",", ".")) || 0) * 100) / 100);
    if ((prix[v.id]?.[res] || 0) === val) return;
    setPrixLocal(v.id, res, val);
    setSaving(`${v.id}-${res}`);
    const r = await definirPrixMarche({ villeId: v.id, villeNom: v.nom, ressource: res, prix: val });
    setSaving(null);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Échec." }); } else { router.refresh(); }
  }

  const ressourcesFiltrees = useMemo(() => ressources
    .filter((r) => (fCat === "all" || r.categorie === fCat) && (!query || r.nom.toLowerCase().includes(query)))
    .sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom)), [ressources, fCat, query]);

  if (!data.pret) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
        <AlertTriangle className="h-6 w-6" style={{ color: "var(--warn)" }} />
        <p className="max-w-md text-[0.88rem] text-muted">Le module <b>Villes &amp; Marchés</b> attend sa base de données. Lance <b>web/prisma/sql/chasse-marches.sql</b> dans Supabase → SQL Editor, puis recharge.</p>
      </div>
    );
  }

  const sections: CategorieMarche[] = fCat === "all" ? ["legal", "illegal"] : [fCat];

  return (
    <div className="flex flex-col gap-4">
      {/* Barre d'outils */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une ressource, une ville…" className="w-full rounded-lg border border-border bg-surface-2 py-2 pl-8 pr-2 text-[0.85rem] outline-none focus:border-border-2" />
        </div>
        <select value={fVille} onChange={(e) => setFVille(e.target.value)} className="rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-[0.82rem] outline-none focus:border-border-2">
          <option value="all">Toutes les villes</option>
          {actives.map((v) => <option key={v.id} value={v.id}>{v.nom}</option>)}
        </select>
        <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5">
          {(["all", "legal", "illegal"] as const).map((c) => (
            <button key={c} onClick={() => setFCat(c)} className="rounded-md px-2.5 py-1.5 text-[0.78rem] font-semibold transition" style={fCat === c ? { background: c === "all" ? "var(--accent)" : CAT[c as CategorieMarche].c, color: "#000" } : { color: "var(--muted)" }}>
              {c === "all" ? "Tout" : CAT[c].label}
            </button>
          ))}
        </div>
        {peut ? (
          <>
            <button onClick={() => setModal("villes")} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-[0.78rem] font-semibold hover:border-border-2"><Store className="h-3.5 w-3.5" /> Gérer les villes</button>
            <button onClick={() => setModal("ressource")} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[0.78rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Plus className="h-3.5 w-3.5" /> Ressource</button>
          </>
        ) : null}
      </div>

      {flash ? <Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash> : null}

      {actives.length === 0 ? (
        <p className="rounded-[12px] border border-dashed border-border px-4 py-8 text-center text-[0.85rem] italic text-faint">
          Aucune ville active. {peut ? "Ajoute une ville via « Gérer les villes »." : "Un officier ou la Direction doit ajouter des villes."}
        </p>
      ) : sections.map((cat) => {
        const liste = ressourcesFiltrees.filter((r) => r.categorie === cat);
        if (!liste.length) return null;
        const Ic = CAT[cat].icon;
        return (
          <div key={cat} className="rounded-[14px] border" style={{ borderColor: `color-mix(in srgb,${CAT[cat].c} 30%,var(--border))` }}>
            <div className="flex items-center gap-2 border-b px-3.5 py-2.5" style={{ borderColor: `color-mix(in srgb,${CAT[cat].c} 22%,var(--border))`, background: `color-mix(in srgb,${CAT[cat].c} 7%,transparent)` }}>
              <Ic className="h-4 w-4" style={{ color: CAT[cat].c }} />
              <span className="text-[0.82rem] font-bold uppercase tracking-[0.06em]" style={{ color: CAT[cat].c }}>{CAT[cat].label}</span>
              <span className="text-[0.72rem] text-faint">· {liste.length} ressource{liste.length > 1 ? "s" : ""}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left text-[0.84rem]">
                <thead>
                  <tr className="text-[0.66rem] uppercase tracking-[0.05em] text-faint">
                    <th className="border-b border-border px-3 py-2 font-semibold">Ressource</th>
                    {colonnes.map((v) => <th key={v.id} className="border-b border-border px-3 py-2 text-right font-semibold">{v.nom}</th>)}
                    <th className="border-b border-border px-3 py-2 text-right font-semibold" style={{ color: "var(--brass-hi)" }}>Meilleur</th>
                    {peut ? <th className="border-b border-border px-2 py-2"></th> : null}
                  </tr>
                </thead>
                <tbody>
                  {liste.map((r) => {
                    const parVille: Record<string, number> = {};
                    for (const v of actives) parVille[v.id] = prix[v.id]?.[r.nom] || 0;
                    const best = meilleure(parVille, actives);
                    return (
                      <tr key={r.id} className="hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]">
                        <td className="border-b border-border px-3 py-2 font-medium">{r.nom}</td>
                        {colonnes.map((v) => {
                          const val = prix[v.id]?.[r.nom] || 0;
                          const estBest = best && best.villeId === v.id && val > 0;
                          return (
                            <td key={v.id} className="border-b border-border px-2 py-1.5 text-right" style={estBest ? { background: "color-mix(in srgb,var(--brass-hi) 12%,transparent)" } : undefined}>
                              {peut ? (
                                <input
                                  type="number" min={0} step="0.01" inputMode="decimal" defaultValue={val || ""}
                                  onBlur={(e) => sauverPrix(v, r.nom, e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                  placeholder="—"
                                  className="w-[76px] rounded-md border border-border bg-surface px-2 py-1 text-right font-num text-[0.8rem] outline-none focus:border-border-2"
                                  style={estBest ? { color: "var(--brass-hi)", fontWeight: 700 } : undefined}
                                />
                              ) : (
                                <span className="font-num" style={estBest ? { color: "var(--brass-hi)", fontWeight: 700 } : { color: val ? "var(--ink)" : "var(--faint)" }}>{val ? money(val) : "—"}</span>
                              )}
                              {saving === `${v.id}-${r.nom}` ? <Loader2 className="ml-1 inline h-3 w-3 animate-spin text-faint" /> : null}
                            </td>
                          );
                        })}
                        <td className="border-b border-border px-3 py-2 text-right">
                          {best ? (
                            <span className="inline-flex items-center gap-1 font-num font-semibold" style={{ color: "var(--brass-hi)" }} title={best.ecart > 0 ? `+${money(best.ecart)} vs 2ᵉ` : "seule offre"}>
                              <Trophy className="h-3.5 w-3.5" /> {best.nom} · {money(best.prix)}
                              {best.ecart > 0 ? <span className="text-[0.7rem] font-normal text-faint"> (+{money(best.ecart)})</span> : null}
                            </span>
                          ) : <span className="text-faint">—</span>}
                        </td>
                        {peut ? (
                          <td className="border-b border-border px-2 py-1.5 text-right">
                            <button onClick={async () => { if (saving) return; setSaving(r.id); const res = await supprimerRessourceMarche(r.id, r.nom); setSaving(null); if (res.ok) { setRessources((rs) => rs.filter((x) => x.id !== r.id)); router.refresh(); } else setFlash({ t: "bad", m: res.error || "Échec." }); }} className="text-faint hover:text-oxblood" title="Supprimer la ressource"><Trash2 className="h-3.5 w-3.5" /></button>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Historique */}
      {data.historique.length ? (
        <div className="border-t border-border pt-3">
          <button onClick={() => setHisto((v) => !v)} className="inline-flex items-center gap-1.5 text-[0.74rem] font-semibold text-muted hover:text-ink"><History className="h-3.5 w-3.5" /> Historique des prix ({data.historique.length}) <ChevronDown className={"h-3.5 w-3.5 transition-transform " + (histo ? "rotate-180" : "")} /></button>
          {histo ? (
            <div className="mt-2 flex flex-col gap-1">
              {data.historique.map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-3 rounded-[8px] border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem]">
                  <span className="min-w-0 truncate"><b>{h.ressource}</b> <span className="text-faint">· {h.ville}</span> — {h.ancien == null ? "∅" : money(Number(h.ancien))} → <b style={{ color: "var(--brass-hi)" }}>{money(Number(h.nouveau))}</b></span>
                  <span className="shrink-0 text-faint">{h.par ? `${h.par} · ` : ""}{dateFR(h.createdAt)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {modal === "villes" ? <VillesModal villes={villes} setVilles={setVilles} onClose={() => setModal(null)} setFlash={setFlash} /> : null}
      {modal === "ressource" ? <RessourceModal onClose={() => setModal(null)} onCree={(r) => setRessources((rs) => [...rs, r])} setFlash={setFlash} /> : null}
    </div>
  );
}

function VillesModal({ villes, setVilles, onClose, setFlash }: { villes: VilleMarche[]; setVilles: React.Dispatch<React.SetStateAction<VilleMarche[]>>; onClose: () => void; setFlash: (f: FlashMsg) => void }) {
  const router = useRouter();
  const [nom, setNom] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function ajouter() {
    const n = nom.trim(); if (!n) return;
    setBusy("add");
    const r = await creerVilleMarche(n);
    setBusy(null);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Échec." }); return; }
    setNom(""); router.refresh(); onClose();
  }
  async function bascule(v: VilleMarche) {
    setBusy(v.id); const r = await basculerVilleMarche(v.id, !v.actif); setBusy(null);
    if (r.ok) setVilles((vs) => vs.map((x) => (x.id === v.id ? { ...x, actif: !x.actif } : x))); else setFlash({ t: "bad", m: r.error || "Échec." });
  }
  async function renommer(v: VilleMarche, nouveau: string) {
    if (!nouveau.trim() || nouveau === v.nom) return;
    const r = await renommerVilleMarche(v.id, nouveau.trim());
    if (r.ok) setVilles((vs) => vs.map((x) => (x.id === v.id ? { ...x, nom: nouveau.trim() } : x))); else setFlash({ t: "bad", m: r.error || "Échec." });
  }
  async function supprimer(v: VilleMarche) {
    setBusy(v.id); const r = await supprimerVilleMarche(v.id); setBusy(null);
    if (r.ok) { setVilles((vs) => vs.filter((x) => x.id !== v.id)); router.refresh(); } else setFlash({ t: "bad", m: r.error || "Échec." });
  }

  return (
    <Modal titre="🏙️ Gérer les villes" onClose={onClose} max={520}>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <input value={nom} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ajouter(); }} placeholder="Nouvelle ville (ex : Valentine)" className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[0.85rem] outline-none focus:border-border-2" maxLength={60} autoFocus />
          <button onClick={ajouter} disabled={busy === "add" || !nom.trim()} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-50" style={{ background: "var(--accent)" }}>{busy === "add" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Ajouter</button>
        </div>
        <div className="flex max-h-[46vh] flex-col gap-1 overflow-y-auto pr-1">
          {villes.length === 0 ? <p className="px-1 py-6 text-center text-[0.82rem] text-faint">Aucune ville. Ajoute-en une ci-dessus.</p> : villes.map((v) => (
            <div key={v.id} className="flex items-center gap-2 rounded-[10px] border border-border bg-surface-2 px-2.5 py-2" style={v.actif ? undefined : { opacity: 0.55 }}>
              <input defaultValue={v.nom} onBlur={(e) => renommer(v, e.target.value)} className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[0.85rem] font-medium outline-none hover:border-border focus:border-border-2" />
              <span className="shrink-0 rounded-full px-2 py-0.5 text-[0.66rem] font-semibold" style={v.actif ? { color: "var(--good)", background: "color-mix(in srgb,var(--good) 14%,transparent)" } : { color: "var(--faint)", background: "color-mix(in srgb,var(--ink) 8%,transparent)" }}>{v.actif ? "Active" : "Inactive"}</span>
              <button onClick={() => bascule(v)} disabled={busy === v.id} title={v.actif ? "Désactiver" : "Activer"} className="grid h-7 w-7 place-items-center rounded-md border border-border text-muted hover:text-ink"><Power className="h-3.5 w-3.5" /></button>
              <button onClick={() => supprimer(v)} disabled={busy === v.id} title="Supprimer" className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-oxblood">{busy === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}</button>
            </div>
          ))}
        </div>
        <p className="text-[0.72rem] text-faint">Renomme en cliquant le nom. Une ville désactivée reste enregistrée mais sort du comparateur.</p>
        <div className="flex justify-end"><button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Fermer</button></div>
      </div>
    </Modal>
  );
}

function RessourceModal({ onClose, onCree, setFlash }: { onClose: () => void; onCree: (r: RessourceMarche) => void; setFlash: (f: FlashMsg) => void }) {
  const router = useRouter();
  const [nom, setNom] = useState("");
  const [cat, setCat] = useState<CategorieMarche>("legal");
  const [busy, setBusy] = useState(false);

  async function creer() {
    const n = nom.trim(); if (!n) return;
    setBusy(true);
    const r = await creerRessourceMarche(n, cat);
    setBusy(false);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Échec." }); return; }
    router.refresh(); onClose();
  }
  return (
    <Modal titre="➕ Nouvelle ressource" onClose={onClose} max={440}>
      <div className="flex flex-col gap-3">
        <input value={nom} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") creer(); }} placeholder="Nom de la ressource (ex : Cerf)" className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[0.85rem] outline-none focus:border-border-2" maxLength={80} autoFocus />
        <div className="flex gap-2">
          {(["legal", "illegal"] as const).map((c) => (
            <button key={c} onClick={() => setCat(c)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[0.82rem] font-semibold transition" style={cat === c ? { color: "#000", background: CAT[c].c, borderColor: CAT[c].c } : { color: CAT[c].c, borderColor: `color-mix(in srgb,${CAT[c].c} 40%,var(--border))` }}>
              {c === "legal" ? <Leaf className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />} {CAT[c].label}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={creer} disabled={busy || !nom.trim()} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-50" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Créer</button>
        </div>
      </div>
    </Modal>
  );
}
