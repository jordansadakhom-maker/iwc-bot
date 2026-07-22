"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Trash2, User, ScanSearch } from "lucide-react";
import type { AvisItem } from "@/lib/queries";
import { Modal, Flash, Champ, Picker, inputCls } from "@/components/edit-ui";
import { emettreAvis, majAvis, retirerAvis, genererFicheCible } from "@/app/(app)/wanted/actions";
import { LireBtn } from "@/components/mic-dictee";

type Router = ReturnType<typeof useRouter>;

const DANGER = [
  { key: "faible", label: "Faible", tone: "#3d8f68" },
  { key: "moyen", label: "Moyen", tone: "#c98500" },
  { key: "eleve", label: "Élevé", tone: "#d95926" },
  { key: "extreme", label: "Extrême", tone: "#a3271f" },
];
const VIVANTMORT = [{ key: "Indifférent", label: "Mort ou vif" }, { key: "Vivant", label: "Vivant" }, { key: "Mort", label: "Mort" }];
const STATUT = [
  { key: "chasse", label: "En chasse", tone: "#a3271f" },
  { key: "capturee", label: "Capturé", tone: "#3d8f68" },
  { key: "eliminee", label: "Abattu", tone: "#5a5148" },
  { key: "abandonnee", label: "Classé", tone: "#8a8178" },
];
const dLabel = (k?: string | null) => DANGER.find((d) => d.key === (k || "").toLowerCase())?.label || k || "—";
const dTone = (k?: string | null) => DANGER.find((d) => d.key === (k || "").toLowerCase())?.tone || "#8a8178";
const sInfo = (k?: string | null) => STATUT.find((s) => s.key === (k || "").toLowerCase());
function mortVif(vm?: string | null) {
  const v = (vm || "").toLowerCase();
  if (v.includes("mort") && !v.includes("vif")) return "RECHERCHÉ · MORT";
  if (v.includes("vivant")) return "RECHERCHÉ · VIVANT";
  return "MORT OU VIF";
}

// Couleurs « parchemin » (objet volontairement clair, épinglé sur le mur sombre).
const PAPER = "linear-gradient(160deg,#e9ddc2,#d9c7a1)";
const INK = "#2c2013";
const REDINK = "#8a271f";

function Affiche({ a, onClick }: { a: AvisItem; onClick: () => void }) {
  const st = sInfo(a.statut);
  const clos = a.statut && !["chasse"].includes(a.statut.toLowerCase());
  return (
    <button onClick={onClick} className="group relative text-left transition hover:-translate-y-1" style={{ transform: "rotate(-0.6deg)" }}>
      <div className="rounded-[6px] p-3.5 shadow-[0_10px_24px_rgba(0,0,0,0.45)]" style={{ background: PAPER, color: INK, border: "1px solid #b9a675", boxShadow: "inset 0 0 44px rgba(120,88,40,0.28), 0 10px 22px rgba(0,0,0,0.45)" }}>
        {/* punaise */}
        <span className="absolute left-1/2 top-1 h-3 w-3 -translate-x-1/2 rounded-full" style={{ background: "radial-gradient(circle at 35% 30%, #d76b60, #7c1d16)", boxShadow: "0 1px 2px rgba(0,0,0,0.5)" }} />
        <div className="text-center">
          <div className="font-display text-[1.7rem] font-bold leading-none tracking-[0.14em]" style={{ color: REDINK }}>WANTED</div>
          <div className="mt-0.5 text-[0.6rem] font-bold uppercase tracking-[0.3em]" style={{ color: INK }}>{mortVif(a.vivantMort)}</div>
        </div>
        {/* portrait */}
        <div className="mx-auto mt-2.5 aspect-square w-full overflow-hidden rounded-[3px]" style={{ border: "2px solid " + INK, background: "#c9b58c" }}>
          {a.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.photo} alt={a.cible} className="h-full w-full object-cover" style={{ filter: "sepia(0.5) contrast(1.05)" }} />
          ) : (
            <div className="grid h-full w-full place-items-center" style={{ color: "#7a6a4c" }}><User className="h-14 w-14" strokeWidth={1.2} /></div>
          )}
        </div>
        <div className="mt-2 text-center font-display text-[1.15rem] font-bold uppercase leading-tight tracking-[0.03em]">{a.cible}</div>
        <div className="my-2 h-px" style={{ background: "repeating-linear-gradient(90deg," + INK + " 0 6px,transparent 6px 10px)", opacity: 0.5 }} />
        <div className="text-center">
          <div className="text-[0.58rem] font-bold uppercase tracking-[0.24em]" style={{ color: INK }}>Récompense</div>
          <div className="font-display text-[1.5rem] font-bold" style={{ color: REDINK }}>{a.prime || "—"}</div>
        </div>
        <div className="mt-2 flex items-center justify-center gap-2 text-[0.62rem] uppercase tracking-[0.05em]">
          <span className="rounded-sm px-1.5 py-0.5 font-bold" style={{ color: "#fff", background: dTone(a.dangerosite) }}>{dLabel(a.dangerosite)}</span>
          {a.position ? <span style={{ color: INK }}>vu à {a.position}</span> : null}
        </div>
        {a.chasseurs > 0 ? (
          <div className="mt-1.5 text-center text-[0.6rem] font-bold uppercase tracking-[0.1em]" style={{ color: REDINK }}>
            🐺 {a.chasseurs} chasseur{a.chasseurs > 1 ? "s" : ""} sur la piste
          </div>
        ) : null}
        {/* tampon de statut */}
        {clos && st ? (
          <span className="pointer-events-none absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 rotate-[-14deg] rounded border-[3px] px-3 py-0.5 font-display text-[1.15rem] font-bold uppercase tracking-[0.12em]" style={{ color: st.tone, borderColor: st.tone, opacity: 0.9, background: "rgba(233,221,194,0.35)" }}>{st.label}</span>
        ) : null}
      </div>
    </button>
  );
}

