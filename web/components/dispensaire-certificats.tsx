"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Stethoscope, Plus, Check, Trash2, Search, Eye, Printer, Copy } from "lucide-react";
import { VideRegistre } from "@/components/dispensaire-ui";
import { CERT_TYPES, certType, modeleCertificat, type CertData, type Certificat } from "@/lib/dispensaire-docs-const";
import { Modal, Flash, Champ, Picker, inputCls } from "@/components/edit-ui";
import { creerCertificat, supprimerCertificat } from "@/app/dispensaire/certificats/actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const dateFR = (s: string | null) => { if (!s) return "—"; try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "long", year: "numeric" }).format(new Date(s)); } catch { return "—"; } };
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Ouvre une fenêtre imprimable (→ « Enregistrer en PDF » du navigateur).
function imprimer(c: Certificat) {
  const w = window.open("", "_blank", "width=820,height=1000");
  if (!w) return;
  const corps = esc(c.contenu || "").replace(/\n/g, "<br>");
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Certificat — ${esc(c.patient)}</title>
  <style>
    @page{margin:2.5cm}
    body{font-family:Georgia,'Times New Roman',serif;color:#1b140c;background:#f4ecd8;margin:0;padding:48px}
    .cadre{border:2px solid #5c4a2f;padding:36px 40px;max-width:720px;margin:auto;background:#f8f2e2}
    .tampon{text-align:center;letter-spacing:.12em;text-transform:uppercase;font-size:12px;color:#6b5535}
    h1{font-size:22px;text-align:center;margin:.4em 0;letter-spacing:.04em}
    .sub{text-align:center;font-style:italic;color:#6b5535;font-size:13px;margin-bottom:26px}
    .type{text-align:center;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;border-top:1px solid #b7a074;border-bottom:1px solid #b7a074;padding:8px 0;margin:0 0 22px}
    .corps{font-size:15px;line-height:1.9;white-space:normal;min-height:120px}
    .meta{margin-top:14px;font-size:13px;color:#4a3b26}
    .sign{margin-top:48px;text-align:right;font-size:14px}
    .sign .l{color:#6b5535;font-size:12px}
  </style></head><body><div class="cadre">
    <div class="tampon">Comté de Lemoyne · Saint-Denis</div>
    <h1>Dispensaire de Saint-Denis</h1>
    <div class="sub">Registre administratif · Année 1904</div>
    <div class="type">${esc(certType(c.type).label)}</div>
    <div class="corps">${corps || "……"}</div>
    <div class="meta">Fait à Saint-Denis, le ${esc(dateFR(c.dateActe || c.createdAt))}.</div>
    <div class="sign"><div class="l">Le praticien</div><div>${esc(c.medecin || "……………")}</div></div>
  </div><script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
}

export function DispensaireCertificats({ data }: { data: CertData }) {
  const router = useRouter();
  const [certs, setCerts] = useState<Certificat[]>(data.certificats);
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [form, setForm] = useState(false);
  const [voir, setVoir] = useState<Certificat | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const query = norm(q);
  const liste = certs.filter((c) => !query || norm([c.patient, c.medecin, certType(c.type).label, c.contenu].filter(Boolean).join(" ")).includes(query));

  async function enregistrer(vals: Record<string, string>) {
    const tmp: Certificat = { id: "tmp-" + Math.random().toString(36).slice(2, 8), patient: vals.patient, type: vals.type || "medical", medecin: vals.medecin || null, dateActe: vals.dateActe || null, dureeRepos: Number(vals.dureeRepos) || 0, contenu: vals.contenu || null, note: null, par: null, createdAt: new Date().toISOString() };
    setCerts((p) => [tmp, ...p]); setForm(false);
    const r = await creerCertificat({ ...vals, dureeRepos: Number(vals.dureeRepos) || 0 });
    if (!r.ok) { setCerts((p) => p.filter((c) => c.id !== tmp.id)); setFlash({ t: "bad", m: r.error || "Impossible." }); }
    else { setCerts((p) => p.map((c) => (c.id === tmp.id ? { ...c, id: r.id || tmp.id } : c))); setFlash({ t: "ok", m: "Certificat enregistré." }); router.refresh(); }
  }
  async function supprimer(id: string) { setCerts((p) => p.filter((c) => c.id !== id)); setDelId(null); const r = await supprimerCertificat(id); if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh(); }
  async function copier(c: Certificat) { try { await navigator.clipboard.writeText(c.contenu || ""); setFlash({ t: "ok", m: "Texte copié." }); } catch { setFlash({ t: "bad", m: "Copie impossible." }); } }

  return (
    <div className="flex flex-col gap-4">
      {!data.pret ? <Flash tone="bad">Lance <b>web/prisma/sql/dispensaire-documents.sql</b> dans Supabase, puis recharge.</Flash> : null}
      {flash ? <Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><h3 className="flex items-center gap-2 text-[0.95rem] font-semibold"><Stethoscope className="h-4 w-4 text-accent" /> Certificats médicaux</h3><span className="font-num text-[0.8rem] text-faint">{certs.length}</span></div>
        <div className="flex items-center gap-2">
          <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" /><input className={inputCls + " w-48 pl-8"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" /></div>
          <button onClick={() => setForm(true)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Plus className="h-3.5 w-3.5" /> Nouveau</button>
        </div>
      </div>

      {liste.length === 0 ? (
        certs.length
          ? <p className="px-1 py-10 text-center text-[0.85rem] italic text-faint">Aucun certificat ne correspond à ta recherche.</p>
          : <VideRegistre icon={Stethoscope} titre="Aucun certificat établi" sous="Rédige un premier certificat médical — il pourra ensuite être scellé et imprimé." />
      ) : (
        <div className="grid gap-2 lg:grid-cols-2">
          {liste.map((c) => {
            const t = certType(c.type);
            return (
              <div key={c.id} className="group flex items-start justify-between gap-2 rounded-[12px] border border-border bg-surface-2 p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5"><span className="text-[0.9rem] font-semibold">{c.patient}</span><span className="rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold uppercase" style={{ color: t.tone, background: `color-mix(in srgb,${t.tone} 14%,transparent)` }}>{t.label}</span></div>
                  <div className="mt-0.5 text-[0.72rem] text-faint">{dateFR(c.dateActe || c.createdAt)}{c.medecin ? ` · ${c.medecin}` : ""}</div>
                  {c.contenu ? <div className="mt-1 line-clamp-2 text-[0.74rem] text-muted">{c.contenu}</div> : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => setVoir(c)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-ink" aria-label="Voir"><Eye className="h-3.5 w-3.5" /></button>
                  <button onClick={() => imprimer(c)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-ink" aria-label="Imprimer / PDF"><Printer className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setDelId(c.id)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint opacity-0 transition hover:text-oxblood group-hover:opacity-100" aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {form ? <CertForm onClose={() => setForm(false)} onSave={enregistrer} /> : null}
      {voir ? <VoirModal c={voir} onClose={() => setVoir(null)} onPrint={() => imprimer(voir)} onCopy={() => copier(voir)} /> : null}
      {delId ? <ConfirmDelete nom={certs.find((c) => c.id === delId)?.patient || ""} onCancel={() => setDelId(null)} onConfirm={() => supprimer(delId)} /> : null}
    </div>
  );
}

function CertForm({ onClose, onSave }: { onClose: () => void; onSave: (v: Record<string, string>) => void }) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [v, setV] = useState<Record<string, string>>({ patient: "", medecin: "", type: "medical", dateActe: today, dureeRepos: "0", contenu: "" });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  const genererModele = (type = v.type) => setV((p) => ({ ...p, type, contenu: modeleCertificat(type, { patient: p.patient, medecin: p.medecin, dureeRepos: Number(p.dureeRepos) || 0 }) }));
  function go() { if (v.patient.trim().length < 1) { setErr("Le patient est obligatoire."); return; } onSave(v); }
  return (
    <Modal titre="➕ Nouveau certificat" onClose={onClose} max={640}>
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Patient *"><input className={inputCls} value={v.patient} onChange={set("patient")} placeholder="Prénom Nom" autoFocus /></Champ>
          <Champ label="Praticien"><input className={inputCls} value={v.medecin} onChange={set("medecin")} placeholder="Dr. …" /></Champ>
        </div>
        <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Type de certificat</span><Picker options={CERT_TYPES} value={v.type} onChange={(x) => genererModele(x)} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Date de l'acte"><input className={inputCls} type="date" value={v.dateActe} onChange={set("dateActe")} /></Champ>
          {v.type === "arret" ? <Champ label="Jours de repos"><input className={inputCls} value={v.dureeRepos} onChange={(e) => setV((p) => ({ ...p, dureeRepos: e.target.value.replace(/[^0-9]/g, "") }))} inputMode="numeric" /></Champ> : <div />}
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Contenu</span><button onClick={() => genererModele()} className="text-[0.7rem] font-semibold text-accent hover:underline">↻ Générer le modèle</button></div>
          <textarea className={inputCls} rows={7} value={v.contenu} onChange={set("contenu")} placeholder="Choisis un type puis « Générer le modèle », ou rédige librement." />
        </div>
        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
        <div className="mt-1 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={go} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Check className="h-3.5 w-3.5" /> Enregistrer</button>
        </div>
      </div>
    </Modal>
  );
}

function VoirModal({ c, onClose, onPrint, onCopy }: { c: Certificat; onClose: () => void; onPrint: () => void; onCopy: () => void }) {
  const t = certType(c.type);
  return (
    <Modal titre={`Certificat · ${c.patient}`} onClose={onClose} max={640}>
      <div className="flex flex-col gap-3">
        <div className="rounded-[12px] border p-5" style={{ borderColor: "color-mix(in srgb,var(--accent) 30%,var(--border))", background: "color-mix(in srgb,#e8dcc0 12%,var(--surface-2))" }}>
          <div className="text-center text-[0.66rem] uppercase tracking-[0.12em] text-faint">Comté de Lemoyne · Saint-Denis</div>
          <div className="text-center font-display text-[1.2rem]">Dispensaire de Saint-Denis</div>
          <div className="mb-3 mt-1 border-y border-border py-1.5 text-center text-[0.72rem] font-bold uppercase tracking-[0.08em]" style={{ color: t.tone }}>{t.label}</div>
          <p className="whitespace-pre-wrap text-[0.86rem] leading-relaxed">{c.contenu || "……"}</p>
          <div className="mt-4 text-[0.76rem] text-faint">Fait à Saint-Denis, le {dateFR(c.dateActe || c.createdAt)}.</div>
          <div className="mt-3 text-right text-[0.82rem]"><div className="text-[0.68rem] text-faint">Le praticien</div>{c.medecin || "……"}</div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCopy} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[0.8rem] font-semibold hover:border-border-2"><Copy className="h-3.5 w-3.5" /> Copier</button>
          <button onClick={onPrint} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Printer className="h-3.5 w-3.5" /> Imprimer / PDF</button>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmDelete({ nom, onCancel, onConfirm }: { nom: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal titre="Supprimer le certificat ?" onClose={onCancel} max={400}>
      <div className="flex flex-col gap-3">
        <p className="text-[0.85rem] text-muted">Supprimer le certificat de <b className="text-ink">{nom}</b> ?</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={onConfirm} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-white" style={{ background: "var(--oxblood)" }}><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
        </div>
      </div>
    </Modal>
  );
}
