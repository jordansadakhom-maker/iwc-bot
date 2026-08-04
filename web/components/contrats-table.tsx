"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, Plus, Loader2, Trash2, Users, CalendarClock, Landmark, Check, Sparkles, Printer, Send } from "lucide-react";
import type { ContratDetail } from "@/lib/queries";
import type { Suggestion } from "@/lib/attribution";
import { Badge } from "@/components/ui";
import { Modal, Flash, Champ, Picker, inputCls } from "@/components/edit-ui";
import { creerContrat, majContrat, supprimerContrat, majSuiviContrat, honorerContrat, suggererAgents, envoyerContratSignature } from "@/app/(app)/operations/actions";
import { cents } from "@/lib/format";

const dateFR = (s: string | null) => { if (!s) return null; try { return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }); } catch { return null; } };
// N° de contrat stable (dérivé de l'id) pour l'aperçu parchemin.
const numeroContrat = (id: string) => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return "C-" + (100 + (h % 900)); };

// Pipeline de suivi (5 étapes, comme sur Discord).
const SUIVI = ["En attente", "En cours", "Validé", "Honoré", "Abandonné"];
const SUIVI_TONE: Record<string, "warn" | "accent" | "good" | "muted"> = {
  "En attente": "warn", "En cours": "accent", "Validé": "good", "Honoré": "good", "Abandonné": "muted",
};
// Déduit l'étape de suivi depuis le statut brut quand elle n'est pas encore définie.
function suiviDeStatut(statut: string): string {
  const s = (statut || "").toLowerCase();
  if (/honor/.test(s)) return "Honoré";
  if (/signe|actif|cours|valide/.test(s)) return s.includes("valide") ? "Validé" : "En cours";
  if (/refuse|annul|abandon|echou/.test(s)) return "Abandonné";
  return "En attente";
}

function ContratDetailBloc({ c }: { c: ContratDetail }) {
  const cree = dateFR(c.createdAt);
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-[12px] border border-border bg-surface-2 px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={c.pole === "illegal" ? "oxblood" : "accent"}>{c.pole === "illegal" ? "🔪 Confrérie" : "⚖️ Iron Wolf"}</Badge>
        {c.categorie ? <Badge tone="muted">{c.categorie}</Badge> : null}
        {c.risque ? <Badge tone={c.risque === "sanglant" ? "oxblood" : c.risque === "risque" ? "warn" : "good"}>{RISQUE_LABEL[c.risque] || c.risque}</Badge> : null}
        <Badge tone={SUIVI_TONE[c.suivi || suiviDeStatut(c.statut)] ?? "muted"}>{c.suivi || suiviDeStatut(c.statut)}</Badge>
        {c.remuneration ? <span className="ml-auto font-num text-[0.86rem] font-semibold" style={{ color: "var(--accent)" }}>{c.remuneration}</span> : null}
      </div>
      {c.remuVerseAuCoffre ? <div className="flex items-center gap-1.5 text-[0.8rem]" style={{ color: "var(--good)" }}><Landmark className="h-3.5 w-3.5" /> {cents(c.remuVerseAuCoffre)}$ versés au coffre</div> : null}
      <div className="text-[0.86rem] leading-relaxed text-ink">{c.cible}</div>
      {c.commanditaire ? <div className="text-[0.8rem] text-muted"><span className="text-faint">Commanditaire : </span>{c.commanditaire}</div> : null}
      {c.echeance ? <div className="text-[0.8rem] text-muted"><span className="text-faint">Échéance : </span>{c.echeance}</div> : null}
      {c.motif ? <div className="text-[0.82rem] leading-relaxed text-muted"><span className="text-faint">Consignes / détails : </span>{c.motif}</div> : null}
      {c.agentsNoms.length ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-[0.72rem] uppercase tracking-[0.05em] text-faint"><Users className="h-3.5 w-3.5" /> Agents ({c.agentsNoms.length})</div>
          <div className="flex flex-wrap gap-1.5">
            {c.agentsNoms.map((n, i) => <span key={i} className="rounded-full border border-border bg-surface px-2 py-0.5 text-[0.76rem]">{n}</span>)}
          </div>
        </div>
      ) : null}
      {cree ? <div className="flex items-center gap-1.5 text-[0.78rem] text-muted"><CalendarClock className="h-3.5 w-3.5 text-faint" /> {cree}</div> : null}
    </div>
  );
}

type Router = ReturnType<typeof useRouter>;

