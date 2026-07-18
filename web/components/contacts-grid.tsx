"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Loader2, Trash2 } from "lucide-react";
import type { ContactItem } from "@/lib/queries";
import { Modal, Flash, Champ, Picker, inputCls } from "@/components/edit-ui";
import { modifierContact, supprimerContact } from "@/app/(app)/agenda/actions";

type Router = ReturnType<typeof useRouter>;

const TYPES = [
  { key: "Allié", label: "Allié", tone: "var(--good)" },
  { key: "Client", label: "Client", tone: "var(--accent)" },
  { key: "Indic", label: "Indic", tone: "var(--steel)" },
  { key: "Ennemi", label: "Ennemi", tone: "var(--oxblood)" },
  { key: "Neutre", label: "Neutre", tone: "var(--muted)" },
];
const AFFILIATIONS = ["Civil", "Loi", "Hors-la-loi", "Loups de Fer", "Cartel", "Autre"];
const RELATIONS = ["Amicale", "Professionnelle", "Affaire", "Tendue", "Hostile"];
const STATUTS = ["Vivant", "Disparu", "Recherché", "Décédé"];
const TYPE_TONE: Record<string, string> = { "Allié": "var(--good)", "Client": "var(--accent)", "Indic": "var(--steel)", "Ennemi": "var(--oxblood)", "Neutre": "var(--muted)" };

function Stars({ n }: { n: number }) {
  const v = Math.max(0, Math.min(5, Math.round(n)));
  if (v === 0) return <span className="text-faint">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="h-1.5 w-2.5 rounded-sm" style={{ background: i <= v ? "var(--accent)" : "color-mix(in srgb,var(--ink) 12%,transparent)" }} />
      ))}
    </span>
  );
}

