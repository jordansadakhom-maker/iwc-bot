"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Trash2, Crosshair } from "lucide-react";
import type { ArmeItem } from "@/lib/queries";
import { Modal, Flash, Champ, Picker, inputCls } from "@/components/edit-ui";
import { ArmeCroquis } from "@/components/arme-croquis";
import { creerArme, majArme, supprimerArme } from "@/app/(app)/inventaire/actions";

type Router = ReturnType<typeof useRouter>;

const CATEGORIES = ["Revolver", "Pistolet", "Fusil à répétition", "Fusil à pompe", "Carabine", "Fusil de précision", "Autre"];
const APPARTENANCES = [
  { key: "Iron Wolf", label: "⚖️ Iron Wolf" },
  { key: "La Confrérie", label: "🔪 La Confrérie" },
];

// Cadre « caisse d'armurerie » : coins en laiton, fond sombre.
function Cadre({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={"relative rounded-[12px] border border-border bg-surface-2 p-3 transition " + (onClick ? "cursor-pointer hover:-translate-y-0.5 hover:border-border-2" : "")}
      style={{ background: "linear-gradient(160deg,color-mix(in srgb,var(--surface) 92%,#000),color-mix(in srgb,var(--surface) 78%,#000))" }}
    >
      <span className="pointer-events-none absolute left-1.5 top-1.5 h-2.5 w-2.5 border-l border-t" style={{ borderColor: "color-mix(in srgb,var(--accent) 55%,transparent)" }} />
      <span className="pointer-events-none absolute right-1.5 top-1.5 h-2.5 w-2.5 border-r border-t" style={{ borderColor: "color-mix(in srgb,var(--accent) 55%,transparent)" }} />
      <span className="pointer-events-none absolute bottom-1.5 left-1.5 h-2.5 w-2.5 border-b border-l" style={{ borderColor: "color-mix(in srgb,var(--accent) 55%,transparent)" }} />
      <span className="pointer-events-none absolute bottom-1.5 right-1.5 h-2.5 w-2.5 border-b border-r" style={{ borderColor: "color-mix(in srgb,var(--accent) 55%,transparent)" }} />
      {children}
    </div>
  );
}

function Fiche({ arme, onClick }: { arme: ArmeItem; onClick: () => void }) {
  const conf = arme.pole === "illegal";
  return (
    <Cadre onClick={onClick}>
      <div className="grid h-[92px] place-items-center px-2" style={{ color: "color-mix(in srgb,var(--accent) 78%,var(--ink))" }}>
        <ArmeCroquis categorie={arme.categorie} type={arme.type} className="h-[84px] w-full" />
      </div>
      <div className="mt-1 border-t border-border pt-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-num text-[0.82rem] font-semibold tracking-[0.06em] text-ink">{arme.serie}</span>
          {arme.pole ? (
            <span className="rounded-md px-1.5 py-0.5 text-[0.58rem] font-bold uppercase tracking-[0.05em]" style={{ color: conf ? "var(--oxblood)" : "var(--brass)", background: `color-mix(in srgb,${conf ? "var(--oxblood)" : "var(--brass)"} 15%,transparent)` }}>
              {arme.appartenance || (conf ? "Confrérie" : "Iron Wolf")}
            </span>
          ) : arme.appartenance ? <span className="text-[0.62rem] text-faint">{arme.appartenance}</span> : null}
        </div>
        <div className="mt-0.5 truncate text-[0.8rem] text-muted">{arme.type || "—"}{arme.categorie ? <span className="text-faint"> · {arme.categorie}</span> : null}</div>
        {arme.membreNom ? <div className="mt-0.5 truncate text-[0.72rem] text-faint">Détenteur : {arme.membreNom}</div> : null}
      </div>
    </Cadre>
  );
}

