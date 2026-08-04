"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ScrollText, Plus, Check, Pencil, Trash2, Search, ExternalLink, Printer, Loader2 } from "lucide-react";
import { VideRegistre } from "@/components/dispensaire-ui";
import { RAPPORT_CATEGORIES, estCanva, normaliserLien, type RapportsData, type Rapport } from "@/lib/dispensaire-docs-const";
import { Modal, Flash, Champ, inputCls } from "@/components/edit-ui";
import { ChampPieceJointe, PieceJointeVignette } from "@/components/piece-jointe";
import { creerRapport, majRapport, supprimerRapport, chargerMedecins } from "@/app/dispensaire/rapports/actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const dateFR = (s: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "long", year: "numeric" }).format(new Date(s)); } catch { return "—"; } };
const escH = (t: unknown) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const CROIX_PATH_R = "M10 2h4a1 1 0 0 1 1 1v6h6a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-6v6a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h6V3a1 1 0 0 1 1-1Z";

// Génère le rapport médical DIRECTEMENT sur le site (fini la dépendance Canva) :
// une fenêtre imprimable → « Enregistrer en PDF » / capture pour Discord. Mise en
// page « pièce officielle » : croix en tête, double filet, signature du praticien.
function imprimerRapport(r: Rapport) {
  const w = window.open("", "_blank", "width=840,height=1040");
  if (!w) return;
  const corps = escH(r.note || "").replace(/\n/g, "<br>");
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Rapport médical — ${escH(r.titre)}</title>
  <style>
    @page{margin:2cm}
    *{box-sizing:border-box}
    body{font-family:Georgia,'Times New Roman',serif;color:#1b140c;background:#e9ddc2;margin:0;padding:40px}
    .cadre{position:relative;border:2px solid #5c4a2f;box-shadow:inset 0 0 0 3px #f8f2e2,inset 0 0 0 4px #b7a074;padding:40px 44px 52px;max-width:720px;margin:auto;background:#f8f2e2;background-image:repeating-linear-gradient(to bottom,transparent 0 28px,rgba(56,42,22,.045) 28px 29px)}
    .ref{position:absolute;top:16px;right:20px;font-size:11px;letter-spacing:.08em;color:#8a7550}
    .emblem{display:flex;justify-content:center;color:#9c7a1a;margin-bottom:4px}
    .tampon{text-align:center;letter-spacing:.14em;text-transform:uppercase;font-size:11px;color:#6b5535}
    h1{font-size:22px;text-align:center;margin:.35em 0;letter-spacing:.04em}
    .sub{text-align:center;font-style:italic;color:#6b5535;font-size:13px;margin-bottom:18px}
    .cat{text-align:center;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;font-size:13px;color:#6b5535}
    .titre{text-align:center;font-size:17px;font-weight:bold;border-top:1px solid #b7a074;border-bottom:1px solid #b7a074;padding:8px 0;margin:8px 0 18px}
    .meta{font-size:13px;color:#4a3b26;margin-bottom:14px}
    .meta b{color:#1b140c}
    .corps{font-size:15px;line-height:1.9;white-space:normal;min-height:160px;text-align:justify}
    .footer{margin-top:34px;display:flex;align-items:flex-end;justify-content:space-between;gap:20px}
    .sign{text-align:right;font-size:14px}
    .sign .l{color:#6b5535;font-size:12px}
    .sign .n{border-top:1px solid #7a6540;padding-top:4px;min-width:190px;display:inline-block;font-weight:bold}
    .sign .st{font-size:11px;font-style:italic;color:#6b5535;margin-top:3px}
    .motto{margin-top:26px;border-top:1px solid #b7a074;padding-top:8px;text-align:center;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#8a7550}
  </style></head><body><div class="cadre">
    <div class="ref">Réf. RAP-${escH((r.createdAt || "1904").slice(0, 4))}-${escH(r.id.replace(/[^a-z0-9]/gi, "").slice(-4).toUpperCase().padStart(4, "0"))}</div>
    <div class="emblem"><svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${CROIX_PATH_R}"/></svg></div>
    <div class="tampon">Comté de Lemoyne · Saint-Denis</div>
    <h1>Dispensaire de Saint-Denis</h1>
    <div class="sub">Registre médical · Année 1904</div>
    ${r.categorie ? `<div class="cat">${escH(r.categorie)}</div>` : ""}
    <div class="titre">${escH(r.titre)}</div>
    <div class="meta">${r.patient ? `Patient : <b>${escH(r.patient)}</b><br>` : ""}Fait à Saint-Denis, le <b>${escH(dateFR(r.createdAt))}</b>.</div>
    <div class="corps">${corps || "……"}</div>
    ${r.pieceJointe ? `<figure style="margin:18px 0 0;text-align:center"><img src="${escH(r.pieceJointe).replace(/"/g, "&quot;")}" alt="Pièce jointe" style="max-width:100%;max-height:420px;border:1px solid #b7a074" onerror="this.parentNode.style.display='none'"><figcaption style="font-size:11px;font-style:italic;color:#6b5535;margin-top:4px">Pièce jointe — référence visuelle</figcaption></figure>` : ""}
    <div class="footer">
      <div></div>
      <div class="sign"><div class="l">Le praticien</div><div class="n">${escH(r.auteur || "……………")}</div><div class="st">Dispensaire de Saint-Denis</div></div>
    </div>
    <div class="motto">Ars Medicina · Humanitas · Scientia — Primum non nocere</div>
  </div><script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
}

export function DispensaireRapports({ data, medecins = [] }: { data: RapportsData; medecins?: { nom: string; grade: string | null }[] }) {
  const router = useRouter();
  const [rapports, setRapports] = useState<Rapport[]>(data.rapports);
  // Re-synchronise avec la base après chaque enregistrement (plus de valeur fantôme).
  useEffect(() => { setRapports(data.rapports); }, [data]);
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [form, setForm] = useState<Rapport | "new" | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");

  const cats = useMemo(() => [...new Set(rapports.map((r) => (r.categorie || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [rapports]);
  const query = norm(q);
  const liste = rapports.filter((r) => (!cat || r.categorie === cat) && (!query || norm([r.titre, r.patient, r.auteur, r.categorie, r.note].filter(Boolean).join(" ")).includes(query)));

  async function enregistrer(vals: Record<string, string>, editing: Rapport | null) {
    const clean = { ...vals, lien: vals.lien ? normaliserLien(vals.lien) : "" };
    if (editing) {
      setRapports((p) => p.map((r) => (r.id === editing.id ? { ...r, ...clean } as Rapport : r))); setForm(null);
      const res = await majRapport(editing.id, clean);
      if (!res.ok) setFlash({ t: "bad", m: res.error || "Impossible." }); else router.refresh();
    } else {
      const tmp: Rapport = { id: "tmp-" + Math.random().toString(36).slice(2, 8), titre: vals.titre, categorie: vals.categorie || null, patient: vals.patient || null, lien: clean.lien || null, pieceJointe: vals.pieceJointe || null, auteur: vals.auteur || null, note: vals.note || null, par: null, createdAt: new Date().toISOString() };
      setRapports((p) => [tmp, ...p]); setForm(null);
      const res = await creerRapport(clean);
      if (!res.ok) { setRapports((p) => p.filter((r) => r.id !== tmp.id)); setFlash({ t: "bad", m: res.error || "Impossible." }); }
      else { setRapports((p) => p.map((r) => (r.id === tmp.id ? { ...r, id: res.id || tmp.id } : r))); setFlash({ t: "ok", m: "Rapport ajouté." }); router.refresh(); }
    }
  }
  async function supprimer(id: string) { setRapports((p) => p.filter((r) => r.id !== id)); setDelId(null); const res = await supprimerRapport(id); if (!res.ok) setFlash({ t: "bad", m: res.error || "Impossible." }); else router.refresh(); }

  return (
    <div className="flex flex-col gap-4">
      {!data.pret ? <Flash tone="bad">Lance <b>web/prisma/sql/dispensaire-documents.sql</b> dans Supabase, puis recharge.</Flash> : null}
      {flash ? <Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><h3 className="flex items-center gap-2 text-[0.95rem] font-semibold"><ScrollText className="h-4 w-4 text-accent" /> Rapports médicaux</h3><span className="font-num text-[0.8rem] text-faint">{rapports.length}</span></div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" /><input className={inputCls + " w-44 pl-8"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" /></div>
          {cats.length ? <select className={inputCls + " max-w-[160px]"} value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Toutes catégories</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select> : null}
          <button onClick={() => setForm("new")} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Plus className="h-3.5 w-3.5" /> Ajouter</button>
        </div>
      </div>

      {liste.length === 0 ? (
        rapports.length
          ? <p className="px-1 py-10 text-center text-[0.85rem] italic text-faint">Aucun rapport ne correspond à ta recherche.</p>
          : <VideRegistre icon={ScrollText} titre="Aucun rapport médical" sous="Rédige un premier compte rendu — il est généré et imprimable directement ici (PDF, partageable sur Discord). Un lien externe reste possible, mais facultatif." />
      ) : (
        <div className="grid gap-2 lg:grid-cols-2">
          {liste.map((r) => (
            <div key={r.id} className="group rounded-[12px] border border-border bg-surface-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5"><span className="text-[0.9rem] font-semibold">{r.titre}</span>{r.categorie ? <span className="rounded-full border border-border px-1.5 py-0.5 text-[0.62rem] font-semibold text-muted">{r.categorie}</span> : null}</div>
                  <div className="mt-0.5 text-[0.72rem] text-faint">{[r.patient, r.auteur].filter(Boolean).join(" · ") || "—"} · {dateFR(r.createdAt)}</div>
                  {r.note ? <div className="mt-1 line-clamp-2 text-[0.74rem] text-muted">{r.note}</div> : null}
                </div>
                {r.pieceJointe ? <div className="shrink-0"><PieceJointeVignette url={r.pieceJointe} /></div> : null}
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => imprimerRapport(r)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-ink" aria-label="Générer / Imprimer le rapport" title="Générer / Imprimer (PDF)"><Printer className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setForm(r)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-ink" aria-label="Modifier"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setDelId(r.id)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint opacity-0 transition hover:text-oxblood group-hover:opacity-100" aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              {r.lien ? <a href={r.lien} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.74rem] font-semibold transition hover:border-border-2" style={{ borderColor: estCanva(r.lien) ? "color-mix(in srgb,var(--accent) 45%,var(--border))" : "var(--border)", color: "var(--accent)" }}><ExternalLink className="h-3.5 w-3.5" /> {estCanva(r.lien) ? "Ouvrir sur Canva" : "Ouvrir le lien"}</a> : <span className="mt-2 inline-block text-[0.7rem] italic text-faint">Aucun lien</span>}
            </div>
          ))}
        </div>
      )}

      {form ? <RapportForm initial={form === "new" ? null : form} cats={cats} medecins={medecins} onClose={() => setForm(null)} onSave={(v) => enregistrer(v, form === "new" ? null : form)} /> : null}
      {delId ? <ConfirmDelete nom={rapports.find((r) => r.id === delId)?.titre || ""} onCancel={() => setDelId(null)} onConfirm={() => supprimer(delId)} /> : null}
    </div>
  );
}

function RapportForm({ initial, cats, medecins, onClose, onSave }: { initial: Rapport | null; cats: string[]; medecins: { nom: string; grade: string | null }[]; onClose: () => void; onSave: (v: Record<string, string>) => void }) {
  const [v, setV] = useState<Record<string, string>>(() => ({ titre: initial?.titre || "", categorie: initial?.categorie || "", patient: initial?.patient || "", lien: initial?.lien || "", pieceJointe: initial?.pieceJointe || "", auteur: initial?.auteur || "", note: initial?.note || "" }));
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));

  // Liste des médecins : robuste face aux ratés réseau. On part de ce que le
  // serveur a fourni, PUIS on rafraîchit à l'ouverture (retries côté serveur) →
  // le menu se remplit tout seul dès que les données arrivent, sans recharger.
  const [meds, setMeds] = useState(medecins);
  const [etatMed, setEtatMed] = useState<"load" | "ok" | "err">(medecins.length ? "ok" : "load");
  async function chargerListe() {
    if (!meds.length) setEtatMed("load");
    try {
      const r = await chargerMedecins();
      if (r.ok) { setMeds(r.medecins); setEtatMed("ok"); }
      else if (!meds.length) setEtatMed("err");
    } catch { if (!meds.length) setEtatMed("err"); }
  }
  useEffect(() => { chargerListe(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const options = [...new Set([...RAPPORT_CATEGORIES, ...cats])];
  function go() { if (v.titre.trim().length < 1) { setErr("Le nom est obligatoire."); return; } onSave(v); }
  return (
    <Modal titre={initial ? "✏️ Modifier le rapport" : "➕ Nouveau rapport"} onClose={onClose} max={560}>
      <div className="flex flex-col gap-3">
        <Champ label="Nom *"><input className={inputCls} value={v.titre} onChange={set("titre")} placeholder="Rapport d'autopsie — …" autoFocus /></Champ>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Catégorie"><input className={inputCls} value={v.categorie} onChange={set("categorie")} placeholder="Consultation, Chirurgie…" list="rap-cats" /><datalist id="rap-cats">{options.map((c) => <option key={c} value={c} />)}</datalist></Champ>
          <Champ label="Patient"><input className={inputCls} value={v.patient} onChange={set("patient")} placeholder="Optionnel" /></Champ>
        </div>
        <Champ label="Médecin (praticien)">
          <select className={inputCls} value={v.auteur} disabled={etatMed === "load" && meds.length === 0} onChange={(e) => setV((p) => ({ ...p, auteur: e.target.value }))}>
            {etatMed === "load" && meds.length === 0 ? (
              <option value="">Chargement des médecins…</option>
            ) : (
              <>
                <option value="">— Choisir un médecin —</option>
                {meds.map((m) => <option key={m.nom} value={m.nom}>{m.nom}{m.grade ? ` — ${m.grade}` : ""}</option>)}
                {v.auteur && !meds.some((m) => m.nom === v.auteur) ? <option value={v.auteur}>{v.auteur}</option> : null}
              </>
            )}
          </select>
          {etatMed === "load" && meds.length === 0 ? (
            <span className="mt-1 flex items-center gap-1.5 text-[0.68rem] italic text-faint"><Loader2 className="h-3 w-3 animate-spin" /> Chargement des médecins…</span>
          ) : etatMed === "err" && meds.length === 0 ? (
            <span className="mt-1 flex flex-wrap items-center gap-2 text-[0.68rem] italic" style={{ color: "var(--oxblood)" }}>Impossible de charger la liste des médecins. Réessaie dans quelques instants.<button type="button" onClick={chargerListe} className="not-italic font-semibold text-accent underline">Réessayer</button></span>
          ) : etatMed === "ok" && meds.length === 0 ? (
            <span className="mt-1 text-[0.68rem] italic text-faint">Aucun médecin disponible — ajoute-les dans RH (Effectifs).</span>
          ) : null}
        </Champ>
        <Champ label="Contenu du rapport"><textarea className={inputCls} rows={7} value={v.note} onChange={set("note")} placeholder="Rédige le compte rendu — il sera mis en page et imprimable directement (PDF)." /></Champ>
        <Champ label="Lien externe (facultatif)"><input className={inputCls} value={v.lien} onChange={set("lien")} placeholder="https://… (Canva ou autre — optionnel)" /></Champ>
        <ChampPieceJointe value={v.pieceJointe} onChange={(url) => setV((p) => ({ ...p, pieceJointe: url }))} />
        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
        <div className="mt-1 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={go} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Check className="h-3.5 w-3.5" /> Enregistrer</button>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmDelete({ nom, onCancel, onConfirm }: { nom: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal titre="Supprimer le rapport ?" onClose={onCancel} max={400}>
      <div className="flex flex-col gap-3">
        <p className="text-[0.85rem] text-muted">Supprimer <b className="text-ink">{nom}</b> ? Le lien Canva n&apos;est pas supprimé, seulement la fiche.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={onConfirm} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-white" style={{ background: "var(--oxblood)" }}><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
        </div>
      </div>
    </Modal>
  );
}
