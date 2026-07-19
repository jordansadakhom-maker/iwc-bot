"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users, ScrollText, FileSignature, Plus, Minus, Loader2, Trash2, IdCard, Send, Check, X,
  Download, CircleDollarSign, Vault, ArrowDownRight, ArrowUpRight, History, ShoppingCart, Package, Search,
} from "lucide-react";
import type { ArmClient, ArmVente, ArmContrat, ArmMouvement, ArmProduit } from "@/lib/queries";
import { Modal, Flash, Champ, Picker, inputCls } from "@/components/edit-ui";
import { Badge } from "@/components/ui";
import { PhotoDrop } from "@/components/photo-drop";
import {
  creerClient, majClient, supprimerClient,
  creerVente, majVente, supprimerVente,
  creerContrat, envoyerContrat, marquerContrat, supprimerContrat,
  ajusterCoffreArmurerie,
  creerProduit, majProduit, supprimerProduit, importerCatalogue, validerCaisse, type LigneCaisse,
} from "@/app/(app)/armurerie/actions";

type Router = ReturnType<typeof useRouter>;
const money = (n: number) => `${n.toLocaleString("fr-FR")}$`;
const CATS = ["Revolver", "Pistolet", "Fusil à répétition", "Fusil à pompe", "Carabine", "Fusil de précision", "Autre"];
const STATUTS_CLIENT = [
  { key: "actif", label: "Actif", tone: "var(--good)" },
  { key: "surveillance", label: "Surveillance", tone: "var(--warn)" },
  { key: "interdit", label: "Interdit de vente", tone: "var(--oxblood)" },
];
const clientTone = (s: string): "good" | "warn" | "oxblood" => /interdit/.test(s) ? "oxblood" : /surveill/.test(s) ? "warn" : "good";
const ctrTone = (s: string): "good" | "warn" | "accent" | "oxblood" | "muted" =>
  s === "signe" ? "good" : s === "envoye" ? "accent" : s === "refuse" ? "oxblood" : "muted";
const ctrLabel = (s: string) => s === "signe" ? "Signé" : s === "envoye" ? "Envoyé" : s === "refuse" ? "Refusé" : "Brouillon";

type TabKey = "caisse" | "produits" | "ventes" | "clients" | "contrats";

export function ArmurerieComptoir({ clients, ventes, contrats, ca, coffre, mouvementsCoffre, produits }: { clients: ArmClient[]; ventes: ArmVente[]; contrats: ArmContrat[]; ca: number; coffre: number; mouvementsCoffre: ArmMouvement[]; produits: ArmProduit[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("caisse");
  const signes = contrats.filter((c) => c.statut === "signe").length;

  const TABS: { key: TabKey; label: string; icon: typeof Users; n: number }[] = [
    { key: "caisse", label: "Caisse", icon: ShoppingCart, n: produits.length },
    { key: "produits", label: "Produits", icon: Package, n: produits.length },
    { key: "ventes", label: "Registre des ventes", icon: ScrollText, n: ventes.length },
    { key: "clients", label: "Fichier clients", icon: Users, n: clients.length },
    { key: "contrats", label: "Contrats", icon: FileSignature, n: contrats.length },
  ];

  return (
    <>
      {/* Coffre propre à l'armurerie */}
      <CoffreArmurerie solde={coffre} mouvements={mouvementsCoffre} router={router} />

      {/* KPIs */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Kpi label="Chiffre d'affaires" value={money(ca)} tone="var(--accent)" icon={CircleDollarSign} />
        <Kpi label="Ventes au registre" value={String(ventes.length)} tone="var(--brass)" icon={ScrollText} />
        <Kpi label="Clients fichés" value={String(clients.length)} tone="var(--steel)" icon={Users} />
        <Kpi label="Contrats signés" value={String(signes)} tone="var(--good)" icon={Check} />
      </div>

      {/* Onglets */}
      <div className="mb-4 flex flex-wrap gap-1.5 border-b border-border pb-2">
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.82rem] font-semibold transition"
              style={{ color: on ? "#000" : "var(--muted)", background: on ? "var(--accent)" : "transparent" }}>
              <t.icon className="h-3.5 w-3.5" /> {t.label} <span className="font-num opacity-70">{t.n}</span>
            </button>
          );
        })}
      </div>

      {tab === "caisse" ? <CaisseTab produits={produits} clients={clients} router={router} /> : null}
      {tab === "produits" ? <ProduitsTab produits={produits} router={router} /> : null}
      {tab === "clients" ? <ClientsTab clients={clients} ventes={ventes} router={router} /> : null}
      {tab === "ventes" ? <VentesTab ventes={ventes} clients={clients} router={router} /> : null}
      {tab === "contrats" ? <ContratsTab contrats={contrats} clients={clients} router={router} /> : null}
    </>
  );
}