export function Armurerie({ armes }: { armes: ArmeItem[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<ArmeItem | null>(null);
  const [nouveau, setNouveau] = useState(false);

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <h3 className="text-[0.8rem] font-semibold uppercase tracking-[0.06em] text-muted">Râtelier</h3>
          <span className="font-num text-[0.8rem] text-faint">{armes.length}</span>
        </div>
        <button onClick={() => setNouveau(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold text-ink transition hover:border-border-2">
          <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Nouvelle arme
        </button>
      </div>

      {armes.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-border p-5 text-center">
          <p className="mb-4 text-[0.82rem] text-muted">Le râtelier est vide. Voici les modèles de croquis — enregistre une arme pour l&apos;y accrocher.</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {[["Revolver", "Cattleman"], ["Pistolet", "Mauser"], ["Fusil à répétition", "Winchester"], ["Fusil à pompe", "Double canon"], ["Carabine", "Carabine"], ["Fusil de précision", "Rolling Block"]].map(([cat, t]) => (
              <div key={cat} className="flex flex-col items-center gap-1">
                <div className="grid h-16 w-full place-items-center" style={{ color: "color-mix(in srgb,var(--accent) 60%,var(--ink))" }}>
                  <ArmeCroquis categorie={cat} type={t} className="h-14 w-full" />
                </div>
                <span className="text-[0.62rem] uppercase tracking-[0.06em] text-faint">{cat}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {armes.map((a) => <Fiche key={a.id} arme={a} onClick={() => setSel(a)} />)}
        </div>
      )}

      {sel ? <ArmeModal arme={sel} onClose={() => setSel(null)} router={router} /> : null}
      {nouveau ? <ArmeModal onClose={() => setNouveau(false)} router={router} /> : null}
    </>
  );
}

function ArmeModal({ arme, onClose, router }: { arme?: ArmeItem; onClose: () => void; router: Router }) {
  const editing = !!arme;
  const [serie, setSerie] = useState(arme?.serie || "");
  const [type, setType] = useState(arme?.type || "");
  const [categorie, setCategorie] = useState(arme?.categorie || "Revolver");
  const [appartenance, setAppartenance] = useState(arme?.appartenance || (arme?.pole === "illegal" ? "La Confrérie" : arme?.pole === "legal" ? "Iron Wolf" : ""));
  const [membreNom, setMembreNom] = useState(arme?.membreNom || "");
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function valider() {
    if (serie.trim().length < 1) { setFlash("Indique un n° de série."); return; }
    setBusy("save");
    const payload = { serie, type, categorie, appartenance, membreNom };
    const r = editing ? await majArme(arme!.id, payload) : await creerArme(payload);
    setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    setOk(true); router.refresh();
  }
  async function supprimer() {
    setBusy("del");
    const r = await supprimerArme(arme!.id);
    setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    router.refresh(); onClose();
  }

  return (
    <Modal titre={editing ? `Arme ${arme!.serie}` : "🔫 Nouvelle arme"} onClose={onClose} max={480}>
      {ok ? (
        <div className="flex flex-col gap-3">
          <Flash>Enregistré — le râtelier se met à jour dans ~30 s.</Flash>
          <div className="flex justify-end"><button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}>Fermer</button></div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* aperçu du croquis en direct */}
          <div className="grid h-24 place-items-center rounded-[10px] border border-border" style={{ color: "color-mix(in srgb,var(--accent) 78%,var(--ink))", background: "linear-gradient(160deg,color-mix(in srgb,var(--surface) 90%,#000),color-mix(in srgb,var(--surface) 76%,#000))" }}>
            <ArmeCroquis categorie={categorie} type={type} className="h-20 w-2/3" />
          </div>
          {flash ? <Flash tone="bad">{flash}</Flash> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ label="N° de série *"><input className={inputCls} value={serie} onChange={(e) => setSerie(e.target.value)} placeholder="SN-4471" maxLength={60} autoFocus /></Champ>
            <Champ label="Modèle / type"><input className={inputCls} value={type} onChange={(e) => setType(e.target.value)} placeholder="Cattleman, Winchester…" maxLength={80} /></Champ>
          </div>
          <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Catégorie</span>
            <select className={inputCls} value={categorie} onChange={(e) => setCategorie(e.target.value)}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          </div>
          <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Appartenance</span><Picker options={APPARTENANCES} value={appartenance} onChange={setAppartenance} /></div>
          <Champ label="Détenteur (optionnel)"><input className={inputCls} value={membreNom} onChange={(e) => setMembreNom(e.target.value)} placeholder="Nom du détenteur" maxLength={120} /></Champ>
          <div className="flex justify-end"><button onClick={valider} disabled={busy === "save"} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" strokeWidth={2} />} {editing ? "Enregistrer" : "Enregistrer au râtelier"}</button></div>
          {editing ? (
            <div className="mt-1 flex items-center justify-between border-t border-border pt-3">
              <ConfirmDel onDelete={supprimer} busy={busy === "del"} />
              <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[0.8rem] font-semibold hover:border-border-2">Fermer</button>
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

function ConfirmDel({ onDelete, busy }: { onDelete: () => void; busy: boolean }) {
  const [c, setC] = useState(false);
  if (!c) return <button onClick={() => setC(true)} className="inline-flex items-center gap-1.5 text-[0.76rem] text-faint hover:text-ink"><Trash2 className="h-3.5 w-3.5" /> Retirer du râtelier</button>;
  return (
    <div className="flex items-center gap-2 text-[0.78rem]">
      <span className="text-muted">Retirer ?</span>
      <button onClick={onDelete} disabled={busy} className="rounded-lg px-2.5 py-1 text-[0.76rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--oxblood)" }}>{busy ? "…" : "Oui"}</button>
      <button onClick={() => setC(false)} className="text-[0.76rem] text-muted hover:text-ink">Annuler</button>
    </div>
  );
}

// (icône exportée pour l'en-tête de page)
export { Crosshair };