const STATUTS = [
  { key: "en_attente", label: "En attente", tone: "var(--warn)" },
  { key: "valide", label: "Validé", tone: "var(--good)" },
  { key: "signe", label: "Signé", tone: "var(--good)" },
  { key: "termine", label: "Terminé", tone: "var(--muted)" },
  { key: "annule", label: "Annulé", tone: "var(--muted)" },
  { key: "refuse", label: "Refusé", tone: "var(--oxblood)" },
];
const POLES = [
  { key: "legal", label: "⚖️ Iron Wolf" },
  { key: "illegal", label: "🔪 La Confrérie" },
];
const STATUT_TONE: Record<string, "good" | "warn" | "muted" | "accent" | "oxblood"> = {
  en_attente: "warn", valide: "good", signe: "good", termine: "muted", annule: "muted", refuse: "oxblood",
};
// Types de mission — identiques au bot Discord, adaptés au pôle (légal = missions
// Iron Wolf, Confrérie = missions clandestines).
const TYPES_LEGAL = [
  "Escorte de personne", "Escorte de convoi", "Protection rapprochée", "Sécurisation d'un lieu",
  "Enquête / filature", "Négociation / médiation", "Récupération de biens", "Chasse à la prime", "Travail discret", "Autre",
];
const TYPES_CONFRERIE = [
  "Contrebande", "Sabotage", "Vol organisé", "Élimination", "Extorsion / Racket",
  "Espionnage / Filature", "Protection", "Chasseur de primes", "Récupération de dette", "Autre",
];
const typesPour = (pole: string) => (pole === "illegal" ? TYPES_CONFRERIE : TYPES_LEGAL);
// Niveau de risque — Confrérie uniquement (comme sur Discord).
const RISQUES = [
  { key: "discret", label: "🟢 Discret", tone: "var(--good)" },
  { key: "risque", label: "🟠 Risqué", tone: "var(--warn)" },
  { key: "sanglant", label: "🔴 Sanglant", tone: "var(--oxblood)" },
];
const RISQUE_LABEL: Record<string, string> = { discret: "🟢 Discret", risque: "🟠 Risqué", sanglant: "🔴 Sanglant" };