// ═══════════════════ CAISSE (point de vente) ═══════════════════
function CaisseTab({ produits, clients, router }: { produits: ArmProduit[]; clients: ArmClient[]; router: Router }) {
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [client, setClient] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const byId = new Map(produits.map((p) => [p.id, p]));
  const filtres = produits.filter((p) => p.nom.toLowerCase().includes(q.trim().toLowerCase()));
  const cats = [...new Set(filtres.map((p) => p.categorie))];
  const lignes = Object.entries(cart).filter(([, n]) => n > 0).map(([id, n]) => ({ p: byId.get(id)!, n })).filter((l) => l.p);
  const vente = lignes.reduce((s, l) => s + l.p.prix * l.n, 0);
  const cout = lignes.reduce((s, l) => s + l.p.cout * l.n, 0);
  const benefice = vente - cout;

  const add = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 }));
  const sub = (id: string) => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) - 1) }));

  async function valider() {
    if (!lignes.length) return;
    setBusy(true);
    const payload: LigneCaisse[] = lignes.map((l) => ({ produitId: l.p.id, nom: l.p.nom, categorie: l.p.categorie, prix: l.p.prix, cout: l.p.cout, qte: l.n, aLaDemande: l.p.aLaDemande }));
    const r = await validerCaisse(payload, client, notes);
    setBusy(false);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    setCart({}); setClient(""); setNotes("");
    setFlash(`Vente encaissée : ${money(r.total || vente)} → coffre de l'armurerie + registre.`);
    router.refresh();
  }

  if (produits.length === 0) {
    return <Vide icon={ShoppingCart} texte="La caisse a besoin d'un catalogue. Va dans l'onglet « Produits » pour ajouter tes armes/munitions (ou importer le catalogue type)." />;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      {/* Grille produits */}
      <div>
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input className={inputCls + " pl-8"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un produit…" />
        </div>
        {cats.map((cat) => (
          <div key={cat} className="mb-3">
            <div className="mb-1.5 text-[0.72rem] uppercase tracking-[0.08em] text-faint">{cat}</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {filtres.filter((p) => p.categorie === cat).map((p) => (
                <button key={p.id} onClick={() => add(p.id)} className="rounded-[10px] border border-border bg-surface-2 px-2.5 py-2 text-left transition hover:-translate-y-0.5 hover:border-border-2">
                  <div className="truncate text-[0.8rem] font-semibold">{p.nom}</div>
                  <div className="mt-0.5 text-[0.66rem] text-faint">{p.aLaDemande ? "à la demande" : `stock ${p.stock}`}{cart[p.id] ? ` · ${cart[p.id]} au panier` : ""}</div>
                  <div className="mt-1 font-num text-[0.9rem] font-bold" style={{ color: "var(--accent)" }}>{money(p.prix)}</div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Panier */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-[14px] border border-border bg-surface-2 p-3.5">
          <div className="mb-2 flex items-center gap-1.5 text-[0.8rem] font-semibold uppercase tracking-[0.05em] text-muted"><ShoppingCart className="h-4 w-4" /> Panier</div>
          {flash ? <div className="mb-2"><Flash>{flash}</Flash></div> : null}
          {lignes.length === 0 ? (
            <p className="py-4 text-center text-[0.8rem] text-faint">Panier vide. Clique un produit pour l&apos;ajouter.</p>
          ) : (
            <div className="mb-2 flex flex-col gap-1.5">
              {lignes.map((l) => (
                <div key={l.p.id} className="flex items-center gap-2 text-[0.82rem]">
                  <span className="min-w-0 flex-1 truncate">{l.p.nom}</span>
                  <button onClick={() => sub(l.p.id)} className="grid h-5 w-5 place-items-center rounded border border-border text-muted hover:text-ink"><Minus className="h-3 w-3" /></button>
                  <span className="w-5 text-center font-num">{l.n}</span>
                  <button onClick={() => add(l.p.id)} className="grid h-5 w-5 place-items-center rounded border border-border text-muted hover:text-ink"><Plus className="h-3 w-3" /></button>
                  <span className="w-14 shrink-0 text-right font-num">{money(l.p.prix * l.n)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-1 border-t border-border pt-2 text-[0.84rem]">
            <div className="flex justify-between text-faint"><span>Coût matières</span><span className="font-num">−{money(cout)}</span></div>
            <div className="flex justify-between"><span className="text-faint">Vente</span><span className="font-num font-semibold">{money(vente)}</span></div>
            <div className="flex justify-between"><span className="font-semibold">Bénéfice</span><span className="font-num font-bold" style={{ color: "var(--good)" }}>{money(benefice)}</span></div>
          </div>
          <div className="mt-2.5 flex flex-col gap-2">
            <input className={inputCls} value={client} onChange={(e) => setClient(e.target.value)} placeholder="Client (nom & prénom) — optionnel" list="arm-clients" maxLength={120} />
            <datalist id="arm-clients">{clients.map((c) => <option key={c.id} value={c.nom} />)}</datalist>
            <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes — optionnel" maxLength={200} />
            <button onClick={valider} disabled={busy || !lignes.length} className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-[0.86rem] font-semibold text-black/85 disabled:opacity-50" style={{ background: "var(--good)" }}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Encaisser {money(vente)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════ PRODUITS (catalogue) ═══════════════════
function ProduitsTab({ produits, router }: { produits: ArmProduit[]; router: Router }) {
  const [sel, setSel] = useState<ArmProduit | null>(null);
  const [nouveau, setNouveau] = useState(false);
  const [busy, setBusy] = useState(false);
  const cats = [...new Set(produits.map((p) => p.categorie))];

  async function importer() { setBusy(true); const r = await importerCatalogue(); setBusy(false); if (r.ok) router.refresh(); }

  return (
    <>
      <div className="mb-3 flex justify-end gap-2">
        {produits.length === 0 ? <button onClick={importer} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold hover:border-border-2 disabled:opacity-60">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Importer le catalogue type</button> : null}
        <button onClick={() => setNouveau(true)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Plus className="h-3.5 w-3.5" /> Nouveau produit</button>
      </div>
      {produits.length === 0 ? (
        <Vide icon={Package} texte="Aucun produit. Importe le catalogue type (armes & munitions RDR2) ou ajoute tes produits — ils alimenteront la Caisse." />
      ) : (
        <div className="flex flex-col gap-3">
          {cats.map((cat) => (
            <div key={cat}>
              <div className="mb-1.5 text-[0.72rem] uppercase tracking-[0.08em] text-faint">{cat}</div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {produits.filter((p) => p.categorie === cat).map((p) => (
                  <button key={p.id} onClick={() => setSel(p)} className="flex items-center justify-between gap-2 rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-left transition hover:border-border-2">
                    <div className="min-w-0"><div className="truncate text-[0.84rem] font-medium">{p.nom}</div><div className="text-[0.68rem] text-faint">{p.aLaDemande ? "à la demande" : `stock ${p.stock}`}{p.cout ? ` · coût ${money(p.cout)}` : ""}</div></div>
                    <span className="shrink-0 font-num text-[0.86rem] font-bold" style={{ color: "var(--accent)" }}>{money(p.prix)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {nouveau ? <ProduitModal onClose={() => setNouveau(false)} router={router} /> : null}
      {sel ? <ProduitModal produit={sel} onClose={() => setSel(null)} router={router} /> : null}
    </>
  );
}

function ProduitModal({ produit, onClose, router }: { produit?: ArmProduit; onClose: () => void; router: Router }) {
  const editing = !!produit;
  const [nom, setNom] = useState(produit?.nom || "");
  const [categorie, setCategorie] = useState(produit?.categorie || "Divers");
  const [prix, setPrix] = useState(produit ? String(produit.prix) : "");
  const [cout, setCout] = useState(produit ? String(produit.cout) : "");
  const [stock, setStock] = useState(produit ? String(produit.stock) : "");
  const [aLaDemande, setALaDemande] = useState(!!produit?.aLaDemande);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function enregistrer() {
    setErr(null);
    if (nom.trim().length < 1) { setErr("Nom du produit requis."); return; }
    setBusy("save");
    const data = { nom, categorie, prix: Number(prix) || 0, cout: Number(cout) || 0, stock: Number(stock) || 0, aLaDemande };
    const r = editing ? await majProduit(produit!.id, data) : await creerProduit(data);
    setBusy(null);
    if (!r.ok) { setErr(r.error || "Impossible."); return; }
    router.refresh(); onClose();
  }
  async function supprimer() { setBusy("del"); const r = await supprimerProduit(produit!.id); setBusy(null); if (!r.ok) { setErr(r.error || "Échec."); return; } router.refresh(); onClose(); }

  return (
    <Modal titre={editing ? produit!.nom : "📦 Nouveau produit"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Nom *"><input className={inputCls} value={nom} onChange={(e) => setNom(e.target.value)} maxLength={120} autoFocus /></Champ>
          <Champ label="Catégorie"><input className={inputCls} value={categorie} onChange={(e) => setCategorie(e.target.value)} placeholder="Revolvers, Munitions…" maxLength={60} /></Champ>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Champ label="Prix de vente ($)"><input className={inputCls} type="number" min={0} value={prix} onChange={(e) => setPrix(e.target.value)} /></Champ>
          <Champ label="Coût matières ($)"><input className={inputCls} type="number" min={0} value={cout} onChange={(e) => setCout(e.target.value)} /></Champ>
          <Champ label="Stock"><input className={inputCls} type="number" min={0} value={stock} onChange={(e) => setStock(e.target.value)} disabled={aLaDemande} /></Champ>
        </div>
        <label className="inline-flex items-center gap-2 text-[0.82rem]">
          <input type="checkbox" checked={aLaDemande} onChange={(e) => setALaDemande(e.target.checked)} /> Produit « à la demande » (pas de stock décompté)
        </label>
        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
        <div className="mt-1 flex items-center justify-between border-t border-border pt-3">
          {editing ? <button onClick={supprimer} disabled={busy === "del"} className="inline-flex items-center gap-1.5 text-[0.76rem] text-faint hover:text-ink"><Trash2 className="h-3.5 w-3.5" /> Supprimer</button> : <span />}
          <button onClick={enregistrer} disabled={busy === "save"} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} {editing ? "Enregistrer" : "Ajouter"}</button>
        </div>
      </div>
    </Modal>
  );
}

function CoffreArmurerie({ solde, mouvements, router }: { solde: number; mouvements: ArmMouvement[]; router: Router }) {
  const [open, setOpen] = useState(false);
  const [journal, setJournal] = useState(false);
  const dateFR = (s: string | null) => { if (!s) return ""; try { return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
  return (
    <div className="mb-4 rounded-[14px] border px-4 py-3.5" style={{ borderColor: "color-mix(in srgb,var(--brass) 40%,var(--border))", background: "linear-gradient(135deg,color-mix(in srgb,var(--brass) 12%,var(--surface-2)),var(--surface-2))" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-[10px] border" style={{ borderColor: "color-mix(in srgb,var(--brass) 45%,var(--border))", background: "color-mix(in srgb,var(--brass) 14%,transparent)" }}>
            <Vault className="h-5 w-5" style={{ color: "var(--brass)" }} />
          </span>
          <div>
            <div className="text-[0.68rem] uppercase tracking-[0.1em] text-faint">Coffre de l&apos;armurerie · séparé</div>
            <div className="font-num text-[1.6rem] font-bold leading-none" style={{ color: "var(--brass)" }}>{money(solde)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {mouvements.length ? <button onClick={() => setJournal((j) => !j)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[0.76rem] font-semibold text-muted hover:text-ink"><History className="h-3.5 w-3.5" /> Journal</button> : null}
          <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.78rem] font-semibold text-black/85" style={{ background: "var(--brass)" }}><Plus className="h-3.5 w-3.5" /> Dépôt / Retrait</button>
        </div>
      </div>
      {journal && mouvements.length ? (
        <div className="mt-3 flex flex-col gap-1 border-t border-border pt-3">
          {mouvements.slice(0, 12).map((m) => {
            const entree = m.sens === "entree";
            return (
              <div key={m.id} className="flex items-center gap-2.5 text-[0.8rem]">
                {entree ? <ArrowDownRight className="h-4 w-4 shrink-0" style={{ color: "var(--good)" }} /> : <ArrowUpRight className="h-4 w-4 shrink-0" style={{ color: "var(--oxblood)" }} />}
                <span className="min-w-0 flex-1 truncate">{m.motif || (entree ? "Entrée" : "Sortie")}</span>
                {m.auteur ? <span className="hidden shrink-0 text-[0.7rem] text-faint sm:inline">{m.auteur}</span> : null}
                <span className="shrink-0 font-num font-semibold" style={{ color: entree ? "var(--good)" : "var(--oxblood)" }}>{entree ? "+" : "−"}{money(m.montant)}</span>
                <span className="hidden shrink-0 text-[0.68rem] text-faint md:inline">{dateFR(m.createdAt)}</span>
              </div>
            );
          })}
        </div>
      ) : null}
      {open ? <CoffreModal onClose={() => setOpen(false)} router={router} /> : null}
    </div>
  );
}

function CoffreModal({ onClose, router }: { onClose: () => void; router: Router }) {
  const [mode, setMode] = useState<"depot" | "retrait">("depot");
  const [montant, setMontant] = useState("");
  const [motif, setMotif] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function valider() {
    setErr(null);
    if (!(Number(montant) > 0)) { setErr("Montant invalide."); return; }
    setBusy(true);
    const r = await ajusterCoffreArmurerie(Number(montant), mode, motif);
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Impossible."); return; }
    router.refresh(); onClose();
  }
  return (
    <Modal titre="🏦 Coffre de l'armurerie" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <button onClick={() => setMode("depot")} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.8rem] font-semibold" style={{ color: mode === "depot" ? "#000" : "var(--good)", background: mode === "depot" ? "var(--good)" : "transparent", borderColor: "color-mix(in srgb,var(--good) 45%,var(--border))" }}><ArrowDownRight className="h-3.5 w-3.5" /> Dépôt</button>
          <button onClick={() => setMode("retrait")} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.8rem] font-semibold" style={{ color: mode === "retrait" ? "#fff" : "var(--oxblood)", background: mode === "retrait" ? "var(--oxblood)" : "transparent", borderColor: "color-mix(in srgb,var(--oxblood) 45%,var(--border))" }}><ArrowUpRight className="h-3.5 w-3.5" /> Retrait</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Montant ($)"><input className={inputCls} type="number" min={1} value={montant} onChange={(e) => setMontant(e.target.value)} autoFocus /></Champ>
          <Champ label="Motif"><input className={inputCls} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Réassort, salaire, réparation…" maxLength={200} /></Champ>
        </div>
        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
        <div className="mt-1 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={valider} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: mode === "retrait" ? "var(--oxblood)" : "var(--good)" }}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Vault className="h-3.5 w-3.5" />} Valider
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Kpi({ label, value, tone, icon: Icon }: { label: string; value: string; tone: string; icon: typeof Users }) {
  return (
    <div className="rounded-[12px] border border-border bg-surface-2 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[0.68rem] uppercase tracking-[0.06em] text-faint"><Icon className="h-3.5 w-3.5" style={{ color: tone }} /> {label}</div>
      <div className="mt-1 font-num text-[1.15rem] font-bold" style={{ color: tone }}>{value}</div>
    </div>
  );
}

// ═══════════════════ CLIENTS ═══════════════════
function ClientsTab({ clients, ventes, router }: { clients: ArmClient[]; ventes: ArmVente[]; router: Router }) {
  const [sel, setSel] = useState<ArmClient | null>(null);
  const [nouveau, setNouveau] = useState(false);
  return (
    <>
      <div className="mb-3 flex justify-end">
        <button onClick={() => setNouveau(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold hover:border-border-2"><Plus className="h-3.5 w-3.5" /> Nouveau client</button>
      </div>
      {clients.length === 0 ? (
        <Vide icon={Users} texte="Aucun client fiché. Ajoute un client — tu pourras ranger sa carte d'identité et retrouver ses achats." />
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {clients.map((c) => (
            <button key={c.id} onClick={() => setSel(c)} className="flex items-center gap-3 rounded-[12px] border border-border bg-surface-2 px-3 py-2.5 text-left transition hover:-translate-y-0.5 hover:border-border-2">
              {c.carteIdentite ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.carteIdentite} alt="CNI" className="h-11 w-11 shrink-0 rounded-[8px] border border-border object-cover" />
              ) : (
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[8px] border border-dashed border-border text-faint"><IdCard className="h-5 w-5" /></span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[0.88rem] font-semibold">{c.nom}</div>
                <div className="truncate text-[0.72rem] text-faint">{c.telegramme ? `☎ ${c.telegramme}` : "Pas de télégramme"}</div>
              </div>
              <Badge tone={clientTone(c.statut)}>{STATUTS_CLIENT.find((s) => s.key === c.statut)?.label || c.statut}</Badge>
            </button>
          ))}
        </div>
      )}
      {nouveau ? <ClientModal onClose={() => setNouveau(false)} router={router} /> : null}
      {sel ? <ClientModal client={sel} achats={ventes.filter((v) => v.clientId === sel.id)} onClose={() => setSel(null)} router={router} /> : null}
    </>
  );
}

function ClientModal({ client, achats = [], onClose, router }: { client?: ArmClient; achats?: ArmVente[]; onClose: () => void; router: Router }) {
  const editing = !!client;
  const [nom, setNom] = useState(client?.nom || "");
  const [telegramme, setTelegramme] = useState(client?.telegramme || "");
  const [discordId, setDiscordId] = useState(client?.discordId || "");
  const [statut, setStatut] = useState(client?.statut || "actif");
  const [notes, setNotes] = useState(client?.notes || "");
  const [carte, setCarte] = useState<string | null>(client?.carteIdentite || null);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  async function enregistrer() {
    setErr(null);
    if (nom.trim().length < 2) { setErr("Indique le nom du client."); return; }
    setBusy("save");
    const data = { nom, telegramme, discordId, statut, notes, carteIdentite: carte || undefined };
    const r = editing ? await majClient(client!.id, data) : await creerClient(data);
    setBusy(null);
    if (!r.ok) { setErr(r.error || "Impossible."); return; }
    router.refresh(); onClose();
  }
  async function majCarte(url: string) {
    setCarte(url);
    if (editing) { const r = await majClient(client!.id, { carteIdentite: url }); setFlash(r.ok ? "Carte d'identité rangée." : (r.error || "Échec.")); if (r.ok) router.refresh(); }
  }
  async function supprimer() {
    setBusy("del");
    const r = await supprimerClient(client!.id);
    setBusy(null);
    if (!r.ok) { setErr(r.error || "Échec."); return; }
    router.refresh(); onClose();
  }

  return (
    <Modal titre={editing ? client!.nom : "🗂️ Nouveau client"} onClose={onClose} max={520}>
      {flash ? <div className="mb-3"><Flash>{flash}</Flash></div> : null}
      <div className="flex flex-col gap-3">
        {/* Carte d'identité — capture de la CNI présentée par le client */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Carte d&apos;identité</span>
          {carte ? (
            <div className="flex flex-col gap-2">
              <a href={carte} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={carte} alt="Carte d'identité" className="max-h-52 w-full rounded-[10px] border border-border object-contain" style={{ background: "var(--surface-2)" }} />
              </a>
              <PhotoDrop dossier="armurerie-cni" onUploaded={majCarte} compact label="Remplacer la capture de la carte d'identité" />
            </div>
          ) : (
            <PhotoDrop dossier="armurerie-cni" onUploaded={majCarte} label="Importe la capture de la carte d'identité présentée par le client" />
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Nom & prénom *"><input className={inputCls} value={nom} onChange={(e) => setNom(e.target.value)} maxLength={120} autoFocus /></Champ>
          <Champ label="N° de télégramme"><input className={inputCls} value={telegramme} onChange={(e) => setTelegramme(e.target.value)} placeholder="Ex : 555-VH" maxLength={60} /></Champ>
        </div>
        <Champ label="ID Discord (pour recevoir les contrats)"><input className={inputCls} value={discordId} onChange={(e) => setDiscordId(e.target.value)} placeholder="Optionnel — 18 chiffres" maxLength={40} /></Champ>
        <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Statut</span><Picker options={STATUTS_CLIENT} value={statut} onChange={setStatut} /></div>
        <Champ label="Notes"><textarea className={inputCls + " min-h-[50px] resize-y"} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder="Antécédents, préférences, mises en garde…" /></Champ>

        {editing && achats.length ? (
          <div className="flex flex-col gap-1 border-t border-border pt-2">
            <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Historique d&apos;achats ({achats.length})</span>
            {achats.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 text-[0.78rem]">
                <span className="min-w-0 truncate text-muted">{[a.marque, a.modele].filter(Boolean).join(" ") || "Arme"} · <span className="mono text-faint">{a.numeroSerie}</span></span>
                <span className="shrink-0 font-num">{money(a.prix)}</span>
              </div>
            ))}
          </div>
        ) : null}

        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
        <div className="mt-1 flex items-center justify-between border-t border-border pt-3">
          {editing ? (
            confirmDel ? (
              <div className="flex items-center gap-2 text-[0.78rem]"><span className="text-muted">Supprimer ?</span>
                <button onClick={supprimer} disabled={busy === "del"} className="rounded-lg px-2.5 py-1 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--oxblood)" }}>{busy === "del" ? "…" : "Oui"}</button>
                <button onClick={() => setConfirmDel(false)} className="text-[0.76rem] text-muted hover:text-ink">Annuler</button></div>
            ) : <button onClick={() => setConfirmDel(true)} className="inline-flex items-center gap-1.5 text-[0.76rem] text-faint hover:text-ink"><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
          ) : <span />}
          <button onClick={enregistrer} disabled={busy === "save"} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>
            {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} {editing ? "Enregistrer" : "Ficher le client"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════ VENTES (registre officiel) ═══════════════════
function VentesTab({ ventes, clients, router }: { ventes: ArmVente[]; clients: ArmClient[]; router: Router }) {
  const [sel, setSel] = useState<ArmVente | null>(null);
  const [nouveau, setNouveau] = useState(false);

  function exporter() {
    const l = [
      "ARMURERIE DE VAN HORN — REGISTRE OFFICIEL DES VENTES D'ARMES À FEU",
      "Conforme au Décret N°2 — État de Louisiane",
      "=".repeat(70), "",
    ];
    ventes.forEach((v, i) => {
      l.push(`#${ventes.length - i} · ${v.dateVente || "—"}`);
      l.push(`  Acquéreur ......... ${v.acquereur}`);
      l.push(`  Arme .............. ${[v.marque, v.modele].filter(Boolean).join(" ") || "—"}${v.categorie ? ` (${v.categorie})` : ""}`);
      l.push(`  N° de série ....... ${v.numeroSerie || "—"}`);
      l.push(`  Vendeur ........... ${v.vendeur || "—"}`);
      l.push(`  N° télégramme ..... ${v.telegramme || "—"}`);
      l.push(`  Prix .............. ${money(v.prix)}`);
      if (v.notes) l.push(`  Notes ............. ${v.notes}`);
      l.push("");
    });
    const blob = new Blob([l.join("\n")], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "registre-ventes-van-horn.txt"; a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[0.74rem] italic text-faint">Registre tenu à l&apos;encre, dans l&apos;ordre chronologique — Décret N°2, Art. III.</p>
        <div className="flex items-center gap-2">
          {ventes.length ? <button onClick={exporter} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold hover:border-border-2"><Download className="h-3.5 w-3.5" /> Exporter</button> : null}
          <button onClick={() => setNouveau(true)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Plus className="h-3.5 w-3.5" /> Enregistrer une vente</button>
        </div>
      </div>
      {ventes.length === 0 ? (
        <Vide icon={ScrollText} texte="Le registre est vierge. Chaque vente d'arme doit y être inscrite (acquéreur, arme, n° de série, vendeur, télégramme)." />
      ) : (
        <div className="overflow-x-auto rounded-[12px] border border-border" style={{ background: "color-mix(in srgb,var(--brass) 5%,var(--surface-2))" }}>
          <table className="w-full min-w-[720px] border-collapse text-left text-[0.82rem]">
            <thead>
              <tr className="text-[0.66rem] uppercase tracking-[0.06em] text-faint">
                {["Date", "Acquéreur", "Arme", "N° série", "Vendeur", "Télégramme", "Prix"].map((h) => <th key={h} className="border-b border-border px-2.5 py-2 font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {ventes.map((v) => (
                <tr key={v.id} onClick={() => setSel(v)} className="cursor-pointer hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]">
                  <td className="border-b border-border px-2.5 py-2 text-muted">{v.dateVente}</td>
                  <td className="border-b border-border px-2.5 py-2 font-medium">{v.acquereur}</td>
                  <td className="border-b border-border px-2.5 py-2 text-muted">{[v.marque, v.modele].filter(Boolean).join(" ") || "—"}</td>
                  <td className="border-b border-border px-2.5 py-2"><span className="mono text-[0.76rem]">{v.numeroSerie}</span></td>
                  <td className="border-b border-border px-2.5 py-2 text-muted">{v.vendeur || "—"}</td>
                  <td className="border-b border-border px-2.5 py-2 text-faint">{v.telegramme || "—"}</td>
                  <td className="border-b border-border px-2.5 py-2 font-num">{money(v.prix)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {nouveau ? <VenteModal clients={clients} onClose={() => setNouveau(false)} router={router} /> : null}
      {sel ? <VenteModal vente={sel} clients={clients} onClose={() => setSel(null)} router={router} /> : null}
    </>
  );
}

function VenteModal({ vente, clients, onClose, router }: { vente?: ArmVente; clients: ArmClient[]; onClose: () => void; router: Router }) {
  const editing = !!vente;
  const [clientId, setClientId] = useState(vente?.clientId || "");
  const [acquereur, setAcquereur] = useState(vente?.acquereur || "");
  const [dateVente, setDateVente] = useState(vente?.dateVente || new Date().toLocaleDateString("fr-FR"));
  const [marque, setMarque] = useState(vente?.marque || "");
  const [modele, setModele] = useState(vente?.modele || "");
  const [categorie, setCategorie] = useState(vente?.categorie || "Revolver");
  const [numeroSerie, setNumeroSerie] = useState(vente?.numeroSerie || "");
  const [vendeur, setVendeur] = useState(vente?.vendeur || "");
  const [telegramme, setTelegramme] = useState(vente?.telegramme || "");
  const [prix, setPrix] = useState(vente ? String(vente.prix) : "");
  const [notes, setNotes] = useState(vente?.notes || "");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  function choisirClient(id: string) {
    setClientId(id);
    const c = clients.find((x) => x.id === id);
    if (c) { if (!acquereur) setAcquereur(c.nom); if (!telegramme && c.telegramme) setTelegramme(c.telegramme); }
  }
  async function enregistrer() {
    setErr(null);
    if (acquereur.trim().length < 2) { setErr("Nom de l'acquéreur requis (Décret N°2)."); return; }
    if (numeroSerie.trim().length < 1) { setErr("Le n° de série est obligatoire (Décret N°2)."); return; }
    setBusy("save");
    const data = { clientId: clientId || undefined, acquereur, dateVente, marque, modele, categorie, numeroSerie, vendeur, telegramme, prix: Number(prix) || 0, notes };
    const r = editing ? await majVente(vente!.id, data) : await creerVente(data);
    setBusy(null);
    if (!r.ok) { setErr(r.error || "Impossible."); return; }
    router.refresh(); onClose();
  }
  async function supprimer() {
    setBusy("del");
    const r = await supprimerVente(vente!.id);
    setBusy(null);
    if (!r.ok) { setErr(r.error || "Échec."); return; }
    router.refresh(); onClose();
  }

  return (
    <Modal titre={editing ? `Vente — ${vente!.acquereur}` : "🖋️ Inscrire une vente au registre"} onClose={onClose} max={560}>
      <div className="flex flex-col gap-3">
        {clients.length ? (
          <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Client (facultatif — pré-remplit)</span>
            <select className={inputCls} value={clientId} onChange={(e) => choisirClient(e.target.value)}>
              <option value="">— Client de passage —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select></div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Acquéreur (nom & prénom) *"><input className={inputCls} value={acquereur} onChange={(e) => setAcquereur(e.target.value)} maxLength={120} /></Champ>
          <Champ label="Date de la vente"><input className={inputCls} value={dateVente} onChange={(e) => setDateVente(e.target.value)} maxLength={40} /></Champ>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Marque"><input className={inputCls} value={marque} onChange={(e) => setMarque(e.target.value)} placeholder="Cattleman, Lancaster…" maxLength={80} /></Champ>
          <Champ label="Modèle"><input className={inputCls} value={modele} onChange={(e) => setModele(e.target.value)} maxLength={80} /></Champ>
        </div>
        <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Catégorie</span><Picker options={CATS.map((c) => ({ key: c, label: c }))} value={categorie} onChange={setCategorie} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="N° de série (gravé) *"><input className={inputCls + " mono"} value={numeroSerie} onChange={(e) => setNumeroSerie(e.target.value)} placeholder="Ex : VH-04471" maxLength={80} /></Champ>
          <Champ label="Prix ($)"><input className={inputCls} type="number" min={0} value={prix} onChange={(e) => setPrix(e.target.value)} /></Champ>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Vendeur (armurier)"><input className={inputCls} value={vendeur} onChange={(e) => setVendeur(e.target.value)} maxLength={120} /></Champ>
          <Champ label="N° télégramme du client"><input className={inputCls} value={telegramme} onChange={(e) => setTelegramme(e.target.value)} maxLength={60} /></Champ>
        </div>
        <Champ label="Notes"><textarea className={inputCls + " min-h-[44px] resize-y"} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} /></Champ>
        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
        <div className="mt-1 flex items-center justify-between border-t border-border pt-3">
          {editing ? (
            confirmDel ? (
              <div className="flex items-center gap-2 text-[0.78rem]"><span className="text-muted">Supprimer ?</span>
                <button onClick={supprimer} disabled={busy === "del"} className="rounded-lg px-2.5 py-1 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--oxblood)" }}>{busy === "del" ? "…" : "Oui"}</button>
                <button onClick={() => setConfirmDel(false)} className="text-[0.76rem] text-muted hover:text-ink">Annuler</button></div>
            ) : <button onClick={() => setConfirmDel(true)} className="inline-flex items-center gap-1.5 text-[0.76rem] text-faint hover:text-ink"><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
          ) : <span />}
          <button onClick={enregistrer} disabled={busy === "save"} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>
            {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScrollText className="h-3.5 w-3.5" />} {editing ? "Enregistrer" : "Inscrire au registre"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════ CONTRATS ═══════════════════
function ContratsTab({ contrats, clients, router }: { contrats: ArmContrat[]; clients: ArmClient[]; router: Router }) {
  const [sel, setSel] = useState<ArmContrat | null>(null);
  const [nouveau, setNouveau] = useState(false);
  return (
    <>
      <div className="mb-3 flex justify-end">
        <button onClick={() => setNouveau(true)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Plus className="h-3.5 w-3.5" /> Nouveau contrat</button>
      </div>
      {contrats.length === 0 ? (
        <Vide icon={FileSignature} texte="Aucun contrat. Rédige un contrat de vente et envoie-le au client par télégramme (message privé Discord) pour signature." />
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {contrats.map((c) => (
            <button key={c.id} onClick={() => setSel(c)} className="rounded-[12px] border border-border bg-surface-2 px-3.5 py-3 text-left transition hover:-translate-y-0.5 hover:border-border-2">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[0.88rem] font-semibold">{c.clientNom}</span>
                <Badge tone={ctrTone(c.statut)}>{ctrLabel(c.statut)}</Badge>
              </div>
              <div className="mt-1 truncate text-[0.76rem] text-muted">{c.arme || "Arme à définir"}{c.numeroSerie ? ` · ${c.numeroSerie}` : ""}</div>
              {c.prix ? <div className="mt-1 font-num text-[0.82rem] font-semibold" style={{ color: "var(--accent)" }}>{money(c.prix)}</div> : null}
            </button>
          ))}
        </div>
      )}
      {nouveau ? <ContratModal clients={clients} onClose={() => setNouveau(false)} router={router} /> : null}
      {sel ? <ContratModal contrat={sel} clients={clients} onClose={() => setSel(null)} router={router} /> : null}
    </>
  );
}

function ContratModal({ contrat, clients, onClose, router }: { contrat?: ArmContrat; clients: ArmClient[]; onClose: () => void; router: Router }) {
  const editing = !!contrat;
  const [clientId, setClientId] = useState(contrat?.clientId || "");
  const [clientNom, setClientNom] = useState(contrat?.clientNom || "");
  const [clientDiscordId, setClientDiscordId] = useState(contrat?.clientDiscordId || "");
  const [arme, setArme] = useState(contrat?.arme || "");
  const [numeroSerie, setNumeroSerie] = useState(contrat?.numeroSerie || "");
  const [prix, setPrix] = useState(contrat ? String(contrat.prix) : "");
  const [conditions, setConditions] = useState(contrat?.conditions || "");
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function choisir(id: string) {
    setClientId(id);
    const c = clients.find((x) => x.id === id);
    if (c) { setClientNom(c.nom); if (c.discordId) setClientDiscordId(c.discordId); }
  }
  async function creer() {
    setErr(null);
    if (clientNom.trim().length < 2) { setErr("Indique le nom du client."); return; }
    setBusy("save");
    const r = await creerContrat({ clientId: clientId || undefined, clientNom, clientDiscordId, arme, numeroSerie, prix: Number(prix) || 0, conditions });
    setBusy(null);
    if (!r.ok) { setErr(r.error || "Impossible."); return; }
    router.refresh(); onClose();
  }
  async function envoyer() {
    setBusy("send");
    const r = await envoyerContrat(contrat!.id);
    setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    setFlash("Contrat envoyé au client en message privé — en attente de signature."); router.refresh();
  }
  async function marquer(st: "signe" | "refuse") {
    setBusy(st);
    const r = await marquerContrat(contrat!.id, st);
    setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    setFlash(st === "signe" ? "Contrat marqué signé." : "Contrat marqué refusé."); router.refresh();
  }
  async function supprimer() {
    setBusy("del");
    const r = await supprimerContrat(contrat!.id);
    setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    router.refresh(); onClose();
  }

  return (
    <Modal titre={editing ? `Contrat — ${contrat!.clientNom}` : "📜 Nouveau contrat de vente"} onClose={onClose} max={540}>
      {flash ? <div className="mb-3"><Flash>{flash}</Flash></div> : null}
      {editing ? (
        <div className="mb-3 flex flex-col gap-2 rounded-[12px] border border-border bg-surface-2 px-3.5 py-3">
          <div className="flex items-center justify-between"><span className="text-[0.86rem] font-semibold">{contrat!.clientNom}</span><Badge tone={ctrTone(contrat!.statut)}>{ctrLabel(contrat!.statut)}</Badge></div>
          {contrat!.arme ? <div className="text-[0.82rem] text-muted">{contrat!.arme}{contrat!.numeroSerie ? ` · ${contrat!.numeroSerie}` : ""}</div> : null}
          {contrat!.prix ? <div className="font-num text-[0.84rem] font-semibold" style={{ color: "var(--accent)" }}>{money(contrat!.prix)}</div> : null}
          {contrat!.conditions ? <div className="text-[0.8rem] text-muted"><span className="text-faint">Conditions : </span>{contrat!.conditions}</div> : null}
          <div className="mt-1 flex flex-wrap gap-2 border-t border-border pt-2">
            {contrat!.statut === "brouillon" || contrat!.statut === "refuse" ? (
              <button onClick={envoyer} disabled={busy === "send"} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.78rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>
                {busy === "send" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Envoyer au client
              </button>
            ) : null}
            {contrat!.statut !== "signe" ? <button onClick={() => marquer("signe")} disabled={busy === "signe"} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.78rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--good)" }}>{busy === "signe" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Marquer signé</button> : null}
            {contrat!.statut !== "refuse" ? <button onClick={() => marquer("refuse")} disabled={busy === "refuse"} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[0.78rem] font-semibold hover:border-border-2">{busy === "refuse" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Refusé</button> : null}
            <button onClick={supprimer} disabled={busy === "del"} className="ml-auto inline-flex items-center gap-1.5 text-[0.76rem] text-faint hover:text-ink"><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {clients.length ? (
            <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Client</span>
              <select className={inputCls} value={clientId} onChange={(e) => choisir(e.target.value)}>
                <option value="">— Saisir manuellement —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select></div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ label="Nom du client *"><input className={inputCls} value={clientNom} onChange={(e) => setClientNom(e.target.value)} maxLength={120} /></Champ>
            <Champ label="ID Discord du client"><input className={inputCls} value={clientDiscordId} onChange={(e) => setClientDiscordId(e.target.value)} placeholder="Pour l'envoi en MP" maxLength={40} /></Champ>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ label="Arme"><input className={inputCls} value={arme} onChange={(e) => setArme(e.target.value)} placeholder="Cattleman Revolver" maxLength={120} /></Champ>
            <Champ label="N° de série"><input className={inputCls + " mono"} value={numeroSerie} onChange={(e) => setNumeroSerie(e.target.value)} maxLength={80} /></Champ>
          </div>
          <Champ label="Prix ($)"><input className={inputCls} type="number" min={0} value={prix} onChange={(e) => setPrix(e.target.value)} /></Champ>
          <Champ label="Conditions"><textarea className={inputCls + " min-h-[60px] resize-y"} value={conditions} onChange={(e) => setConditions(e.target.value)} maxLength={2000} placeholder="Modalités de paiement, garanties, clauses…" /></Champ>
          {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
          <div className="flex justify-end">
            <button onClick={creer} disabled={busy === "save"} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>
              {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSignature className="h-3.5 w-3.5" />} Rédiger le contrat
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Vide({ icon: Icon, texte }: { icon: typeof Users; texte: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <Icon className="h-6 w-6 text-faint" strokeWidth={1.6} />
      <p className="max-w-md text-[0.82rem] leading-relaxed text-muted">{texte}</p>
    </div>
  );
}
