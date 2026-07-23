"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Plus, Check, Pencil, Trash2, UserCog, Sliders, Save, Loader2, BadgeCheck } from "lucide-react";
import { ROLES, roleDef, CONFIG_CHAMPS, type Config } from "@/lib/dispensaire-roles-const";
import type { Membre, RoleContext } from "@/lib/dispensaire-roles";
import { Modal, Flash, Champ, inputCls } from "@/components/edit-ui";
import { creerMembre, majMembre, supprimerMembre, majConfig } from "@/app/dispensaire/admin/actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;

export function DispensaireAdmin({ membres: init, config: cfg0, moi, pret }: { membres: Membre[]; config: Config; moi: RoleContext; pret: boolean }) {
  const router = useRouter();
  const [membres, setMembres] = useState<Membre[]>(init);
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [form, setForm] = useState<Membre | "new" | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);

  // Première prise en main : le compte connecté se nomme Directeur en un clic
  // (utilise son identité de session — ID Discord + nom). Ferme l'amorçage.
  async function meNommerDirecteur() {
    setAutoBusy(true);
    const r = await creerMembre({ nom: moi.nom, identifiant: moi.identifiant || "", role: "directeur" });
    setAutoBusy(false);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    setFlash({ t: "ok", m: "C'est fait — tu es désormais Directeur du dispensaire." });
    router.refresh();
  }

  async function enregistrer(vals: Record<string, string>, editing: Membre | null) {
    if (editing) {
      setMembres((p) => p.map((m) => (m.id === editing.id ? { ...m, ...vals } as Membre : m))); setForm(null);
      const r = await majMembre(editing.id, vals); if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh();
    } else {
      const tmp: Membre = { id: "tmp-" + Math.random().toString(36).slice(2, 8), identifiant: vals.identifiant || null, nom: vals.nom, role: vals.role || "stagiaire", actif: true, note: vals.note || null, updatedAt: null, updatedBy: null };
      setMembres((p) => [...p, tmp]); setForm(null);
      const r = await creerMembre(vals);
      if (!r.ok) { setMembres((p) => p.filter((m) => m.id !== tmp.id)); setFlash({ t: "bad", m: r.error || "Impossible." }); }
      else { setMembres((p) => p.map((m) => (m.id === tmp.id ? { ...m, id: r.id || tmp.id } : m))); setFlash({ t: "ok", m: "Membre ajouté." }); router.refresh(); }
    }
  }
  async function changerRole(m: Membre, role: string) { setMembres((p) => p.map((x) => (x.id === m.id ? { ...x, role } : x))); const r = await majMembre(m.id, { role }); if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh(); }
  async function toggleActif(m: Membre) { const actif = !m.actif; setMembres((p) => p.map((x) => (x.id === m.id ? { ...x, actif } : x))); const r = await majMembre(m.id, { actif }); if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh(); }
  async function supprimer(id: string) { setMembres((p) => p.filter((m) => m.id !== id)); setDelId(null); const r = await supprimerMembre(id); if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh(); }

  const moiDef = roleDef(moi.role);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-accent" /><h2 className="font-display text-[1.15rem]">Administration</h2></div>
      {!pret ? <Flash tone="bad">Lance <b>web/prisma/sql/dispensaire-roles.sql</b> dans Supabase, puis recharge.</Flash> : null}
      {flash ? <Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash> : null}

      {/* Mon rôle */}
      <div className="flex items-center gap-3 rounded-[12px] border border-border bg-surface-2 p-3">
        <span className="grid h-9 w-9 place-items-center rounded-full" style={{ background: `color-mix(in srgb,${moiDef.tone} 15%,transparent)` }}><BadgeCheck className="h-5 w-5" style={{ color: moiDef.tone }} /></span>
        <div className="text-[0.82rem]">Connecté en tant que <b>{moi.nom}</b> — rôle <b style={{ color: moiDef.tone }}>{moiDef.label}</b>{moi.source === "fallback" ? <span className="text-faint"> (par défaut — non encore affecté)</span> : null}</div>
      </div>

      {/* Première prise en main : personne n'est encore affecté → se nommer Directeur */}
      {pret && moi.source === "fallback" && membres.length === 0 ? (
        <div className="rounded-[12px] border p-4" style={{ borderColor: "color-mix(in srgb,var(--accent) 50%,var(--border))", background: "color-mix(in srgb,var(--accent) 7%,transparent)" }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[0.9rem] font-semibold"><BadgeCheck className="h-4 w-4 text-accent" /> Première prise en main</div>
              <p className="mt-1 max-w-xl text-[0.8rem] text-muted">Aucun rôle n&apos;est encore attribué. Nomme-toi <b>Directeur</b> pour prendre la main sur tout le dispensaire — tu pourras ensuite ajouter le reste de l&apos;équipe et régler chaque rôle.</p>
            </div>
            <button onClick={meNommerDirecteur} disabled={autoBusy} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{autoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />} Me nommer Directeur</button>
          </div>
        </div>
      ) : null}

      {/* Membres & rôles */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-[0.9rem] font-semibold"><UserCog className="h-4 w-4 text-accent" /> Membres &amp; rôles <span className="font-num text-[0.8rem] text-faint">{membres.length}</span></h3>
          <button onClick={() => setForm("new")} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Plus className="h-3.5 w-3.5" /> Ajouter un membre</button>
        </div>
        <p className="mb-3 text-[0.74rem] text-faint">Tant qu&apos;aucun membre n&apos;est défini, l&apos;accès reste ouvert (comme aujourd&apos;hui). Dès qu&apos;un compte reçoit un rôle ici, ce rôle décide de ce qu&apos;il voit. Utilise l&apos;<b>ID Discord</b> si tu le connais, sinon le <b>nom exact</b> du compte.</p>

        {membres.length === 0 ? <p className="py-6 text-center text-[0.84rem] italic text-faint">Aucun membre affecté — ajoute le premier (commence par toi, en Directeur).</p> : (
          <div className="flex flex-col gap-2">
            {membres.map((m) => {
              const def = roleDef(m.role);
              return (
                <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-[10px] border border-border bg-surface-2 px-3 py-2" style={{ opacity: m.actif ? 1 : 0.55 }}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5"><span className="text-[0.86rem] font-semibold">{m.nom}</span>{!m.actif ? <span className="rounded-full border border-border px-1.5 text-[0.6rem] uppercase text-faint">inactif</span> : null}</div>
                    <div className="text-[0.7rem] text-faint">{m.identifiant ? `ID ${m.identifiant}` : "identifié par le nom"}{m.note ? ` · ${m.note}` : ""}</div>
                  </div>
                  <select value={m.role} onChange={(e) => changerRole(m, e.target.value)} className="rounded-md border border-border bg-surface px-2 py-1 text-[0.74rem] font-semibold" style={{ color: def.tone }}>{ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
                  <button onClick={() => toggleActif(m)} className="rounded-md border border-border px-2 py-1 text-[0.7rem] font-semibold text-muted hover:text-ink">{m.actif ? "Désactiver" : "Activer"}</button>
                  <button onClick={() => setForm(m)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-ink" aria-label="Modifier"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setDelId(m.id)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-oxblood" aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Paramètres */}
      <ParamForm config={cfg0} onFlash={setFlash} onSaved={() => router.refresh()} />

      {/* Matrice des rôles (référence) */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <h3 className="mb-3 flex items-center gap-2 text-[0.9rem] font-semibold"><ShieldAlert className="h-4 w-4 text-accent" /> Rôles &amp; permissions</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[0.78rem]">
            <thead><tr className="border-b border-border text-[0.64rem] uppercase tracking-[0.04em] text-faint"><th className="py-1.5 pr-2">Rôle</th><th className="px-2">Admin</th><th className="px-2">RH</th><th className="px-2">Factures</th><th className="px-2">Stock</th><th className="px-2">Médical</th></tr></thead>
            <tbody>
              {ROLES.map((r) => (
                <tr key={r.key} className="border-b border-border/50">
                  <td className="py-1.5 pr-2 font-semibold" style={{ color: r.tone }}>{r.label}</td>
                  {(["admin", "rh", "factures", "stock", "medical"] as const).map((p) => <td key={p} className="px-2">{r.perms[p] ? <Check className="h-3.5 w-3.5" style={{ color: "var(--good)" }} /> : <span className="text-faint">—</span>}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {form ? <MembreForm initial={form === "new" ? null : form} onClose={() => setForm(null)} onSave={(v) => enregistrer(v, form === "new" ? null : form)} /> : null}
      {delId ? <ConfirmDelete nom={membres.find((m) => m.id === delId)?.nom || ""} onCancel={() => setDelId(null)} onConfirm={() => supprimer(delId)} /> : null}
    </div>
  );
}

function ParamForm({ config, onFlash, onSaved }: { config: Config; onFlash: (f: FlashMsg) => void; onSaved: () => void }) {
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(CONFIG_CHAMPS.map((c) => [c.cle, String(config[c.cle])])));
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const patch: Record<string, number> = {};
    for (const c of CONFIG_CHAMPS) patch[c.cle] = Number(v[c.cle]) || 0;
    const r = await majConfig(patch);
    setBusy(false);
    if (!r.ok) onFlash({ t: "bad", m: r.error || "Impossible." }); else { onFlash({ t: "ok", m: "Paramètres enregistrés." }); onSaved(); }
  }
  return (
    <section className="rounded-[14px] border border-border bg-surface p-4">
      <h3 className="mb-3 flex items-center gap-2 text-[0.9rem] font-semibold"><Sliders className="h-4 w-4 text-accent" /> Paramètres &amp; seuils</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {CONFIG_CHAMPS.map((c) => (
          <label key={c.cle} className="flex flex-col gap-1">
            <span className="text-[0.74rem] font-semibold">{c.label}</span>
            <input className={inputCls + " max-w-[120px]"} value={v[c.cle]} onChange={(e) => setV((p) => ({ ...p, [c.cle]: e.target.value.replace(/[^0-9]/g, "") }))} inputMode="numeric" />
            <span className="text-[0.68rem] text-faint">{c.aide}</span>
          </label>
        ))}
      </div>
      <div className="mt-3 flex justify-end"><button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer</button></div>
    </section>
  );
}

function MembreForm({ initial, onClose, onSave }: { initial: Membre | null; onClose: () => void; onSave: (v: Record<string, string>) => void }) {
  const [v, setV] = useState<Record<string, string>>(() => ({ nom: initial?.nom || "", identifiant: initial?.identifiant || "", role: initial?.role || "stagiaire", note: initial?.note || "" }));
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  function go() { if (v.nom.trim().length < 1) { setErr("Le nom est obligatoire."); return; } onSave(v); }
  return (
    <Modal titre={initial ? "✏️ Modifier le membre" : "➕ Ajouter un membre"} onClose={onClose} max={520}>
      <div className="flex flex-col gap-3">
        <Champ label="Nom du compte *"><input className={inputCls} value={v.nom} onChange={set("nom")} placeholder="Nom exact du compte connecté" autoFocus /></Champ>
        <Champ label="ID Discord (optionnel, plus fiable)"><input className={inputCls} value={v.identifiant} onChange={set("identifiant")} placeholder="123456789012345678" /></Champ>
        <label className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Rôle</span>
          <select className={inputCls} value={v.role} onChange={set("role")}>{ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
        </label>
        <Champ label="Note"><textarea className={inputCls} rows={2} value={v.note} onChange={set("note")} /></Champ>
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
    <Modal titre="Retirer le membre ?" onClose={onCancel} max={400}>
      <div className="flex flex-col gap-3">
        <p className="text-[0.85rem] text-muted">Retirer <b className="text-ink">{nom}</b> ? Il repassera sur l&apos;accès par défaut.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={onConfirm} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-white" style={{ background: "var(--oxblood)" }}><Trash2 className="h-3.5 w-3.5" /> Retirer</button>
        </div>
      </div>
    </Modal>
  );
}