export function ContratsTable({ contrats }: { contrats: ContratDetail[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<ContratDetail | null>(null);
  const [nouveau, setNouveau] = useState(false);
  const [polF, setPolF] = useState(""); // "" = tous | "legal" | "illegal"
  const params = useSearchParams();

  // Deep-link : ?ct=<id> (depuis une notification) ouvre directement le contrat.
  useEffect(() => {
    const id = params.get("ct");
    if (!id) return;
    const found = contrats.find((c) => c.id === id);
    if (found) setSel(found);
  }, [params, contrats]);

  const estIllegal = (c: ContratDetail) => c.pole === "illegal";
  const nIllegal = contrats.filter(estIllegal).length;
  const nLegal = contrats.length - nIllegal;
  const affiches = polF ? contrats.filter((c) => (polF === "illegal" ? estIllegal(c) : !estIllegal(c))) : contrats;
  const chipStyle = (on: boolean, color: string) =>
    on ? { borderColor: `color-mix(in srgb,${color} 55%,var(--border))`, background: `color-mix(in srgb,${color} 16%,transparent)`, color: "var(--ink)" }
       : { borderColor: "var(--border)", color: "var(--muted)" };

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <h3 className="text-[0.8rem] font-semibold uppercase tracking-[0.06em] text-muted">Contrats</h3>
          <span className="font-num text-[0.8rem] text-faint">{contrats.length}</span>
        </div>
        <button onClick={() => setNouveau(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold text-ink transition hover:border-border-2">
          <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Nouveau contrat
        </button>
      </div>

      {nLegal > 0 && nIllegal > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <button onClick={() => setPolF("")} aria-pressed={!polF} className="rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold transition" style={chipStyle(!polF, "var(--accent)")}>Tous <span className="font-num text-faint">{contrats.length}</span></button>
          <button onClick={() => setPolF(polF === "legal" ? "" : "legal")} aria-pressed={polF === "legal"} className="rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold transition" style={chipStyle(polF === "legal", "var(--brass)")}>⚖️ Iron Wolf <span className="font-num text-faint">{nLegal}</span></button>
          <button onClick={() => setPolF(polF === "illegal" ? "" : "illegal")} aria-pressed={polF === "illegal"} className="rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold transition" style={chipStyle(polF === "illegal", "var(--oxblood)")}>🔪 Confrérie <span className="font-num text-faint">{nIllegal}</span></button>
        </div>
      ) : null}

      {contrats.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <FileText className="h-6 w-6 text-faint" strokeWidth={1.6} />
          <p className="max-w-md text-[0.82rem] leading-relaxed text-muted">Aucun contrat pour l&apos;instant. Crée-en un avec « Nouveau contrat ».</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-[0.85rem]">
            <thead>
              <tr className="text-[0.7rem] uppercase tracking-[0.06em] text-faint">
                <th className="border-b border-border px-2.5 py-2 font-semibold">Objet</th>
                <th className="border-b border-border px-2.5 py-2 font-semibold">Commanditaire</th>
                <th className="border-b border-border px-2.5 py-2 font-semibold">Pôle</th>
                <th className="border-b border-border px-2.5 py-2 font-semibold">Rémunération</th>
                <th className="border-b border-border px-2.5 py-2 font-semibold">Statut</th>
              </tr>
            </thead>
            <tbody>
              {affiches.map((c) => (
                <tr key={c.id} onClick={() => setSel(c)} className="cursor-pointer hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]">
                  <td className="border-b border-border px-2.5 py-2.5 font-medium">{c.cible}</td>
                  <td className="border-b border-border px-2.5 py-2.5 text-muted">{c.commanditaire || "—"}</td>
                  <td className="border-b border-border px-2.5 py-2.5"><Badge tone={c.pole === "illegal" ? "oxblood" : "accent"}>{c.pole === "illegal" ? "Confrérie" : "Iron Wolf"}</Badge></td>
                  <td className="border-b border-border px-2.5 py-2.5 font-num text-muted">{c.remuneration || "—"}</td>
                  <td className="border-b border-border px-2.5 py-2.5"><Badge tone={STATUT_TONE[c.statut?.toLowerCase()] ?? "muted"}>{c.statut}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[0.72rem] text-faint">Clique sur une ligne pour modifier le contrat.</p>
        </div>
      )}

      {sel ? <EditModal contrat={sel} onClose={() => setSel(null)} router={router} /> : null}
      {nouveau ? <NouveauModal onClose={() => setNouveau(false)} router={router} /> : null}
    </>
  );
}

function NouveauModal({ onClose, router }: { onClose: () => void; router: Router }) {
  const [pole, setPole] = useState("legal");
  const [categorie, setCategorie] = useState("");
  const [risque, setRisque] = useState("discret");
  const [cible, setCible] = useState("");
  const [commanditaire, setCommanditaire] = useState("");
  const [remuneration, setRemuneration] = useState("");
  const [echeance, setEcheance] = useState("");
  const [details, setDetails] = useState("");
  const [statut, setStatut] = useState("en_attente");
  // Champs détaillés (consolidés dans les consignes du contrat à la création).
  const [lieu, setLieu] = useState("");
  const [delai, setDelai] = useState("");
  const [agents, setAgents] = useState("");
  const [acompte, setAcompte] = useState("");
  const [paiement, setPaiement] = useState("");
  const [clauses, setClauses] = useState("");
  const [confidentiel, setConfidentiel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  // Modale rendue seulement après clic (jamais au SSR) → Math.random/new Date sûrs.
  const [numero] = useState(() => "C-" + Math.floor(100 + Math.random() * 900));
  const [now] = useState(() => new Date());
  const conf = pole === "illegal";
  const types = typesPour(pole);
  const dateStr = now.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

  function changerPole(p: string) {
    setPole(p);
    // Si le type sélectionné n'existe pas dans le nouveau pôle, on le réinitialise.
    if (categorie && !typesPour(p).includes(categorie)) setCategorie("");
  }
  function imprimer() { if (typeof window !== "undefined") window.print(); }
  // Consolide les champs détaillés dans les consignes → rien n'est perdu au contrat.
  function composeDetails(): string {
    const extra: string[] = [];
    if (lieu.trim()) extra.push(`Lieu / zone : ${lieu.trim()}`);
    if (delai.trim()) extra.push(`Durée / délai : ${delai.trim()}`);
    if (agents.trim()) extra.push(`Effectif requis : ${agents.trim()} agent(s)`);
    if (acompte.trim()) extra.push(`Acompte : ${acompte.trim()}`);
    if (paiement.trim()) extra.push(`Modalités de paiement : ${paiement.trim()}`);
    if (clauses.trim()) extra.push(`Conditions particulières : ${clauses.trim()}`);
    if (confidentiel) extra.push("Contrat confidentiel.");
    return [details.trim(), extra.join("\n")].filter(Boolean).join("\n\n");
  }

  async function creer() {
    setErr(null);
    if (cible.trim().length < 2) { setErr("Donne un objet à la mission."); return; }
    setBusy(true);
    const r = await creerContrat({
      cible, commanditaire, remuneration, statut, pole,
      categorie: categorie || undefined,
      risque: conf ? risque : undefined,
      echeance: echeance || undefined,
      details: composeDetails() || undefined,
    });
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Impossible."); return; }
    setOk(true); router.refresh();
  }

  return (
    <Modal titre="📜 Nouveau contrat" onClose={onClose} max={880}>
      <style>{`@media print{body *{visibility:hidden!important}#contrat-vivant-doc,#contrat-vivant-doc *{visibility:visible!important}#contrat-vivant-doc{position:fixed!important;inset:0!important;margin:0!important;border-radius:0!important;box-shadow:none!important;max-width:none!important}}`}</style>
      {ok ? (
        <div className="flex flex-col gap-3">
          <Flash>Contrat créé — il apparaîtra ici dans ~30 s.</Flash>
          <div className="flex justify-end"><button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}>Fermer</button></div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[1fr_minmax(300px,344px)]">
            {/* Formulaire */}
            <div className="flex min-w-0 flex-col gap-3">
              <SousTitre>Les parties</SousTitre>
              <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Pôle</span><Picker options={POLES} value={pole} onChange={changerPole} /></div>
              <Champ label="Commanditaire"><input className={inputCls} value={commanditaire} onChange={(e) => setCommanditaire(e.target.value)} placeholder={conf ? "Vide = anonyme & confidentiel" : "M. Ross"} maxLength={200} /></Champ>

              <SousTitre>La mission</SousTitre>
              <div className="grid gap-3 sm:grid-cols-2">
                <Champ label="Type de mission">
                  <select className={inputCls} value={categorie} onChange={(e) => setCategorie(e.target.value)}>
                    <option value="">— Choisir un type —</option>
                    {types.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Champ>
                <Champ label="Lieu / zone d'opération"><input className={inputCls} value={lieu} onChange={(e) => setLieu(e.target.value)} placeholder="Valentine, route de Saint-Denis…" maxLength={160} /></Champ>
              </div>
              {conf ? <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Niveau de risque</span><Picker options={RISQUES} value={risque} onChange={setRisque} /></div> : null}
              <Champ label="Objet de la mission *"><input className={inputCls} value={cible} onChange={(e) => setCible(e.target.value)} placeholder={conf ? "Ex : récupérer la cargaison volée à Valentine…" : "Escorte d'un convoi de médicaments"} maxLength={300} autoFocus /></Champ>

              <SousTitre>Rémunération &amp; paiement</SousTitre>
              <div className="grid gap-3 sm:grid-cols-2">
                <Champ label="Prime / Rémunération"><input className={inputCls} value={remuneration} onChange={(e) => setRemuneration(e.target.value)} placeholder={conf ? "2000$ + part du butin" : "$1200"} maxLength={120} /></Champ>
                <Champ label="Acompte (optionnel)"><input className={inputCls} value={acompte} onChange={(e) => setAcompte(e.target.value)} placeholder="$300 à la signature" maxLength={120} /></Champ>
              </div>
              <Champ label="Modalités de paiement">
                <select className={inputCls} value={paiement} onChange={(e) => setPaiement(e.target.value)}>
                  <option value="">— Non précisé —</option>
                  {["À la signature", "À la livraison", "Moitié / moitié", "Au résultat", "Échelonné"].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Champ>

              <SousTitre>Délais &amp; moyens</SousTitre>
              <div className="grid gap-3 sm:grid-cols-3">
                <Champ label="Échéance"><input className={inputCls} value={echeance} onChange={(e) => setEcheance(e.target.value)} placeholder="30/08/2026" maxLength={60} /></Champ>
                <Champ label="Durée / délai"><input className={inputCls} value={delai} onChange={(e) => setDelai(e.target.value)} placeholder="48 h, 1 semaine…" maxLength={60} /></Champ>
                <Champ label="Effectif"><input className={inputCls} value={agents} onChange={(e) => setAgents(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="3" maxLength={3} /></Champ>
              </div>

              <SousTitre>Clauses &amp; consignes</SousTitre>
              <Champ label="Consignes / contexte"><textarea className={inputCls + " min-h-[70px] resize-y leading-relaxed"} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Cible, méthode, contacts, infos utiles…" maxLength={2000} /></Champ>
              <Champ label="Conditions particulières (optionnel)"><textarea className={inputCls + " min-h-[54px] resize-y leading-relaxed"} value={clauses} onChange={(e) => setClauses(e.target.value)} placeholder="Aucune perte civile, pas de traces, matériel fourni…" maxLength={800} /></Champ>
              <label className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[0.82rem]">
                <input type="checkbox" checked={confidentiel} onChange={(e) => setConfidentiel(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                <span>Contrat <b>confidentiel</b> (clause de discrétion)</span>
              </label>
              <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Statut</span><Picker options={STATUTS} value={statut} onChange={setStatut} /></div>
            </div>

            {/* Aperçu du contrat vivant (parchemin) */}
            <div className="min-w-0">
              <div className="lg:sticky lg:top-0">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-faint">Aperçu du contrat</span>
                  <button onClick={imprimer} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-[0.72rem] font-semibold hover:border-border-2"><Printer className="h-3.5 w-3.5" /> Imprimer</button>
                </div>
                <div className="max-h-[66vh] overflow-y-auto pr-1">
                  <ContratVivant pole={pole} categorie={categorie} risque={risque} cible={cible} commanditaire={commanditaire} remuneration={remuneration} echeance={echeance} details={details} statut={statut} numero={numero} dateStr={dateStr} lieu={lieu} delai={delai} agents={agents} acompte={acompte} paiement={paiement} clauses={clauses} confidentiel={confidentiel} />
                </div>
              </div>
            </div>
          </div>

          {err ? <p className="mt-3 text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
          <div className="mt-4 flex justify-end gap-2 border-t border-border pt-3">
            <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
            <button onClick={creer} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" strokeWidth={2} />} Créer le contrat
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ── Contrat « 1904 » vivant (parchemin) ─────────────────────────────────────
function BlasonLoupP({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <path d="M50 26 L64 40 L61 56 L68 74 L50 66 L32 74 L39 56 L36 40 Z" fill="none" stroke="#5c4a2f" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="44" cy="47" r="2.2" fill="#5c4a2f" /><circle cx="56" cy="47" r="2.2" fill="#5c4a2f" />
    </svg>
  );
}
function SceauCireP({ size = 52 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ transform: "rotate(-8deg)", filter: "drop-shadow(0 3px 4px rgba(60,20,12,.4))" }}>
      <defs><radialGradient id="ctr-wax" cx="38%" cy="34%" r="72%"><stop offset="0%" stopColor="#c15a48" /><stop offset="55%" stopColor="#9c3527" /><stop offset="100%" stopColor="#6d2018" /></radialGradient></defs>
      <circle cx="50" cy="50" r="42" fill="url(#ctr-wax)" />
      <circle cx="50" cy="50" r="33" fill="none" stroke="#f4d9cf" strokeWidth="1.1" strokeDasharray="2 3" opacity="0.55" />
      <path d="M50 32 L59 40 L57 51 L62 63 L50 58 L38 63 L43 51 L41 40 Z" fill="none" stroke="#f4d9cf" strokeWidth="1.8" strokeLinejoin="round" opacity="0.85" />
    </svg>
  );
}
const RISQUE_PLAIN: Record<string, string> = { discret: "Discret", risque: "Risqué", sanglant: "Sanglant" };
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

// Sous-titre de section du formulaire (repère laiton).
function SousTitre({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1 flex items-center gap-2 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-faint">
      <span className="h-3 w-0.5 rounded-full" style={{ background: "var(--brass)" }} /> {children}
    </div>
  );
}

function ContratVivant({ pole, categorie, risque, cible, commanditaire, remuneration, echeance, details, statut, numero, dateStr, lieu = "", delai = "", agents = "", acompte = "", paiement = "", clauses = "", confidentiel = false }: { pole: string; categorie: string; risque: string; cible: string; commanditaire: string; remuneration: string; echeance: string; details: string; statut: string; numero: string; dateStr: string; lieu?: string; delai?: string; agents?: string; acompte?: string; paiement?: string; clauses?: string; confidentiel?: boolean }) {
  const conf = pole === "illegal";
  const maison = conf ? "La Confrérie" : "Iron Wolf Company";
  const st = STATUTS.find((s) => s.key === statut) || STATUTS[0];
  const preambule = `Entre la ${maison} (ci-après « le Prestataire ») et ${commanditaire.trim() || (conf ? "un Commanditaire anonyme" : "le Commanditaire")} (ci-après « le Commanditaire »), il est convenu et arrêté ce qui suit :`;
  const H = ({ t }: { t: string }) => <div style={{ margin: "12px 0 5px", fontFamily: "'Courier New',monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.13em", color: "#7a5a2a", borderBottom: "1.5px solid #7a5a2a", paddingBottom: 2 }}>{t}</div>;
  const DL = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div style={{ display: "grid", gridTemplateColumns: "44% 56%", gap: 8, padding: "3px 0", borderBottom: "1px dotted #cbb488" }}>
      <span style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8a6f43" }}>{k}</span>
      <span style={{ fontSize: 12.5, color: "#2c2013", fontWeight: 600 }}>{v}</span>
    </div>
  );
  const P = ({ children }: { children: React.ReactNode }) => <div style={{ fontSize: 11.5, lineHeight: 1.5, color: "#3a2c17", whiteSpace: "pre-wrap" }}>{children}</div>;

  // Articles du contrat — masqués si vides, numérotés dynamiquement.
  const arts: { titre: string; body: React.ReactNode }[] = [];
  arts.push({ titre: "OBJET DE LA MISSION", body: (
    <>
      <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, marginBottom: 3 }}>{cible.trim() || <span style={{ color: "#a08a5e", fontWeight: 400, fontStyle: "italic" }}>À préciser…</span>}</div>
      <DL k="Type de mission" v={categorie || "—"} />
      {conf ? <DL k="Niveau de risque" v={RISQUE_PLAIN[risque] || "—"} /> : null}
    </>
  ) });
  arts.push({ titre: "RÉMUNÉRATION & PAIEMENT", body: (
    <>
      <DL k="Rémunération convenue" v={remuneration || "—"} />
      {acompte.trim() ? <DL k="Acompte à la signature" v={acompte} /> : null}
      {paiement.trim() ? <DL k="Modalités de paiement" v={paiement} /> : null}
    </>
  ) });
  if (echeance.trim() || delai.trim()) arts.push({ titre: "DÉLAIS D'EXÉCUTION", body: (
    <>
      {echeance.trim() ? <DL k="Échéance" v={echeance} /> : null}
      {delai.trim() ? <DL k="Durée / délai" v={delai} /> : null}
    </>
  ) });
  if (lieu.trim() || agents.trim()) arts.push({ titre: "LIEU & MOYENS", body: (
    <>
      {lieu.trim() ? <DL k="Lieu / zone" v={lieu} /> : null}
      {agents.trim() ? <DL k="Effectif requis" v={`${agents} agent(s)`} /> : null}
    </>
  ) });
  if (clauses.trim() || details.trim()) arts.push({ titre: "CONDITIONS PARTICULIÈRES", body: <P>{[clauses.trim(), details.trim()].filter(Boolean).join("\n")}</P> });
  if (confidentiel || conf) arts.push({ titre: "CONFIDENTIALITÉ", body: <P>Les parties s&apos;engagent à la plus stricte discrétion sur l&apos;existence, l&apos;objet et l&apos;exécution du présent contrat. Toute divulgation engage la responsabilité de son auteur.</P> });

  return (
    <div id="contrat-vivant-doc" style={{ position: "relative", fontFamily: "Georgia,'Times New Roman',serif", color: "#2c2013", background: "radial-gradient(58% 40% at 12% 8%, rgba(120,88,40,0.13), transparent 60%), radial-gradient(52% 42% at 92% 94%, rgba(90,60,20,0.12), transparent 60%), linear-gradient(#f6ecd3,#efe3c6)", border: "1px solid #b39c6e", borderRadius: 10, padding: "22px 22px 26px", boxShadow: "inset 0 0 0 4px #f8f2e2, inset 0 0 0 5px #c2a86f, 0 10px 30px rgba(40,26,10,.28)" }}>
      <div style={{ position: "absolute", top: 16, right: 14, transform: "rotate(-8deg)", border: `2px solid ${st.tone}`, color: st.tone, padding: "2px 8px", borderRadius: 4, fontFamily: "'Courier New',monospace", fontWeight: 700, fontSize: 10, letterSpacing: "0.12em", opacity: 0.9 }}>{st.label.toUpperCase()}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: "2px solid #2c2013", paddingBottom: 10 }}>
        <BlasonLoupP />
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "0.04em" }}>{maison.toUpperCase()}</div>
          <div style={{ fontFamily: "'Courier New',monospace", fontSize: 9, letterSpacing: "0.2em", color: "#7a5a2a" }}>CONTRAT DE MISSION</div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right", fontFamily: "'Courier New',monospace", fontSize: 9, color: "#7a5a2a" }}>
          <div>N° {numero}</div><div>{dateStr}</div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "9px 0 2px" }} aria-hidden>
        <span style={{ height: 1, flex: 1, background: "linear-gradient(90deg,transparent,#b39c6e)" }} />
        <span style={{ width: 6, height: 6, transform: "rotate(45deg)", background: "#9a761c" }} />
        <span style={{ height: 1, flex: 1, background: "linear-gradient(270deg,transparent,#b39c6e)" }} />
      </div>

      <H t="PRÉAMBULE" />
      <div style={{ fontSize: 11.5, lineHeight: 1.5, textAlign: "justify", color: "#3a2c17" }}>{preambule}</div>

      {arts.map((a, i) => (
        <div key={i}>
          <H t={`${i === 0 ? "ARTICLE PREMIER" : "ARTICLE " + ROMAN[i]} — ${a.titre}`} />
          {a.body}
        </div>
      ))}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 18, paddingTop: 12, borderTop: "1px solid #cbb488" }}>
        <div style={{ fontSize: 10, color: "#5c4a2f", textAlign: "center" }}>
          <div style={{ fontFamily: "'Courier New',monospace", letterSpacing: "0.06em" }}>LE PRESTATAIRE</div>
          <div style={{ fontFamily: "'Segoe Script','Brush Script MT',cursive", fontSize: 17, color: "#3a2c17", marginTop: 6 }}>{maison}</div>
        </div>
        <SceauCireP />
        <div style={{ fontSize: 10, color: "#5c4a2f", textAlign: "center" }}>
          <div style={{ fontFamily: "'Courier New',monospace", letterSpacing: "0.06em" }}>LE COMMANDITAIRE</div>
          <div style={{ fontFamily: "'Segoe Script','Brush Script MT',cursive", fontSize: 17, color: "#3a2c17", marginTop: 6 }}>{commanditaire.trim() || "—"}</div>
        </div>
      </div>
      <div style={{ marginTop: 8, textAlign: "center", fontSize: 9, fontStyle: "italic", color: "#8a6f43" }}>Contrat établi par la {maison}. « La force est dans l&apos;ombre. »</div>
    </div>
  );
}

function EditModal({ contrat, onClose, router }: { contrat: ContratDetail; onClose: () => void; router: Router }) {
  const [cible, setCible] = useState(contrat.cible);
  const [commanditaire, setCommanditaire] = useState(contrat.commanditaire || "");
  const [remuneration, setRemuneration] = useState(contrat.remuneration || "");
  const [statut, setStatut] = useState((contrat.statut || "en_attente").toLowerCase());
  const [pole, setPole] = useState(contrat.pole === "illegal" ? "illegal" : "legal");
  const [categorie, setCategorie] = useState(contrat.categorie || "");
  const [echeance, setEcheance] = useState(contrat.echeance || "");
  const [details, setDetails] = useState(contrat.motif || "");
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [suivi, setSuivi] = useState(contrat.suivi || suiviDeStatut(contrat.statut));
  const [honorer, setHonorer] = useState(false);
  // Pré-remplissage : on prend le PREMIER nombre de la rémunération (et pas la
  // concaténation de tous les chiffres — « 2000$ + 500 » donnait 2000500).
  const [montant, setMontant] = useState((String(contrat.remuneration || "").match(/\d+/) || [""])[0]);
  const dejaHonore = !!contrat.remuVerseAuCoffre;
  // Attribution assistée (indicative) : agents recommandés pour staffer le contrat.
  const [suggBusy, setSuggBusy] = useState(false);
  const [suggList, setSuggList] = useState<Suggestion[] | null>(null);
  // Signature du commanditaire par lien sécurisé (envoi en MP Discord).
  const sig = contrat.signature;
  const [ctrDid, setCtrDid] = useState("");

  async function envoyerSignature() {
    if (!ctrDid.trim()) { setFlash("Renseigne l'ID Discord du commanditaire."); return; }
    setBusy("sign");
    const r = await envoyerContratSignature({ id: contrat.id, clientDiscordId: ctrDid.trim(), commanditaire });
    setBusy(null);
    setFlash(r.ok ? (r.message || "Contrat envoyé au commanditaire — en attente de signature.") : (r.error || "Échec de l'envoi."));
    if (r.ok) router.refresh();
  }

  async function suggerer() {
    setSuggBusy(true);
    const r = await suggererAgents(pole === "illegal" ? "illegal" : "legal", []);
    setSuggBusy(false);
    setSuggList(r.ok ? r.suggestions.slice(0, 4) : []);
  }

  async function push(patch: Record<string, string>, key: string) {
    setBusy(key);
    const r = await majContrat(contrat.id, patch);
    setBusy(null);
    setFlash(r.ok ? "Enregistré — mise à jour dans ~30 s." : (r.error || "Échec."));
  }
  async function changerSuivi(stage: string) {
    if (stage === "Honoré") { setHonorer(true); return; }
    const prev = suivi; setSuivi(stage); setBusy("suivi");
    const r = await majSuiviContrat(contrat.id, stage);
    setBusy(null);
    if (!r.ok) { setSuivi(prev); setFlash(r.error || "Échec."); return; }
    setFlash(`Suivi → ${stage} — mise à jour dans ~30 s.`); router.refresh();
  }
  async function confirmerHonorer() {
    const m = Number(montant);
    if (!m || m <= 0) { setFlash("Indique un montant."); return; }
    setBusy("honorer");
    const r = await honorerContrat(contrat.id, m);
    setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    setSuivi("Honoré"); setHonorer(false);
    setFlash(`Contrat honoré : ${cents(m)}$ versés au coffre + facture créée.`); router.refresh();
  }
  async function supprimer() {
    setBusy("del");
    const r = await supprimerContrat(contrat.id);
    setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    router.refresh(); onClose();
  }
  function imprimer() { if (typeof window !== "undefined") window.print(); }

  return (
    <Modal titre={contrat.cible} onClose={onClose} max={920}>
      <style>{`@media print{body *{visibility:hidden!important}#contrat-vivant-doc,#contrat-vivant-doc *{visibility:visible!important}#contrat-vivant-doc{position:fixed!important;inset:0!important;margin:0!important;border-radius:0!important;box-shadow:none!important;max-width:none!important}}`}</style>
      {flash ? <div className="mb-3"><Flash>{flash}</Flash></div> : null}
      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(300px,340px)]">
        <div className="min-w-0">
      <ContratDetailBloc c={contrat} />

      {/* Suivi / pipeline */}
      <div className="mb-3 flex flex-col gap-2 border-t border-border pt-3">
        <span className="text-[0.72rem] uppercase tracking-[0.06em] text-faint">Suivi {busy === "suivi" ? "· …" : ""}</span>
        <div className="flex flex-wrap gap-1.5">
          {SUIVI.map((s) => {
            const on = suivi === s;
            const tone = s === "Honoré" ? "var(--good)" : s === "Abandonné" ? "var(--muted)" : s === "Validé" ? "var(--good)" : s === "En cours" ? "var(--steel)" : "var(--warn)";
            return (
              <button key={s} onClick={() => changerSuivi(s)} disabled={dejaHonore && s !== "Honoré"} className="rounded-lg border px-2.5 py-1.5 text-[0.76rem] font-semibold transition disabled:opacity-40"
                style={{ color: on ? "#000" : tone, background: on ? tone : "transparent", borderColor: "color-mix(in srgb," + tone + " 45%,var(--border))" }}>
                {s}
              </button>
            );
          })}
        </div>
        {honorer && !dejaHonore ? (
          <div className="flex items-end gap-2 rounded-[10px] border border-border bg-surface-2 px-3 py-2.5">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[0.7rem] text-faint">Montant à verser au coffre ($)</span>
              <input className={inputCls} type="number" min={1} value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="1200" autoFocus />
            </label>
            <button onClick={confirmerHonorer} disabled={busy === "honorer"} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--good)" }}>
              {busy === "honorer" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />} Encaisser
            </button>
            <button onClick={() => setHonorer(false)} className="rounded-lg border border-border bg-surface px-2.5 py-2 text-[0.78rem] text-muted hover:text-ink">Annuler</button>
          </div>
        ) : null}
        {dejaHonore ? <p className="flex items-center gap-1.5 text-[0.78rem]" style={{ color: "var(--good)" }}><Check className="h-3.5 w-3.5" /> Contrat honoré — {cents(contrat.remuVerseAuCoffre || 0)}$ au coffre.</p> : null}
      </div>

      {/* Signature du commanditaire (lien sécurisé en MP Discord) */}
      <div className="mb-3 flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.72rem] uppercase tracking-[0.06em] text-faint">Signature du commanditaire</span>
          {sig?.statut === "signe" ? <Badge tone="good">Signé</Badge> : sig?.statut === "refuse" ? <Badge tone="oxblood">Refusé</Badge> : sig?.statut === "envoye" ? <Badge tone="warn">Envoyé</Badge> : null}
        </div>
        {sig?.statut === "signe" ? (
          <p className="flex items-center gap-1.5 text-[0.8rem]" style={{ color: "var(--good)" }}><Check className="h-3.5 w-3.5" /> Signé par {sig.commanditaire || "le commanditaire"}.</p>
        ) : sig?.statut === "refuse" ? (
          <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>Refusé par le commanditaire. Tu peux le renvoyer.</p>
        ) : sig?.statut === "envoye" ? (
          <p className="text-[0.8rem] text-muted">Contrat envoyé en MP — en attente de signature (lien sécurisé).</p>
        ) : (
          <p className="text-[0.78rem] text-faint">Envoie le contrat au commanditaire en message privé Discord : il le lira et le signera par lien sécurisé, et le statut passera à « Signé » automatiquement.</p>
        )}
        {(!sig || sig.statut === "refuse") ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[160px] flex-1 flex-col gap-1">
              <span className="text-[0.7rem] text-faint">ID Discord du commanditaire</span>
              <input className={inputCls} value={ctrDid} onChange={(e) => setCtrDid(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="123456789012345678" />
            </label>
            <button onClick={envoyerSignature} disabled={busy === "sign"} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>
              {busy === "sign" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Envoyer pour signature
            </button>
          </div>
        ) : null}
      </div>

      {/* Attribution assistée (indicative) */}
      <div className="mb-3 flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.72rem] uppercase tracking-[0.06em] text-faint">Agents recommandés</span>
          <button onClick={suggerer} disabled={suggBusy} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[0.74rem] font-semibold transition disabled:opacity-50" style={{ color: "var(--accent)", borderColor: "color-mix(in srgb,var(--accent) 45%,var(--border))" }}>
            {suggBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Suggérer
          </button>
        </div>
        {suggList ? (
          suggList.length === 0 ? (
            <p className="text-[0.76rem] italic text-faint">Aucun agent disponible à recommander.</p>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                {suggList.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-2.5 rounded-[9px] border border-border bg-surface-2 px-2.5 py-1.5">
                    {i === 0 ? <Badge tone="accent">Top</Badge> : <span className="w-1" />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[0.84rem] font-semibold">{s.nom}{s.grade ? <span className="text-[0.7rem] text-faint"> · {s.grade}</span> : null}</div>
                      <div className="truncate text-[0.7rem] text-muted">{s.raisons.join(" · ")}</div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[0.7rem] italic text-faint">Recommandation indicative (disponibilité · charge · pôle) — assigne-les via l&apos;opération liée à ce contrat.</p>
            </>
          )
        ) : null}
      </div>

      <div className="mb-2 border-t border-border pt-3 text-[0.72rem] uppercase tracking-[0.06em] text-faint">Modifier</div>
      <div className="flex flex-col gap-3">
        <Champ label="Type de mission">
          <select className={inputCls} value={categorie} onChange={(e) => setCategorie(e.target.value)}>
            <option value="">— Non précisé —</option>
            {(typesPour(pole).includes(categorie) || !categorie ? typesPour(pole) : [categorie, ...typesPour(pole)]).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Champ>
        <Champ label="Objet"><input className={inputCls} value={cible} onChange={(e) => setCible(e.target.value)} maxLength={300} /></Champ>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Commanditaire"><input className={inputCls} value={commanditaire} onChange={(e) => setCommanditaire(e.target.value)} maxLength={200} /></Champ>
          <Champ label="Rémunération"><input className={inputCls} value={remuneration} onChange={(e) => setRemuneration(e.target.value)} maxLength={120} /></Champ>
        </div>
        <Champ label="Échéance"><input className={inputCls} value={echeance} onChange={(e) => setEcheance(e.target.value)} placeholder="30/08/2026" maxLength={60} /></Champ>
        <Champ label="Consignes / détails"><textarea className={inputCls + " min-h-[70px] resize-y leading-relaxed"} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} /></Champ>
        <div className="flex justify-end">
          <button onClick={() => push({ cible, commanditaire, remuneration, categorie, echeance, details }, "save")} disabled={busy === "save"} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-[0.76rem] font-semibold hover:border-border-2 disabled:opacity-60">
            {busy === "save" ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Enregistrer
          </button>
        </div>
        <div className="flex flex-col gap-1 border-t border-border pt-3">
          <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Pôle</span>
          <Picker options={POLES} value={pole} onChange={(v) => { setPole(v); push({ pole: v }, "pole"); }} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Statut</span>
          <Picker options={STATUTS} value={statut} onChange={(v) => { setStatut(v); push({ statut: v }, "statut"); }} />
        </div>
        <div className="mt-1 flex items-center justify-between border-t border-border pt-3">
          {confirmDel ? (
            <div className="flex items-center gap-2 text-[0.78rem]">
              <span className="text-muted">Supprimer ?</span>
              <button onClick={supprimer} disabled={busy === "del"} className="rounded-lg px-2.5 py-1 text-[0.76rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--oxblood)" }}>{busy === "del" ? "…" : "Oui"}</button>
              <button onClick={() => setConfirmDel(false)} className="text-[0.76rem] text-muted hover:text-ink">Annuler</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDel(true)} className="inline-flex items-center gap-1.5 text-[0.76rem] text-faint hover:text-ink"><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
          )}
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}>Fermer</button>
        </div>
      </div>
        </div>
        <div className="min-w-0">
          <div className="lg:sticky lg:top-0">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-faint">Aperçu du contrat</span>
              <button onClick={imprimer} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-[0.72rem] font-semibold hover:border-border-2"><Printer className="h-3.5 w-3.5" /> Imprimer</button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto pr-1">
              <ContratVivant pole={pole} categorie={categorie} risque={contrat.risque || "discret"} cible={cible} commanditaire={commanditaire} remuneration={remuneration} echeance={echeance} details={details} statut={statut} numero={numeroContrat(contrat.id)} dateStr={dateFR(contrat.createdAt) || "—"} />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