function Ligne({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 border-t border-border py-2 first:border-t-0">
      <span className="text-[0.76rem] uppercase tracking-[0.05em] text-faint">{label}</span>
      <span className="text-right text-[0.86rem] text-ink">{value}</span>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const c = TYPE_TONE[type] || "var(--muted)";
  return (
    <span className="rounded-md px-1.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.04em]" style={{ color: c, background: "color-mix(in srgb," + c + " 15%,transparent)" }}>{type}</span>
  );
}

export function ContactsGrid({ contacts }: { contacts: ContactItem[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<ContactItem | null>(null);

  return (
    <>
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {contacts.map((c) => (
          <button key={c.id} onClick={() => setSel(c)} className="rounded-[11px] border border-border bg-surface-2 px-3 py-2.5 text-left transition hover:-translate-y-0.5 hover:border-border-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 truncate text-[0.88rem] font-semibold">{c.nom}</div>
              <TypeBadge type={c.type} />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-[0.72rem] text-muted">
              {c.secteur ? <span className="truncate">{c.secteur}</span> : <span className="text-faint">—</span>}
              <Stars n={c.fiabilite} />
            </div>
          </button>
        ))}
      </div>

      {sel ? <ContactModal contact={sel} onClose={() => setSel(null)} router={router} /> : null}
    </>
  );
}

function ContactModal({ contact, onClose, router }: { contact: ContactItem; onClose: () => void; router: Router }) {
  const [edit, setEdit] = useState(false);
  const [nom, setNom] = useState(contact.nom);
  const [type, setType] = useState(contact.type || "Neutre");
  const [telegramme, setTelegramme] = useState(contact.telegramme || "");
  const [metier, setMetier] = useState(contact.metier || "");
  const [secteur, setSecteur] = useState(contact.secteur || "");
  const [affiliation, setAffiliation] = useState(contact.affiliation || "");
  const [relation, setRelation] = useState(contact.relation || "");
  const [statutRP, setStatutRP] = useState(contact.statutRP || "");
  const [fiabilite, setFiabilite] = useState(String(contact.fiabilite || ""));
  const [notes, setNotes] = useState(contact.notes || "");
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  async function enregistrer() {
    if (nom.trim().length < 2) { setFlash("Le nom est obligatoire."); return; }
    setBusy("save");
    const r = await modifierContact(contact.id, { nom, type, telegramme, metier, secteur, affiliation, relation, statutRP, notes, fiabilite: fiabilite ? Number(fiabilite) : 0 });
    setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    setFlash("Enregistré — mise à jour dans ~30 s.");
    setEdit(false); router.refresh();
  }
  async function supprimer() {
    setBusy("del");
    const r = await supprimerContact(contact.id);
    setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    router.refresh(); onClose();
  }

  return (
    <Modal titre={contact.nom} onClose={onClose} max={460}>
      {flash ? <div className="mb-3"><Flash>{flash}</Flash></div> : null}

      {!edit ? (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <TypeBadge type={type} />
            <button onClick={() => setEdit(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-[0.76rem] font-semibold hover:border-border-2"><Pencil className="h-3.5 w-3.5" /> Modifier</button>
          </div>
          <div className="mb-3 flex items-center gap-2 text-[0.8rem] text-muted"><span>Fiabilité</span> <Stars n={contact.fiabilite} /></div>
          <div className="flex flex-col">
            <Ligne label="Télégramme" value={telegramme || null} />
            <Ligne label="Métier" value={metier || null} />
            <Ligne label="Secteur" value={secteur || null} />
            <Ligne label="Affiliation" value={affiliation || null} />
            <Ligne label="Relation" value={relation || null} />
            <Ligne label="Statut" value={statutRP || null} />
            <Ligne label="Fiche par" value={contact.creeParNom} />
          </div>
          {notes ? (
            <div className="mt-3 border-t border-border pt-3">
              <div className="mb-1 text-[0.72rem] uppercase tracking-[0.05em] text-faint">Notes</div>
              <p className="whitespace-pre-wrap text-[0.86rem] leading-relaxed text-muted">{notes}</p>
            </div>
          ) : null}
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <Champ label="Nom *"><input className={inputCls} value={nom} onChange={(e) => setNom(e.target.value)} maxLength={120} /></Champ>
          <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Type</span><Picker options={TYPES} value={type} onChange={setType} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ label="Télégramme"><input className={inputCls} value={telegramme} onChange={(e) => setTelegramme(e.target.value)} maxLength={120} /></Champ>
            <Champ label="Métier"><input className={inputCls} value={metier} onChange={(e) => setMetier(e.target.value)} maxLength={120} /></Champ>
          </div>
          <Champ label="Secteur"><input className={inputCls} value={secteur} onChange={(e) => setSecteur(e.target.value)} maxLength={120} /></Champ>
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ label="Affiliation"><select className={inputCls} value={affiliation} onChange={(e) => setAffiliation(e.target.value)}><option value="">—</option>{AFFILIATIONS.map((a) => <option key={a} value={a}>{a}</option>)}</select></Champ>
            <Champ label="Relation"><select className={inputCls} value={relation} onChange={(e) => setRelation(e.target.value)}><option value="">—</option>{RELATIONS.map((a) => <option key={a} value={a}>{a}</option>)}</select></Champ>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ label="Statut"><select className={inputCls} value={statutRP} onChange={(e) => setStatutRP(e.target.value)}><option value="">—</option>{STATUTS.map((a) => <option key={a} value={a}>{a}</option>)}</select></Champ>
            <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Fiabilité</span><Picker options={[1, 2, 3, 4, 5].map((n) => ({ key: String(n), label: "★".repeat(n) }))} value={fiabilite} onChange={setFiabilite} /></div>
          </div>
          <Champ label="Notes"><textarea className={inputCls + " min-h-[70px] resize-y"} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} /></Champ>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEdit(false)} className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[0.8rem] font-semibold hover:border-border-2">Annuler</button>
            <button onClick={enregistrer} disabled={busy === "save"} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Enregistrer</button>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <ConfirmDelete onDelete={supprimer} busy={busy === "del"} />
        <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}>Fermer</button>
      </div>
    </Modal>
  );
}

function ConfirmDelete({ onDelete, busy }: { onDelete: () => void; busy: boolean }) {
  const [c, setC] = useState(false);
  if (!c) return <button onClick={() => setC(true)} className="inline-flex items-center gap-1.5 text-[0.76rem] text-faint hover:text-ink"><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>;
  return (
    <div className="flex items-center gap-2 text-[0.78rem]">
      <span className="text-muted">Supprimer ?</span>
      <button onClick={onDelete} disabled={busy} className="rounded-lg px-2.5 py-1 text-[0.76rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--oxblood)" }}>{busy ? "…" : "Oui"}</button>
      <button onClick={() => setC(false)} className="text-[0.76rem] text-muted hover:text-ink">Annuler</button>
    </div>
  );
}