const statutKey = (a: AvisItem) => (a.statut || "chasse").toLowerCase();

export function WantedWall({ avis }: { avis: AvisItem[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<AvisItem | null>(null);
  const [nouveau, setNouveau] = useState(false);
  const [filtre, setFiltre] = useState(""); // "" = tous | clé de STATUT

  const counts = STATUT.map((s) => ({ ...s, n: avis.filter((a) => statutKey(a) === s.key).length })).filter((s) => s.n);
  // Les cibles « En chasse » (dossiers ouverts) remontent toujours en tête du mur.
  const affiches = [...avis]
    .filter((a) => !filtre || statutKey(a) === filtre)
    .sort((a, b) => Number(statutKey(b) === "chasse") - Number(statutKey(a) === "chasse"));

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <h3 className="text-[0.8rem] font-semibold uppercase tracking-[0.06em] text-muted">Avis de recherche</h3>
          <span className="font-num text-[0.8rem] text-faint">{avis.length}</span>
        </div>
        <button onClick={() => setNouveau(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold text-ink transition hover:border-border-2">
          <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Nouvel avis
        </button>
      </div>

      {avis.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-border px-4 py-12 text-center">
          <p className="mx-auto max-w-md font-display text-[0.95rem] italic text-muted">Aucun avis de recherche placardé. Émets-en un — il rejoindra le mur et le Discord.</p>
        </div>
      ) : (
        <>
          {counts.length > 1 ? (
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <button onClick={() => setFiltre("")} aria-pressed={!filtre}
                className="rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold transition"
                style={!filtre ? { borderColor: "color-mix(in srgb,var(--accent) 55%,var(--border))", background: "color-mix(in srgb,var(--accent) 16%,transparent)", color: "var(--accent)" } : { borderColor: "var(--border)", color: "var(--muted)" }}>
                Tous <span className="font-num text-faint">{avis.length}</span>
              </button>
              {counts.map((s) => {
                const on = filtre === s.key;
                return (
                  <button key={s.key} onClick={() => setFiltre(on ? "" : s.key)} aria-pressed={on}
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold transition"
                    style={{ borderColor: on ? `color-mix(in srgb,${s.tone} 60%,var(--border))` : "var(--border)", background: on ? `color-mix(in srgb,${s.tone} 18%,transparent)` : "transparent", color: on ? "var(--ink)" : "var(--muted)" }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.tone }} /> {s.label} <span className="font-num text-faint">{s.n}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          <div className="grid gap-6 px-1 py-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {affiches.map((a) => <Affiche key={a.id} a={a} onClick={() => setSel(a)} />)}
          </div>
        </>
      )}

      {sel ? <AvisModal avis={sel} onClose={() => setSel(null)} router={router} /> : null}
      {nouveau ? <AvisModal onClose={() => setNouveau(false)} router={router} /> : null}
    </>
  );
}

function AvisModal({ avis, onClose, router }: { avis?: AvisItem; onClose: () => void; router: Router }) {
  const editing = !!avis;
  const [cible, setCible] = useState(avis?.cible || "");
  const [prime, setPrime] = useState(avis?.prime || "");
  const [dangerosite, setDangerosite] = useState((avis?.dangerosite || "moyen").toLowerCase());
  const [vivantMort, setVivantMort] = useState(avis?.vivantMort || "Indifférent");
  const [statut, setStatut] = useState((avis?.statut || "chasse").toLowerCase());
  const [position, setPosition] = useState(avis?.position || "");
  const [commanditaire, setCommanditaire] = useState(avis?.commanditaire || "");
  const [signalement, setSignalement] = useState(avis?.signalement || "");
  const [photo, setPhoto] = useState(avis?.photo || "");
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [fiche, setFiche] = useState<string | null>(null);

  async function ficheIA() {
    if (!avis) return;
    setBusy("fiche"); setFlash(null);
    const r = await genererFicheCible(avis.id);
    setBusy(null);
    if (r.ok && r.texte) setFiche(r.texte); else setFlash(r.error || "Fiche indisponible.");
  }

  async function valider() {
    if (cible.trim().length < 2) { setFlash("Indique la cible."); return; }
    setBusy("save");
    const payload = { cible, prime, dangerosite, vivantMort, statut, position, commanditaire, signalement, photo };
    const r = editing ? await majAvis(avis!.id, payload) : await emettreAvis(payload);
    setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    setOk(true); router.refresh();
  }
  async function supprimer() {
    setBusy("del");
    const r = await retirerAvis(avis!.id);
    setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    router.refresh(); onClose();
  }

  return (
    <Modal titre={editing ? `Avis — ${avis!.cible}` : "🪧 Nouvel avis de recherche"} onClose={onClose} max={520}>
      {ok ? (
        <div className="flex flex-col gap-3"><Flash>Avis placardé — le mur et Discord se mettent à jour dans ~30 s.</Flash><div className="flex justify-end"><button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}>Fermer</button></div></div>
      ) : (
        <div className="flex flex-col gap-3">
          {flash ? <Flash tone="bad">{flash}</Flash> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ label="Cible *"><input className={inputCls} value={cible} onChange={(e) => setCible(e.target.value)} placeholder="Nom du recherché" maxLength={200} autoFocus /></Champ>
            <Champ label="Récompense"><input className={inputCls} value={prime} onChange={(e) => setPrime(e.target.value)} placeholder="$500" maxLength={120} /></Champ>
          </div>
          <Champ label="Photo (lien image, optionnel)"><input className={inputCls} value={photo} onChange={(e) => setPhoto(e.target.value)} placeholder="https://…" maxLength={500} /></Champ>
          <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Dangerosité</span><Picker options={DANGER} value={dangerosite} onChange={setDangerosite} /></div>
          <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Consigne</span><Picker options={VIVANTMORT} value={vivantMort} onChange={setVivantMort} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ label="Dernière position"><input className={inputCls} value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Valentine, Colter…" maxLength={200} /></Champ>
            <Champ label="Commanditaire"><input className={inputCls} value={commanditaire} onChange={(e) => setCommanditaire(e.target.value)} placeholder="Qui met la prime" maxLength={200} /></Champ>
          </div>
          <Champ label="Signalement"><textarea className={inputCls + " min-h-[64px] resize-y"} value={signalement} onChange={(e) => setSignalement(e.target.value)} placeholder="Crimes, description, dernières nouvelles…" maxLength={2000} /></Champ>
          <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Statut</span><Picker options={STATUT} value={statut} onChange={setStatut} /></div>
          <div className="flex justify-end"><button onClick={valider} disabled={busy === "save"} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" strokeWidth={2} />} {editing ? "Enregistrer" : "Placarder l'avis"}</button></div>
          {editing ? (
            <div className="mt-1 flex flex-col gap-2.5 border-t border-border pt-3">
              <div className="flex items-center gap-2">
                <button onClick={ficheIA} disabled={busy === "fiche"} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[0.78rem] font-semibold text-muted transition hover:border-[color-mix(in_srgb,var(--accent)_55%,var(--border))] hover:text-ink disabled:opacity-60">
                  {busy === "fiche" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />} Fiche cible IA
                </button>
                {fiche ? <LireBtn texte={fiche} /> : null}
                <span className="text-[0.7rem] text-faint">Profil, dangerosité & recommandations</span>
              </div>
              {fiche ? (
                <div className="rounded-[10px] border border-border bg-surface-2 p-3">
                  <p className="whitespace-pre-wrap text-[0.84rem] leading-relaxed text-ink">{fiche}</p>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <ConfirmDel onDelete={supprimer} busy={busy === "del"} />
                <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[0.8rem] font-semibold hover:border-border-2">Fermer</button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

function ConfirmDel({ onDelete, busy }: { onDelete: () => void; busy: boolean }) {
  const [c, setC] = useState(false);
  if (!c) return <button onClick={() => setC(true)} className="inline-flex items-center gap-1.5 text-[0.76rem] text-faint hover:text-ink"><Trash2 className="h-3.5 w-3.5" /> Retirer l&apos;avis</button>;
  return (
    <div className="flex items-center gap-2 text-[0.78rem]">
      <span className="text-muted">Retirer ?</span>
      <button onClick={onDelete} disabled={busy} className="rounded-lg px-2.5 py-1 text-[0.76rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--oxblood)" }}>{busy ? "…" : "Oui"}</button>
      <button onClick={() => setC(false)} className="text-[0.76rem] text-muted hover:text-ink">Annuler</button>
    </div>
  );
}
