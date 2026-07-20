"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users, ScrollText, FileSignature, Plus, Minus, Loader2, Trash2, IdCard, Send, Check, X,
  Download, CircleDollarSign, Vault, ArrowDownRight, ArrowUpRight, History, ShoppingCart, Package, Search,
  Clock, BadgeDollarSign, Landmark, StickyNote, ListTodo, Activity, Wallet, ClipboardList, Pickaxe, Hammer, ChevronDown, AlertTriangle, TrendingUp,
} from "lucide-react";
import type { ArmClient, ArmVente, ArmContrat, ArmMouvement, ArmProduit, ArmEmploye, ArmPointage, ArmPaie, ArmImpot, ArmNote, ArmTache, ArmCommande, ArmRessource, ArmRecetteLigne } from "@/lib/queries";
import { Modal, Flash, Champ, Picker, inputCls } from "@/components/edit-ui";
import { cents } from "@/lib/format";
import { Badge } from "@/components/ui";
import { PhotoDrop } from "@/components/photo-drop";
import {
  EmployesTab, PointageTab, ComptabiliteTab, PaiesTab, ImpotsTab, BlocNotesTab, TachesTab, ActiviteTab, CarnetCommandesTab, RessourcesTab,
} from "@/components/armurerie-erp";
import {
  creerClient, majClient, supprimerClient,
  creerVente, majVente, supprimerVente,
  creerContrat, envoyerContrat, marquerContrat, supprimerContrat, honorerContrat,
  ajusterCoffreArmurerie,
  creerProduit, majProduit, supprimerProduit, importerCatalogue, importerRecettes, validerCaisse, fabriquerProduit, lireCarteIdentite, lireNumeroSerie, type LigneCaisse,
} from "@/app/(app)/armurerie/actions";

type Router = ReturnType<typeof useRouter>;
const money = (n: number) => `${cents(n)}$`;
const fourchette = (n: number): [number, number] => [Math.round(n * 95) / 100, Math.round(n * 105) / 100];
// Coût de fabrication d'une recette à partir des prix des ressources.
const _normIng = (x: string) => x.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
// Appariement ingrédient ⇄ ressource : MÊME logique que le serveur (fabriquerProduit),
// pour que l'affichage (coût, fabricable) prédise exactement ce que fera « Fabriquer ».
// Indispensable car les recettes disent « Lingot fer » quand le catalogue dit
// « Lingot de fer » — le « de » ne doit pas empêcher la correspondance.
const _STOP_ING = new Set(["de", "du", "des", "d", "l", "la", "le", "les", "a", "au", "aux", "en", "pour", "et"]);
const _toksIng = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((t) => t && !_STOP_ING.has(t));
const _normIngB = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
function prixIngredient(ing: string, ressources: ArmRessource[]): number | null {
  const r = ressourceDe(ing, ressources);
  return r ? r.prix : null;
}
function coutRecette(recette: ArmRecetteLigne[], ressources: ArmRessource[]): { cout: number; manquants: string[] } {
  let cout = 0; const manquants: string[] = [];
  for (const l of recette) {
    const p = prixIngredient(l.ingredient, ressources);
    if (p == null) manquants.push(l.ingredient); else cout += p * l.qte;
  }
  return { cout: Math.round(cout * 100) / 100, manquants };
}
// La ressource correspondant à un ingrédient, avec son stock (logique serveur : match
// exact, sinon sous-ensemble de tokens unique — sinon le nom le plus court).
function ressourceDe(ing: string, ressources: ArmRessource[]): ArmRessource | null {
  const n = _normIngB(ing);
  const exact = ressources.filter((r) => _normIngB(r.nom) === n);
  if (exact.length) return exact[0];
  const it = _toksIng(ing);
  if (!it.length) return null;
  const cand = ressources.filter((r) => { const rt = new Set(_toksIng(r.nom)); return it.every((t) => rt.has(t)); });
  if (cand.length === 1) return cand[0];
  if (cand.length > 1) {
    const pool = cand.slice().sort((a, b) => _toksIng(a.nom).length - _toksIng(b.nom).length);
    if (_toksIng(pool[0].nom).length !== _toksIng(pool[1].nom).length) return pool[0];
  }
  return null;
}
// Nombre d'unités fabricables MAINTENANT avec le stock de ressources en main.
//  null → aucune recette exploitable ; sinon un entier ≥ 0 (0 = ingrédient manquant/à sec).
function fabricableDe(p: ArmProduit, ressources: ArmRessource[]): number | null {
  const rec = (p.recette || []).filter((l) => l.ingredient.trim() && l.qte > 0);
  if (!rec.length) return null;
  let mini = Infinity;
  for (const l of rec) {
    const r = ressourceDe(l.ingredient, ressources);
    if (!r) return 0; // ingrédient absent du catalogue → non fabricable pour l'instant
    mini = Math.min(mini, Math.floor((Number(r.stock) || 0) / l.qte));
  }
  return Number.isFinite(mini) ? mini : null;
}
const CATS = ["Revolver", "Pistolet", "Fusil à répétition", "Fusil à pompe", "Carabine", "Fusil de précision", "Autre"];
const STATUTS_CLIENT = [
  { key: "actif", label: "Actif", tone: "var(--good)" },
  { key: "surveillance", label: "Surveillance", tone: "var(--warn)" },
  { key: "interdit", label: "Interdit de vente", tone: "var(--oxblood)" },
];
const clientTone = (s: string): "good" | "warn" | "oxblood" => /interdit/.test(s) ? "oxblood" : /surveill/.test(s) ? "warn" : "good";
const ctrTone = (s: string): "good" | "warn" | "accent" | "oxblood" | "muted" =>
  s === "honore" ? "good" : s === "signe" ? "good" : s === "envoye" ? "accent" : s === "refuse" ? "oxblood" : "muted";
const ctrLabel = (s: string) => s === "honore" ? "Honoré ✓" : s === "signe" ? "Signé" : s === "envoye" ? "Envoyé" : s === "refuse" ? "Refusé" : "Brouillon";

type TabKey = "caisse" | "produits" | "ressources" | "commandes" | "ventes" | "clients" | "contrats" | "employes" | "pointage" | "paies" | "comptabilite" | "impots" | "notes" | "taches" | "activite";

export function ArmurerieComptoir({ clients, ventes, contrats, ca, coffre, mouvementsCoffre, produits, employes, pointages, paies, impots, notes, taches, commandes, ressources }: { clients: ArmClient[]; ventes: ArmVente[]; contrats: ArmContrat[]; ca: number; coffre: number; mouvementsCoffre: ArmMouvement[]; produits: ArmProduit[]; employes: ArmEmploye[]; pointages: ArmPointage[]; paies: ArmPaie[]; impots: ArmImpot[]; notes: ArmNote[]; taches: ArmTache[]; commandes: ArmCommande[]; ressources: ArmRessource[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("caisse");
  const signes = contrats.filter((c) => c.statut === "signe").length;
  const paiesDues = paies.filter((p) => p.statut !== "paye").length;
  const impotsDus = impots.filter((i) => i.statut !== "paye").length;
  const tachesAFaire = taches.filter((t) => !t.fait).length;

  const TABS: { key: TabKey; label: string; icon: typeof Users; n: number }[] = [
    { key: "caisse", label: "Caisse", icon: ShoppingCart, n: produits.length },
    { key: "produits", label: "Produits", icon: Package, n: produits.length },
    { key: "ressources", label: "Ressources", icon: Pickaxe, n: ressources.length },
    { key: "commandes", label: "Carnet de commande", icon: ClipboardList, n: commandes.filter((c) => c.statut === "en_attente" || c.statut === "prete").length },
    { key: "ventes", label: "Registre des ventes", icon: ScrollText, n: ventes.length },
    { key: "clients", label: "Fichier clients", icon: Users, n: clients.length },
    { key: "contrats", label: "Contrats", icon: FileSignature, n: contrats.length },
    { key: "employes", label: "Employés", icon: Users, n: employes.length },
    { key: "pointage", label: "Pointage", icon: Clock, n: pointages.filter((p) => !p.fin).length },
    { key: "paies", label: "Paies", icon: BadgeDollarSign, n: paiesDues },
    { key: "comptabilite", label: "Comptabilité", icon: Wallet, n: mouvementsCoffre.length },
    { key: "impots", label: "Impôts", icon: Landmark, n: impotsDus },
    { key: "notes", label: "Bloc-notes", icon: StickyNote, n: notes.length },
    { key: "taches", label: "Tâches", icon: ListTodo, n: tachesAFaire },
    { key: "activite", label: "Activité", icon: Activity, n: 0 },
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
              <t.icon className="h-3.5 w-3.5" /> {t.label} {t.n ? <span className="font-num opacity-70">{t.n}</span> : null}
            </button>
          );
        })}
      </div>

      {tab === "caisse" ? <CaisseTab produits={produits} ressources={ressources} clients={clients} router={router} /> : null}
      {tab === "produits" ? <ProduitsTab produits={produits} ressources={ressources} router={router} /> : null}
      {tab === "ressources" ? <RessourcesTab ressources={ressources} router={router} /> : null}
      {tab === "commandes" ? <CarnetCommandesTab commandes={commandes} produits={produits} clients={clients.map((c) => ({ id: c.id, nom: c.nom }))} router={router} /> : null}
      {tab === "clients" ? <ClientsTab clients={clients} ventes={ventes} contrats={contrats} router={router} /> : null}
      {tab === "ventes" ? <VentesTab ventes={ventes} clients={clients} router={router} /> : null}
      {tab === "contrats" ? <ContratsTab contrats={contrats} clients={clients} produits={produits} router={router} /> : null}
      {tab === "employes" ? <EmployesTab employes={employes} router={router} /> : null}
      {tab === "pointage" ? <PointageTab employes={employes} pointages={pointages} router={router} /> : null}
      {tab === "paies" ? <PaiesTab paies={paies} employes={employes} ventes={ventes} router={router} /> : null}
      {tab === "comptabilite" ? <ComptabiliteTab mouvements={mouvementsCoffre} ca={ca} router={router} /> : null}
      {tab === "impots" ? <ImpotsTab impots={impots} ca={ca} router={router} /> : null}
      {tab === "notes" ? <BlocNotesTab notes={notes} router={router} /> : null}
      {tab === "taches" ? <TachesTab taches={taches} router={router} /> : null}
      {tab === "activite" ? <ActiviteTab mouvements={mouvementsCoffre} ventes={ventes} pointages={pointages} paies={paies} /> : null}
    </>
  );
}

// Normalise un nom pour comparer (sans accents, minuscules, espaces compactés).
function normNom(v: string) { return (v || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }
// Retrouve un client existant à partir d'un nom lu (égalité, ou l'un contient l'autre).
function matchNomClient(clients: ArmClient[], nomLu: string): ArmClient | null {
  const a = normNom(nomLu); if (a.length < 2) return null;
  let best: ArmClient | null = null;
  for (const c of clients) { const b = normNom(c.nom); if (!b) continue; if (b === a) return c; if (!best && (b.includes(a) || a.includes(b))) best = c; }
  return best;
}

// ═══════════════════ CAISSE (point de vente) ═══════════════════
function CaisseTab({ produits, ressources, clients, router }: { produits: ArmProduit[]; ressources: ArmRessource[]; clients: ArmClient[]; router: Router }) {
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [pxEdit, setPxEdit] = useState<Record<string, string>>({}); // prix unitaire ajusté à la vente
  const [client, setClient] = useState("");
  const [clientId, setClientId] = useState("");
  const [notes, setNotes] = useState("");
  const [serie, setSerie] = useState("");
  const [serieLisant, setSerieLisant] = useState(false);
  const [serieLu, setSerieLu] = useState<string | null>(null);
  const [photo, setPhoto] = useState("");
  const [lisant, setLisant] = useState(false);
  const [lu, setLu] = useState<string | null>(null);
  const [factureSnap, setFactureSnap] = useState<ArmVente[] | null>(null); // facture du dernier règlement encaissé
  const [factureOpen, setFactureOpen] = useState(false);

  // Photo du numéro de série → l'IA lit le numéro et remplit le champ.
  async function onSeriePhoto(url: string) {
    setSerieLu(null); setSerieLisant(true);
    const r = await lireNumeroSerie(url);
    setSerieLisant(false);
    if (!r.ok) { setSerieLu(r.error || "Lecture impossible."); return; }
    setSerie(r.serie || "");
    setSerieLu(`🔫 N° lu : ${r.serie}`);
  }
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  // Photo de carte d'identité déposée → l'IA lit le nom/prénom et pré-remplit.
  async function onPhoto(url: string) {
    setPhoto(url); setLu(null); setLisant(true);
    const r = await lireCarteIdentite(url);
    setLisant(false);
    if (!r.ok) { setLu(r.error || "Lecture impossible."); return; }
    const nomComplet = `${r.prenom || ""} ${r.nom || ""}`.trim();
    const extra = [r.dateNaissance ? `né(e) ${r.dateNaissance}` : "", r.residence ? `réside : ${r.residence}` : ""].filter(Boolean).join(" · ");
    if (extra && !notes) setNotes(extra);
    // Client déjà fiché ? On rattache la vente à son dossier (les achats s'accumulent).
    const dejaClient = nomComplet ? matchNomClient(clients, nomComplet) : null;
    if (dejaClient) {
      setClientId(dejaClient.id); setClient("");
      setLu(`📇 Client retrouvé : ${dejaClient.nom} — la vente s'ajoute à son dossier.`);
    } else {
      if (nomComplet && !clientId) setClient(nomComplet);
      setLu(nomComplet ? `📇 Identité lue : ${nomComplet}${extra ? " — " + extra : ""} (nouveau client)` : "Carte lue, mais nom non détecté — saisis-le à la main.");
    }
  }

  const byId = new Map(produits.map((p) => [p.id, p]));
  const filtres = produits.filter((p) => p.nom.toLowerCase().includes(q.trim().toLowerCase()));
  const cats = [...new Set(filtres.map((p) => p.categorie))];
  const lignes = Object.entries(cart).filter(([, n]) => n > 0).map(([id, n]) => ({ p: byId.get(id)!, n })).filter((l) => l.p);
  const pu = (p: ArmProduit) => { const v = pxEdit[p.id]; return v === undefined ? p.prix : Math.max(0, Math.round((Number(v) || 0) * 100) / 100); };
  const vente = lignes.reduce((s, l) => s + pu(l.p) * l.n, 0);
  const cout = lignes.reduce((s, l) => s + l.p.cout * l.n, 0);
  const benefice = vente - cout;

  const add = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 }));
  const sub = (id: string) => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) - 1) }));

  async function valider() {
    if (!lignes.length) return;
    setBusy(true);
    const payload: LigneCaisse[] = lignes.map((l) => ({ produitId: l.p.id, nom: l.p.nom, categorie: l.p.categorie, prix: pu(l.p), cout: l.p.cout, qte: l.n, aLaDemande: l.p.aLaDemande }));
    const r = await validerCaisse(payload, clientId ? "" : client, notes, clientId || undefined, { serie: serie.trim() || undefined, photo: photo || undefined });
    setBusy(false);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    // Facture immédiate : instantané du règlement (signé compagnie + client, imprimable / PDF).
    const cliObj = clientId ? clients.find((c) => c.id === clientId) : null;
    const acq = (cliObj?.nom || client || "Client de passage").trim();
    const dateV = new Date().toLocaleDateString("fr-FR");
    const snap: ArmVente[] = lignes.map((l, i) => ({
      id: `${r.ticket || "FAC"}-${i}`, clientId: clientId || null, acquereur: acq, dateVente: dateV,
      marque: l.p.nom, modele: null, categorie: l.p.categorie,
      numeroSerie: serie.trim() || null, vendeur: null, telegramme: cliObj?.telegramme || null,
      prix: pu(l.p) * l.n, quantite: l.n, prixUnitaire: pu(l.p), notes: notes || null, statut: "enregistree",
      photo: photo || cliObj?.carteIdentite || null, ticket: r.ticket || null, createdAt: null,
    }));
    setFactureSnap(snap); setFactureOpen(false);
    setCart({}); setPxEdit({}); setClient(""); setClientId(""); setNotes(""); setSerie(""); setPhoto(""); setLu(null); setSerieLu(null);
    setFlash(`Vente encaissée : ${money(r.total || vente)} → coffre + registre + facture + compta + impôts${r.ficheCreee ? " + fiche client créée" : ""}.`);
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
              {filtres.filter((p) => p.categorie === cat).map((p) => {
                const f = p.aLaDemande ? 0 : (fabricableDe(p, ressources) ?? 0); // fabricable depuis les ressources
                const rupture = !p.aLaDemande && p.stock === 0 && f === 0;
                const dispo = p.aLaDemande ? "à la demande" : p.stock > 0 ? `stock ${p.stock}${f > 0 ? ` · +${f} fab.` : ""}` : f > 0 ? `🔨 ${f} fabricable` : "rupture";
                return (
                  <button key={p.id} onClick={() => add(p.id)} className="rounded-[10px] border border-border bg-surface-2 px-2.5 py-2 text-left transition hover:-translate-y-0.5 hover:border-border-2">
                    <div className="truncate text-[0.8rem] font-semibold">{p.nom}</div>
                    <div className="mt-0.5 text-[0.66rem]" style={{ color: rupture ? "var(--oxblood)" : p.stock === 0 && f > 0 ? "var(--good)" : "var(--faint)" }}>{dispo}{cart[p.id] ? ` · ${cart[p.id]} au panier` : ""}</div>
                    <div className="mt-1 font-num text-[0.9rem] font-bold" style={{ color: "var(--accent)" }}>{money(p.prix)}</div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Panier */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-[14px] border border-border bg-surface-2 p-3.5">
          <div className="mb-2 flex items-center gap-1.5 text-[0.8rem] font-semibold uppercase tracking-[0.05em] text-muted"><ShoppingCart className="h-4 w-4" /> Panier</div>
          {flash ? <div className="mb-2"><Flash>{flash}</Flash></div> : null}
          {factureSnap ? (
            <button onClick={() => setFactureOpen(true)} className="mb-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[0.8rem] font-semibold" style={{ borderColor: "color-mix(in srgb,var(--brass) 45%,var(--border))", color: "var(--brass)" }}>
              🧾 Voir / imprimer la facture
            </button>
          ) : null}
          {lignes.length === 0 ? (
            <p className="py-4 text-center text-[0.8rem] text-faint">Panier vide. Clique un produit pour l&apos;ajouter.</p>
          ) : (
            <div className="mb-2 flex flex-col gap-2">
              {lignes.map((l) => { const insuff = !l.p.aLaDemande && l.n > l.p.stock; return (
                <div key={l.p.id} className="flex flex-col gap-1 border-b border-border/60 pb-1.5 text-[0.82rem]">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium">{l.p.nom}{insuff ? <span className="ml-1 text-[0.64rem] font-semibold" style={{ color: "var(--oxblood)" }} title={`Stock : ${l.p.stock}`}>· stock {l.p.stock}</span> : null}</span>
                    <button onClick={() => sub(l.p.id)} className="grid h-5 w-5 place-items-center rounded border border-border text-muted hover:text-ink"><Minus className="h-3 w-3" /></button>
                    <span className="w-5 text-center font-num" style={insuff ? { color: "var(--oxblood)" } : undefined}>{l.n}</span>
                    <button onClick={() => add(l.p.id)} className="grid h-5 w-5 place-items-center rounded border border-border text-muted hover:text-ink"><Plus className="h-3 w-3" /></button>
                  </div>
                  <div className="flex items-center gap-1.5 text-[0.72rem] text-faint">
                    <span>PU</span>
                    <input type="number" min={0} step="0.01" value={pxEdit[l.p.id] ?? String(l.p.prix)} onChange={(e) => setPxEdit((o) => ({ ...o, [l.p.id]: e.target.value }))} onFocus={(e) => e.currentTarget.select()} className={inputCls + " !w-20 !px-1.5 !py-0.5 text-right font-num !text-[0.78rem]"} title="Prix unitaire — modifiable pour cette vente" />
                    <span>$</span>
                    {pu(l.p) !== l.p.prix ? <span className="text-[0.62rem]" style={{ color: "var(--accent)" }}>(tarif {money(l.p.prix)})</span> : null}
                    <span className="ml-auto font-num text-[0.84rem] font-semibold text-ink">{money(pu(l.p) * l.n)}</span>
                  </div>
                </div>
              ); })}
            </div>
          )}
          {lignes.some((l) => !l.p.aLaDemande && l.n > l.p.stock) ? (
            <div className="mb-2 flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.72rem]" style={{ borderColor: "color-mix(in srgb,var(--oxblood) 40%,var(--border))", background: "color-mix(in srgb,var(--oxblood) 8%,transparent)", color: "var(--oxblood)" }}>
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Stock insuffisant pour {lignes.filter((l) => !l.p.aLaDemande && l.n > l.p.stock).map((l) => l.p.nom).join(", ")}. La vente reste possible (le stock tombera à 0).</span>
            </div>
          ) : null}
          <div className="flex flex-col gap-1 border-t border-border pt-2 text-[0.84rem]">
            <div className="flex justify-between text-faint"><span>Coût matières</span><span className="font-num">−{money(cout)}</span></div>
            <div className="flex justify-between"><span className="text-faint">Vente</span><span className="font-num font-semibold">{money(vente)}</span></div>
            <div className="flex justify-between"><span className="font-semibold">Bénéfice</span><span className="font-num font-bold" style={{ color: "var(--good)" }}>{money(benefice)}</span></div>
          </div>
          <div className="mt-2.5 flex flex-col gap-2">
            {clients.length ? (
              <select className={inputCls} value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Client de passage…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.nom}{c.carteIdentite ? " 📇" : ""}</option>)}
              </select>
            ) : null}
            {!clientId ? <input className={inputCls} value={client} onChange={(e) => setClient(e.target.value)} placeholder="Nom du client de passage — optionnel" maxLength={120} /> : null}
            {clientId ? <p className="text-[0.7rem] text-faint">📇 Client fiché — sa carte d&apos;identité &amp; son télégramme seront joints au registre.</p> : null}
            <div>
              <input className={inputCls} value={serie} onChange={(e) => setSerie(e.target.value)} placeholder="N° de série de l'arme — optionnel" maxLength={60} />
              <div className="mt-1">
                <PhotoDrop dossier="armurerie-series" onUploaded={onSeriePhoto} compact label="Ou glisse une photo du n° de série — l'IA le lit" />
                {serieLisant ? <div className="mt-1 flex items-center gap-1.5 text-[0.7rem] text-faint"><Loader2 className="h-3 w-3 animate-spin" /> Lecture du numéro…</div> : null}
                {serieLu && !serieLisant ? <div className="mt-1 text-[0.7rem]" style={{ color: serieLu.startsWith("🔫") ? "var(--good)" : "var(--oxblood)" }}>{serieLu}</div> : null}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[0.66rem] uppercase tracking-[0.05em] text-faint">Carte d&apos;identité / photo — l&apos;IA remplit le nom</div>
              {photo ? (
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo} alt="Acquéreur" className="h-14 w-14 rounded-[8px] border border-border object-cover" />
                  <button onClick={() => { setPhoto(""); setLu(null); }} className="text-[0.72rem] text-faint hover:text-ink">Retirer</button>
                </div>
              ) : (
                <PhotoDrop dossier="armurerie-ventes" onUploaded={onPhoto} compact label="Glisse la carte d'identité — le nom se remplit tout seul" />
              )}
              {lisant ? <div className="mt-1 flex items-center gap-1.5 text-[0.7rem] text-faint"><Loader2 className="h-3 w-3 animate-spin" /> Lecture de la carte…</div> : null}
              {lu && !lisant ? <div className="mt-1 text-[0.7rem]" style={{ color: lu.startsWith("📇") ? "var(--good)" : "var(--oxblood)" }}>{lu}</div> : null}
            </div>
            <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes — optionnel" maxLength={200} />
            <button onClick={valider} disabled={busy || !lignes.length} className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-[0.86rem] font-semibold text-black/85 disabled:opacity-50" style={{ background: "var(--good)" }}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Encaisser {money(vente)}
            </button>
          </div>
        </div>
      </div>
      {factureOpen && factureSnap ? <FactureModal ventes={factureSnap} onClose={() => setFactureOpen(false)} /> : null}
    </div>
  );
}

// ═══════════════════ PRODUITS (catalogue) ═══════════════════
const CAT_ORDRE = ["Armes", "Accessoires", "Munitions", "Composants", "Ressources"];
// Sous-catégorisation des ARMES par type (regroupe fusils avec fusils, etc.).
const SOUS_ORDRE_ARMES = ["Revolvers", "Pistolets", "Carabines", "Fusils", "Couteaux & haches", "Arcs", "Autres"];
function sousTypeArme(nom: string): string {
  const n = nom.toLowerCase();
  if (n.includes("revolver")) return "Revolvers";
  if (n.includes("pistolet")) return "Pistolets";
  if (n.includes("carabine")) return "Carabines";
  if (n.includes("fusil") || n.includes("canon sci") || n.includes("pompe")) return "Fusils";
  if (n.includes("couteau") || n.includes("machette") || n.includes("hachette") || n.includes("hache")) return "Couteaux & haches";
  if (n.includes("arc")) return "Arcs";
  return "Autres";
}
const SEUIL_BAS = 3;   // stock ≤ ce seuil = « stock bas »
const CIBLE_REASSORT = 5;   // niveau visé lors d'un réassort
function ProduitsTab({ produits, ressources, router }: { produits: ArmProduit[]; ressources: ArmRessource[]; router: Router }) {
  const [sel, setSel] = useState<ArmProduit | null>(null);
  const [nouveau, setNouveau] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [override, setOverride] = useState<Record<string, number>>({});
  const [qbusy, setQbusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [reassort, setReassort] = useState(false);
  const query = q.trim().toLowerCase();
  const cats = [...new Set(produits.map((p) => p.categorie))].sort((a, b) => { const ia = CAT_ORDRE.indexOf(a), ib = CAT_ORDRE.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b); });
  const toutOuvert = cats.length > 0 && cats.every((c) => open[c]);

  // Alertes de stock + réassort suggéré (d'après les recettes).
  // « Rupture » ne veut PLUS dire « 0 en stock » : un article qu'on peut fabriquer
  // avec les ressources en main n'est pas en rupture. On ne compte en rupture que ce
  // qu'on ne peut ni avoir en stock ni fabriquer maintenant.
  const stockDe = (p: ArmProduit) => override[p.id] ?? p.stock;
  const fabDe = (p: ArmProduit) => fabricableDe(p, ressources) ?? 0;
  const enRupture = produits.filter((p) => !p.aLaDemande && stockDe(p) === 0 && fabDe(p) === 0);
  const enBas = produits.filter((p) => !p.aLaDemande && stockDe(p) > 0 && stockDe(p) <= SEUIL_BAS && fabDe(p) === 0);
  const fabricablesN = produits.filter((p) => !p.aLaDemande && fabDe(p) > 0).length; // vendables via fabrication
  const ingredientsReassort = (() => {
    const m = new Map<string, { nom: string; qte: number }>();
    for (const p of [...enRupture, ...enBas]) {
      if (!p.recette || !p.recette.length) continue;
      const manque = Math.max(0, CIBLE_REASSORT - stockDe(p));
      if (!manque) continue;
      for (const l of p.recette) { if (!l.ingredient.trim() || !l.qte) continue; const k = _normIng(l.ingredient); const cur = m.get(k) || { nom: l.ingredient, qte: 0 }; cur.qte += l.qte * manque; m.set(k, cur); }
    }
    return [...m.values()].sort((a, b) => b.qte - a.qte);
  })();
  const coutReassort = ingredientsReassort.reduce((s2, l) => { const px = prixIngredient(l.nom, ressources); return s2 + (px == null ? 0 : px * l.qte); }, 0);

  async function importer() { setBusy("cat"); const r = await importerCatalogue(); setBusy(null); if (r.ok) { setFlash(r.n ? `${r.n} produit(s) ajouté(s).` : "Catalogue déjà à jour."); router.refresh(); } else setFlash(r.error || "Échec."); }
  async function importerRec() { setBusy("rec"); const r = await importerRecettes(); setBusy(null); if (r.ok) { setFlash(`${r.n ?? 0} recettes appliquées aux produits.`); router.refresh(); } else setFlash(r.error || "Échec."); }
  // Ajustement rapide de la quantité en stock (optimiste ; +/− ou ±10).
  async function ajusterStock(p: ArmProduit, delta: number) {
    const courant = override[p.id] ?? p.stock;
    const suivant = Math.max(0, courant + delta);
    if (suivant === courant) return;
    setOverride((o) => ({ ...o, [p.id]: suivant }));
    setQbusy(p.id);
    const r = await majProduit(p.id, { stock: suivant });
    setQbusy(null);
    if (!r.ok) { setOverride((o) => ({ ...o, [p.id]: courant })); setFlash(r.error || "Échec."); return; }
    router.refresh();
  }

  // Une ligne produit (nom + niveau, stepper de stock, prix & marge/fourchette).
  function carte(p: ArmProduit) {
    const stock = override[p.id] ?? p.stock;
    const fab = fabricableDe(p, ressources) ?? 0;         // fabricable maintenant depuis les ressources
    const dispo = p.aLaDemande || stock > 0 || fab > 0;   // vendable maintenant (stock OU fabricable)
    const rec = p.recette && p.recette.length ? coutRecette(p.recette, ressources) : null;
    const marge = rec ? p.prix - rec.cout : null;
    const stepBtn = "grid h-6 w-6 place-items-center rounded-md border border-border bg-surface hover:border-border-2 disabled:opacity-40";
    return (
      <div key={p.id} className="flex items-center gap-3 rounded-[10px] border border-border bg-surface-2 px-3.5 py-2.5 transition hover:border-border-2">
        <button onClick={() => setSel(p)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[0.88rem] font-semibold">{p.nom}</div>
            <div className="flex items-center gap-1.5 text-[0.66rem] text-faint">
              {rec ? <span>🔨 craft {money(rec.cout)}{rec.manquants.length ? " +" : ""}</span> : p.cout ? <span>coût {money(p.cout)}</span> : null}
              {p.aLaDemande ? null
                : fab > 0 ? <span className="rounded px-1 font-semibold" style={{ color: "var(--good)", background: "color-mix(in srgb,var(--good) 14%,transparent)" }} title="Fabricable maintenant avec les ressources en stock">🔨 ×{fab} fabricable</span>
                : stock === 0 ? <span className="rounded px-1 font-semibold" style={{ color: "var(--oxblood)", background: "color-mix(in srgb,var(--oxblood) 15%,transparent)" }} title="Ni en stock, ni fabricable (ressources manquantes)">rupture</span>
                : stock <= SEUIL_BAS ? <span className="rounded px-1 font-semibold" style={{ color: "var(--warn)", background: "color-mix(in srgb,var(--warn) 16%,transparent)" }}>stock bas</span>
                : null}
            </div>
          </div>
          <span className="hidden shrink-0 rounded-full border border-border px-2 py-0.5 text-[0.66rem] text-muted sm:inline">Niveau {p.niveau}</span>
        </button>
        {p.aLaDemande ? (
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[0.66rem] font-semibold" style={{ color: "var(--good)", background: "color-mix(in srgb,var(--good) 14%,transparent)" }}>à la demande</span>
        ) : (
          <div className="flex shrink-0 items-center gap-1.5">
            <button title="−10" onClick={() => ajusterStock(p, -10)} disabled={qbusy === p.id} className={`${stepBtn} hidden sm:grid`}><span className="text-[0.62rem] font-bold leading-none">−10</span></button>
            <button title="Retirer 1" onClick={() => ajusterStock(p, -1)} disabled={qbusy === p.id} className={stepBtn}><Minus className="h-3.5 w-3.5" /></button>
            <span className="w-9 text-center font-num text-[0.95rem] font-bold tabular-nums" style={{ color: stock > 0 ? "var(--good)" : dispo ? "var(--muted)" : "var(--oxblood)" }}>{qbusy === p.id ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : stock}</span>
            <button title="Ajouter 1" onClick={() => ajusterStock(p, 1)} disabled={qbusy === p.id} className={stepBtn}><Plus className="h-3.5 w-3.5" /></button>
            <button title="+10" onClick={() => ajusterStock(p, 10)} disabled={qbusy === p.id} className={`${stepBtn} hidden sm:grid`}><span className="text-[0.62rem] font-bold leading-none">+10</span></button>
          </div>
        )}
        <button onClick={() => setSel(p)} className="hidden shrink-0 items-center gap-3 text-right sm:flex">
          <div><div className="text-[0.58rem] uppercase tracking-[0.05em] text-faint">Prix de vente</div><div className="font-num text-[0.9rem] font-bold" style={{ color: "var(--accent)" }}>{money(p.prix)}</div></div>
          {rec ? (
            <div className="hidden text-right md:block"><div className="text-[0.58rem] uppercase tracking-[0.05em] text-faint">Marge{rec.manquants.length ? "*" : ""}</div><div className="font-num text-[0.82rem] font-semibold" style={{ color: (marge ?? 0) >= 0 ? "var(--good)" : "var(--oxblood)" }}>{money(marge ?? 0)}</div></div>
          ) : (
            <div className="hidden text-right md:block"><div className="text-[0.58rem] uppercase tracking-[0.05em] text-faint">Fourchette ±5%</div><div className="font-num text-[0.72rem] text-muted">{money(fourchette(p.prix)[0])} → {money(fourchette(p.prix)[1])}</div></div>
          )}
        </button>
      </div>
    );
  }

  // Corps d'une catégorie : pour « Armes », on sous-groupe par type (Revolvers,
  // Pistolets, Carabines, Fusils…) ; sinon liste simple.
  function corpsCategorie(cat: string, shown: ArmProduit[]) {
    if (cat !== "Armes") return shown.map((p) => carte(p));
    const groupes: Record<string, ArmProduit[]> = {};
    shown.forEach((p) => { const st = sousTypeArme(p.nom); (groupes[st] = groupes[st] || []).push(p); });
    const keys = Object.keys(groupes).sort((a, b) => SOUS_ORDRE_ARMES.indexOf(a) - SOUS_ORDRE_ARMES.indexOf(b));
    if (keys.length <= 1) return shown.map((p) => carte(p));
    return keys.map((k) => (
      <div key={k} className="flex flex-col gap-2">
        <div className="mt-1 flex items-center gap-1.5 px-0.5 text-[0.64rem] font-semibold uppercase tracking-[0.09em] text-faint">{k}<span className="rounded-full bg-surface-2 px-1.5 py-0.5">{groupes[k].length}</span></div>
        {groupes[k].map((p) => carte(p))}
      </div>
    ));
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap justify-end gap-2">
        {flash ? <div className="mr-auto"><Flash>{flash}</Flash></div> : null}
        <button onClick={importer} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold hover:border-border-2 disabled:opacity-60">{busy === "cat" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} {produits.length === 0 ? "Importer le catalogue type" : "Compléter le catalogue"}</button>
        {produits.length > 0 ? <button onClick={importerRec} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold hover:border-border-2 disabled:opacity-60">{busy === "rec" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Hammer className="h-3.5 w-3.5" />} Importer les recettes</button> : null}
        <button onClick={() => setNouveau(true)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Plus className="h-3.5 w-3.5" /> Nouveau produit</button>
      </div>
      {produits.length === 0 ? (
        <Vide icon={Package} texte="Aucun produit. Importe le catalogue type (armes & munitions RDR2) ou ajoute tes produits — ils alimenteront la Caisse." />
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <div className="relative flex-1"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" /><input className={inputCls + " pl-8"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un produit dans le stock…" /></div>
            <button onClick={() => setOpen(toutOuvert ? {} : Object.fromEntries(cats.map((c) => [c, true])))} className="shrink-0 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.74rem] font-semibold text-muted hover:border-border-2">{toutOuvert ? "Tout replier" : "Tout déplier"}</button>
          </div>
          {enRupture.length || enBas.length ? (
            <div className="rounded-[12px] border px-3 py-2.5" style={{ borderColor: "color-mix(in srgb,var(--warn) 40%,var(--border))", background: "color-mix(in srgb,var(--warn) 8%,transparent)" }}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.78rem]">
                <span className="inline-flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-4 w-4" style={{ color: "var(--warn)" }} /> Stock à surveiller</span>
                {fabricablesN ? <span style={{ color: "var(--good)" }}>🔨 <b>{fabricablesN}</b> fabricables maintenant</span> : null}
                {enRupture.length ? <span style={{ color: "var(--oxblood)" }} title="Ni en stock, ni fabricable (ressources manquantes)"><b>{enRupture.length}</b> en rupture</span> : null}
                {enBas.length ? <span style={{ color: "var(--warn)" }}><b>{enBas.length}</b> en stock bas (≤ {SEUIL_BAS})</span> : null}
                {ingredientsReassort.length ? <button onClick={() => setReassort((v) => !v)} className="ml-auto rounded-lg border border-border bg-surface px-2 py-1 text-[0.72rem] font-semibold hover:border-border-2">{reassort ? "Masquer le réassort" : "Réassort suggéré"}</button> : null}
              </div>
              {reassort && ingredientsReassort.length ? (
                <div className="mt-2 border-t border-border pt-2">
                  <div className="mb-1.5 text-[0.7rem] text-faint">Ressources à fabriquer pour remonter les articles concernés à {CIBLE_REASSORT} u. (d&apos;après les recettes) :</div>
                  <div className="flex flex-wrap gap-1.5">
                    {ingredientsReassort.map((l) => { const px = prixIngredient(l.nom, ressources); return <span key={l.nom} className="rounded-full border border-border bg-surface px-2 py-0.5 text-[0.72rem]"><b className="font-num">{l.qte}</b> {l.nom}<span className="text-faint"> · {px == null ? "prix ?" : money(px * l.qte)}</span></span>; })}
                  </div>
                  <div className="mt-1.5 text-[0.74rem]">Coût estimé du réassort : <b className="font-num" style={{ color: "var(--accent)" }}>{money(coutReassort)}</b></div>
                </div>
              ) : null}
            </div>
          ) : null}
          {cats.map((cat) => {
            const items = produits.filter((p) => p.categorie === cat);
            const shown = query ? items.filter((p) => p.nom.toLowerCase().includes(query)) : items;
            if (query && shown.length === 0) return null;
            const ouvert = query ? true : !!open[cat];
            const totalStock = items.reduce((s2, p) => s2 + (p.aLaDemande ? 0 : (override[p.id] ?? p.stock)), 0);
            const totalFab = items.reduce((s2, p) => s2 + Math.max(0, fabricableDe(p, ressources) ?? 0), 0);
            const catRupture = items.some((p) => !p.aLaDemande && (override[p.id] ?? p.stock) === 0 && (fabricableDe(p, ressources) ?? 0) === 0);
            return (
              <div key={cat} className="overflow-hidden rounded-[12px] border border-border bg-surface">
                <button onClick={() => { if (!query) setOpen((o) => ({ ...o, [cat]: !o[cat] })); }} className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition hover:bg-surface-2">
                  <ChevronDown className={"h-4 w-4 shrink-0 text-faint transition-transform " + (ouvert ? "" : "-rotate-90")} strokeWidth={2} />
                  <span className="text-[0.82rem] font-semibold uppercase tracking-[0.05em]">{cat}</span>
                  {catRupture ? <span title="Articles en rupture" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--oxblood)" }} /> : null}
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.64rem] font-semibold text-faint">{query ? `${shown.length}/${items.length}` : items.length} réf.</span>
                  <span className="ml-auto text-[0.68rem] text-faint"><b className="font-num text-muted">{totalStock}</b> en stock{totalFab ? <> · <b className="font-num" style={{ color: "var(--good)" }}>{totalFab}</b> fabricable</> : null}</span>
                </button>
                {ouvert ? <div className="flex flex-col gap-2 border-t border-border p-2.5">{corpsCategorie(cat, shown)}</div> : null}
              </div>
            );
          })}
        </div>
      )}
      {nouveau ? <ProduitModal ressources={ressources} onClose={() => setNouveau(false)} router={router} /> : null}
      {sel ? <ProduitModal key={sel.id} produit={sel} ressources={ressources} onClose={() => setSel(null)} router={router} /> : null}
    </>
  );
}

function ProduitModal({ produit, ressources, onClose, router }: { produit?: ArmProduit; ressources: ArmRessource[]; onClose: () => void; router: Router }) {
  const editing = !!produit;
  const [nom, setNom] = useState(produit?.nom || "");
  const [categorie, setCategorie] = useState(produit?.categorie || "Divers");
  const [prix, setPrix] = useState(produit ? String(produit.prix) : "");
  const [cout, setCout] = useState(produit ? String(produit.cout) : "");
  const [stock, setStock] = useState(produit ? String(produit.stock) : "");
  const [niveau, setNiveau] = useState(produit ? String(produit.niveau) : "0");
  const [aLaDemande, setALaDemande] = useState(!!produit?.aLaDemande);
  const [recette, setRecette] = useState<ArmRecetteLigne[]>(produit?.recette?.length ? produit.recette : []);
  const [qteFab, setQteFab] = useState("1");
  const [fabResult, setFabResult] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const recetteValide = recette.filter((l) => l.ingredient.trim() && l.qte);
  const { cout: coutCraft, manquants } = coutRecette(recetteValide, ressources);
  const marge = (Number(prix) || 0) - coutCraft;
  const qFab = Math.max(0, Math.round(Number(qteFab) || 0));
  const setLigneR = (i: number, patch: Partial<ArmRecetteLigne>) => setRecette((ls) => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const addLigneR = () => setRecette((ls) => [...ls, { ingredient: "", qte: 1 }]);
  const delLigneR = (i: number) => setRecette((ls) => ls.filter((_, idx) => idx !== i));

  async function enregistrer() {
    setErr(null);
    if (nom.trim().length < 1) { setErr("Nom du produit requis."); return; }
    setBusy("save");
    const data = { nom, categorie, prix: Number(prix) || 0, cout: Number(cout) || 0, stock: Number(stock) || 0, aLaDemande, niveau: Number(niveau) || 0, recette: recette.filter((l) => l.ingredient.trim() && l.qte) };
    const r = editing ? await majProduit(produit!.id, data) : await creerProduit(data);
    setBusy(null);
    if (!r.ok) { setErr(r.error || "Impossible."); return; }
    router.refresh(); onClose();
  }
  async function supprimer() { setBusy("del"); const r = await supprimerProduit(produit!.id); setBusy(null); if (!r.ok) { setErr(r.error || "Échec."); return; } router.refresh(); onClose(); }
  async function fabriquer() {
    if (!produit || qFab < 1) return;
    setBusy("fab"); setFabResult(null);
    const r = await fabriquerProduit(produit.id, qFab);
    setBusy(null);
    if (!r.ok) { setFabResult("❌ " + (r.error || "Échec.")); return; }
    const parts = [`✅ ${r.q} ${produit.nom} ajouté(s) au stock.`];
    if (r.consommes?.length) parts.push(`Consommé : ${r.consommes.join(", ")}.`);
    if (r.manques?.length) parts.push(`⚠️ Stock ressource insuffisant : ${r.manques.join(", ")}.`);
    if (r.ignores?.length) parts.push(`Non déduit (ressource sans stock/inconnue) : ${r.ignores.join(", ")}.`);
    setFabResult(parts.join(" "));
    router.refresh();
  }

  return (
    <Modal titre={editing ? produit!.nom : "📦 Nouveau produit"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Nom *"><input className={inputCls} value={nom} onChange={(e) => setNom(e.target.value)} maxLength={120} autoFocus /></Champ>
          <Champ label="Catégorie"><input className={inputCls} value={categorie} onChange={(e) => setCategorie(e.target.value)} placeholder="Revolvers, Munitions…" maxLength={60} /></Champ>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Prix de vente ($)"><input className={inputCls} type="number" min={0} step="0.01" value={prix} onChange={(e) => setPrix(e.target.value)} /></Champ>
          <Champ label="Niveau de craft"><select className={inputCls} value={niveau} onChange={(e) => setNiveau(e.target.value)}>{[0, 1, 2, 3].map((n) => <option key={n} value={n}>Niveau {n}</option>)}</select></Champ>
        </div>
        {prix ? <p className="text-[0.74rem] text-faint">Fourchette ±5% : <b className="font-num text-muted">{money(fourchette(Number(prix) || 0)[0])} → {money(fourchette(Number(prix) || 0)[1])}</b></p> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Coût matières ($)"><input className={inputCls} type="number" min={0} step="0.01" value={cout} onChange={(e) => setCout(e.target.value)} /></Champ>
          <Champ label="Stock (craftables)"><input className={inputCls} type="number" min={0} value={stock} onChange={(e) => setStock(e.target.value)} disabled={aLaDemande} /></Champ>
        </div>
        <label className="inline-flex items-center gap-2 text-[0.82rem]">
          <input type="checkbox" checked={aLaDemande} onChange={(e) => setALaDemande(e.target.checked)} /> Produit « à la demande » (pas de stock décompté)
        </label>

        {/* Recette de craft */}
        <div className="rounded-[10px] border border-border bg-surface-2 p-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.05em] text-muted"><Hammer className="h-3.5 w-3.5" /> Recette de fabrication</div>
          {recette.length === 0 ? <p className="py-1 text-[0.74rem] text-faint">Aucune recette. Ajoute les ingrédients (bois, pièce d&apos;arme, charbon, lingot fer…).</p> : (
            <div className="flex flex-col gap-1.5">
              {recette.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_58px_28px] items-center gap-2">
                  <input className={inputCls + " !px-2 !py-1.5"} value={l.ingredient} onChange={(e) => setLigneR(i, { ingredient: e.target.value })} placeholder="Ingrédient…" maxLength={80} list="arm-ressources" />
                  <input className={inputCls + " !px-1.5 !py-1.5 text-center"} type="number" min={0} value={l.qte || ""} onChange={(e) => setLigneR(i, { qte: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                  <button onClick={() => delLigneR(i)} className="grid h-6 w-6 place-items-center rounded text-faint hover:text-ink" title="Retirer"><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
          <datalist id="arm-ressources">{ressources.map((r) => <option key={r.id} value={r.nom} />)}</datalist>
          <button onClick={addLigneR} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-[0.74rem] font-semibold text-muted hover:border-border-2 hover:text-ink"><Plus className="h-3.5 w-3.5" /> Ajouter un ingrédient</button>
          {recetteValide.length ? (
            <div className="mt-2 flex flex-col gap-0.5 border-t border-border pt-2 text-[0.82rem]">
              <div className="flex justify-between text-faint"><span>Coût de fabrication (1 u.)</span><span className="font-num">{money(coutCraft)}{manquants.length ? " +" : ""}</span></div>
              <div className="flex justify-between"><span className="font-semibold">Marge (prix − coût)</span><span className="font-num font-bold" style={{ color: marge >= 0 ? "var(--good)" : "var(--oxblood)" }}>{money(marge)}</span></div>
              {manquants.length ? <p className="text-[0.68rem] text-faint">⚠️ Prix manquant pour : {manquants.join(", ")} — ajoute-les dans l&apos;onglet Ressources pour un coût exact.</p> : null}
            </div>
          ) : null}
          {/* Calculateur : ressources & coût exacts pour une quantité à fabriquer */}
          {recetteValide.length ? (
            <div className="mt-2 rounded-[8px] border border-border bg-surface p-2.5">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[0.72rem] font-semibold uppercase tracking-[0.05em] text-muted">🧮 Fabriquer une quantité</span>
                <label className="flex items-center gap-1.5 text-[0.74rem] text-faint">Quantité
                  <input className={inputCls + " !w-16 !px-1.5 !py-1 text-center font-num"} type="number" min={0} value={qteFab} onChange={(e) => setQteFab(e.target.value)} onFocus={(e) => e.currentTarget.select()} />
                </label>
              </div>
              {qFab > 0 ? (
                <>
                  <div className="flex flex-col gap-1">
                    {recetteValide.map((l, i) => { const total = l.qte * qFab; const px = prixIngredient(l.ingredient, ressources); return (
                      <div key={i} className="flex items-center gap-2 text-[0.78rem]">
                        <span className="min-w-0 flex-1 truncate">{l.ingredient}</span>
                        <span className="font-num text-faint">{l.qte}×{qFab} =</span>
                        <span className="w-10 shrink-0 text-right font-num font-semibold">{total}</span>
                        <span className="w-20 shrink-0 text-right font-num" style={{ color: px == null ? "var(--faint)" : "var(--muted)" }}>{px == null ? "prix ?" : money(px * total)}</span>
                      </div>
                    ); })}
                  </div>
                  <div className="mt-1.5 flex items-center justify-between border-t border-border pt-1.5 text-[0.86rem]">
                    <span className="font-semibold">Coût total — {qFab} u.</span>
                    <span className="font-num text-[1rem] font-bold" style={{ color: "var(--accent)" }}>{money(coutCraft * qFab)}{manquants.length ? " +" : ""}</span>
                  </div>
                  {manquants.length ? <p className="mt-0.5 text-[0.66rem] text-faint">+ prix inconnu pour {manquants.join(", ")} — renseigne-les dans Ressources pour un total exact.</p> : null}
                  {editing ? (
                    <button onClick={fabriquer} disabled={busy === "fab"} className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-50" style={{ background: "var(--good)" }}>{busy === "fab" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Hammer className="h-3.5 w-3.5" />} Fabriquer {qFab} — déduit les ressources, +{qFab} au stock</button>
                  ) : <p className="mt-2 text-center text-[0.68rem] text-faint">Enregistre d&apos;abord le produit pour pouvoir le fabriquer.</p>}
                  {fabResult ? <p className="mt-1.5 text-[0.72rem] leading-relaxed" style={{ color: fabResult.startsWith("❌") ? "var(--oxblood)" : "var(--muted)" }}>{fabResult}</p> : null}
                </>
              ) : <p className="py-1 text-center text-[0.74rem] text-faint">Indique une quantité.</p>}
            </div>
          ) : null}
        </div>

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
          <Champ label="Montant ($)"><input className={inputCls} type="number" min={0} step="0.01" value={montant} onChange={(e) => setMontant(e.target.value)} autoFocus /></Champ>
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
function ClientsTab({ clients, ventes, contrats, router }: { clients: ArmClient[]; ventes: ArmVente[]; contrats: ArmContrat[]; router: Router }) {
  const [sel, setSel] = useState<ArmClient | null>(null);
  const [nouveau, setNouveau] = useState(false);
  const [prefill, setPrefill] = useState<{ nom?: string; notes?: string; carte?: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [scanTone, setScanTone] = useState<"ok" | "new" | "err">("ok");
  const [q, setQ] = useState("");

  // Scan d'une pièce d'identité → retrouve le client fiché et ouvre son dossier complet
  // (mis à jour avec la nouvelle capture). Sinon, prépare une fiche pré-remplie.
  async function onScanCarte(url: string) {
    setScanning(true); setScanTone("ok"); setScanMsg("Lecture de la pièce d'identité…");
    const r = await lireCarteIdentite(url);
    setScanning(false);
    if (!r.ok) { setScanTone("err"); setScanMsg(r.error || "Lecture impossible."); return; }
    const nomComplet = `${r.prenom || ""} ${r.nom || ""}`.trim();
    if (!nomComplet) { setScanTone("err"); setScanMsg("Carte lue, mais nom non détecté — ajoute le client à la main."); return; }
    const found = matchNomClient(clients, nomComplet);
    if (found) {
      await majClient(found.id, { carteIdentite: url }); // met à jour sa capture
      setScanTone("ok"); setScanMsg(`Client retrouvé : ${found.nom} — dossier ouvert et mis à jour.`);
      setSel({ ...found, carteIdentite: url });
      router.refresh();
    } else {
      const extra = [r.dateNaissance ? `né(e) ${r.dateNaissance}` : "", r.residence ? `réside : ${r.residence}` : ""].filter(Boolean).join(" · ");
      setPrefill({ nom: nomComplet, notes: extra, carte: url });
      setScanTone("new"); setScanMsg(`Aucune fiche pour ${nomComplet} — nouvelle fiche pré-remplie.`);
      setNouveau(true);
    }
  }

  const filtre = q.trim().toLowerCase();
  const liste = filtre ? clients.filter((c) => (c.nom + " " + (c.telegramme || "")).toLowerCase().includes(filtre)) : clients;

  return (
    <>
      {/* Scanner une pièce d'identité — retrouve le dossier du client */}
      <div className="mb-3 rounded-[12px] border border-border bg-surface-2 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[0.82rem] font-semibold"><IdCard className="h-4 w-4" style={{ color: "var(--accent)" }} /> Scanner une pièce d&apos;identité</div>
          <button onClick={() => { setPrefill(null); setNouveau(true); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[0.76rem] font-semibold hover:border-border-2"><Plus className="h-3.5 w-3.5" /> Nouveau client</button>
        </div>
        <p className="mb-2 text-[0.74rem] text-faint">Glisse la carte : si la personne a déjà acheté chez nous, son <b>dossier complet s&apos;ouvre</b> et se met à jour. Sinon, une fiche pré-remplie est créée. Chaque achat reste rangé par facture &amp; date.</p>
        <PhotoDrop dossier="armurerie-cni" onUploaded={onScanCarte} compact label={scanning ? "Lecture en cours…" : "Glisser la pièce d'identité — l'IA la lit et retrouve le client"} />
        {scanMsg ? <p className="mt-2 text-[0.78rem]" style={{ color: scanTone === "err" ? "var(--oxblood)" : scanTone === "new" ? "var(--brass)" : "var(--good)" }}>{scanMsg}</p> : null}
      </div>

      {clients.length === 0 ? (
        <Vide icon={Users} texte="Aucun client fiché. Scanne une pièce d'identité ou ajoute un client — tu pourras ranger sa carte et retrouver ses achats." />
      ) : (
        <>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <input className={inputCls + " pl-8"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un client…" />
          </div>
          {liste.length === 0 ? <Vide icon={Users} texte="Aucun client ne correspond à ta recherche." /> : (
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {liste.map((c) => {
              const nAchats = ventes.filter((v) => v.clientId === c.id).length;
              return (
              <button key={c.id} onClick={() => setSel(c)} className="flex items-center gap-3 rounded-[12px] border border-border bg-surface-2 px-3 py-2.5 text-left transition hover:-translate-y-0.5 hover:border-border-2">
                {c.carteIdentite ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.carteIdentite} alt="CNI" className="h-11 w-11 shrink-0 rounded-[8px] border border-border object-cover" />
                ) : (
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[8px] border border-dashed border-border text-faint"><IdCard className="h-5 w-5" /></span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[0.88rem] font-semibold">{c.nom}</div>
                  <div className="truncate text-[0.72rem] text-faint">{c.telegramme ? `☎ ${c.telegramme}` : "Pas de télégramme"}{nAchats ? ` · ${nAchats} achat${nAchats > 1 ? "s" : ""}` : ""}</div>
                </div>
                <Badge tone={clientTone(c.statut)}>{STATUTS_CLIENT.find((s) => s.key === c.statut)?.label || c.statut}</Badge>
              </button>
              );
            })}
          </div>
          )}
        </>
      )}
      {nouveau ? <ClientModal prefill={prefill || undefined} contrats={contrats} onClose={() => { setNouveau(false); setPrefill(null); }} router={router} /> : null}
      {sel ? <ClientModal key={sel.id} client={sel} achats={ventes.filter((v) => v.clientId === sel.id)} contrats={contrats} onClose={() => setSel(null)} router={router} /> : null}
    </>
  );
}

function ClientModal({ client, achats = [], contrats = [], onClose, router, prefill }: { client?: ArmClient; achats?: ArmVente[]; contrats?: ArmContrat[]; onClose: () => void; router: Router; prefill?: { nom?: string; notes?: string; carte?: string } }) {
  const editing = !!client;
  const [nom, setNom] = useState(client?.nom || prefill?.nom || "");
  const [telegramme, setTelegramme] = useState(client?.telegramme || "");
  const [discordId, setDiscordId] = useState(client?.discordId || "");
  const [statut, setStatut] = useState(client?.statut || "actif");
  const [notes, setNotes] = useState(client?.notes || prefill?.notes || "");
  const [carte, setCarte] = useState<string | null>(client?.carteIdentite || prefill?.carte || null);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [facture, setFacture] = useState<ArmVente[] | null>(null);
  const [dossierOpen, setDossierOpen] = useState(false);
  // Regroupe les achats par facture (ticket) — un règlement = une facture.
  const transactions = (() => {
    const m = new Map<string, ArmVente[]>();
    for (const a of achats) { const k = a.ticket || a.id; (m.get(k) || m.set(k, []).get(k)!).push(a); }
    return [...m.values()].sort((a, b) => (b[0].createdAt || "").localeCompare(a[0].createdAt || ""));
  })();
  // Fidélité : total dépensé, nb de factures, dernier achat, contrats du client.
  const totalDepense = achats.reduce((s, a) => s + a.prix, 0);
  const dernierAchat = transactions[0]?.[0]?.dateVente || null;
  const fidele = transactions.length >= 3 || totalDepense >= 500;
  const contratsClient = editing ? contrats.filter((c) => c.clientId === client!.id) : [];

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
    <>
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

        {editing && (achats.length || contratsClient.length) ? (
          <div className="flex flex-col gap-2 border-t border-border pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Fidélité</span>
              {fidele ? <Badge tone="accent">★ Client fidèle</Badge> : null}
              <button onClick={() => setDossierOpen(true)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-[0.72rem] font-semibold hover:border-border-2"><Download className="h-3.5 w-3.5" /> Imprimer le dossier</button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <StatMini label="Total dépensé" valeur={money(totalDepense)} tone="var(--accent)" />
              <StatMini label="Factures" valeur={String(transactions.length)} tone="var(--ink)" />
              <StatMini label="Dernier achat" valeur={dernierAchat || "—"} tone="var(--ink)" />
            </div>
            {contratsClient.length ? (
              <div className="flex flex-col gap-1">
                <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Contrats ({contratsClient.length})</span>
                {contratsClient.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 rounded-[8px] border border-border bg-surface-2 px-2.5 py-1.5 text-[0.78rem]">
                    <span className="min-w-0 truncate">{c.arme || "Arme"}{c.numeroSerie ? <span className="mono text-faint"> · {c.numeroSerie}</span> : null}</span>
                    <span className="flex shrink-0 items-center gap-2"><span className="font-num">{money(c.prix)}</span><Badge tone="muted">{c.statut}</Badge></span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {editing && transactions.length ? (
          <div className="flex flex-col gap-2 border-t border-border pt-2">
            <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Factures &amp; achats ({transactions.length})</span>
            {transactions.map((t) => {
              const tot = t.reduce((s, a) => s + a.prix, 0);
              return (
                <div key={t[0].ticket || t[0].id} className="rounded-[10px] border border-border bg-surface-2 p-2.5">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[0.7rem] text-faint"><span className="mono">{t[0].ticket || `VTE-${t[0].id.slice(-6)}`}</span> · {t[0].dateVente}</span>
                    <button onClick={() => setFacture(t)} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-[0.7rem] font-semibold hover:border-border-2">🧾 Facture</button>
                  </div>
                  {t.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2 text-[0.78rem]">
                      <span className="min-w-0 truncate text-muted">{[a.marque, a.modele].filter(Boolean).join(" ") || "Arme"}{a.quantite > 1 ? <span className="font-num"> ×{a.quantite}</span> : null}{a.numeroSerie ? <> · <span className="mono text-faint">{a.numeroSerie}</span></> : null}</span>
                      <span className="shrink-0 font-num">{money(a.prix)}</span>
                    </div>
                  ))}
                  <div className="mt-1 flex justify-between border-t border-border pt-1 text-[0.78rem] font-semibold"><span>Total</span><span className="font-num" style={{ color: "var(--accent)" }}>{money(tot)}</span></div>
                </div>
              );
            })}
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
    {facture ? <FactureModal ventes={facture} client={client} onClose={() => setFacture(null)} /> : null}
    {dossierOpen && client ? <DossierClientModal client={client} transactions={transactions} contrats={contratsClient} totalDepense={totalDepense} onClose={() => setDossierOpen(false)} /> : null}
    </>
  );
}

// ═══════════════════ DOSSIER CLIENT (document imprimable) ═══════════════════
// Fiche complète : identité + carte + fidélité + tout l'historique (par facture/date) + contrats.
function DossierClientModal({ client, transactions, contrats, totalDepense, onClose }: { client: ArmClient; transactions: ArmVente[][]; contrats: ArmContrat[]; totalDepense: number; onClose: () => void }) {
  const nAchats = transactions.reduce((s, t) => s + t.length, 0);
  return (
    <Modal titre="🗂️ Dossier client" onClose={onClose} max={680}>
      <style>{`@media print{body *{visibility:hidden!important}#dossier-doc,#dossier-doc *{visibility:visible!important}#dossier-doc{position:fixed;inset:0;margin:0;padding:26px;overflow:auto}.no-print{display:none!important}}`}</style>
      <div id="dossier-doc" className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3 border-b-2 pb-2" style={{ borderColor: "var(--brass)" }}>
          <div>
            <div className="font-display text-[1.1rem] font-bold" style={{ color: "var(--brass)" }}>🐺 Iron Wolf Company</div>
            <div className="text-[0.72rem] text-muted">Armurerie de Van Horn — Bureau de Saint-Denis</div>
          </div>
          <div className="text-right">
            <div className="text-[0.66rem] uppercase tracking-[0.08em] text-faint">Dossier client</div>
            <div className="text-[0.72rem] text-muted">Édité le {new Date().toLocaleDateString("fr-FR")}</div>
          </div>
        </div>
        <div className="flex items-start gap-3">
          {client.carteIdentite ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={client.carteIdentite} alt="Carte d'identité" className="h-20 w-20 shrink-0 rounded-[8px] border border-border object-cover" />
          ) : null}
          <div className="min-w-0 text-[0.82rem]">
            <div className="text-[0.64rem] uppercase tracking-[0.05em] text-faint">Client</div>
            <div className="font-display text-[1.05rem] font-bold">{client.nom}</div>
            {client.telegramme ? <div className="text-[0.74rem] text-muted">Télégramme : {client.telegramme}</div> : null}
            <div className="text-[0.74rem] text-muted">Statut : {STATUTS_CLIENT.find((s) => s.key === client.statut)?.label || client.statut}</div>
            {client.notes ? <div className="mt-0.5 text-[0.72rem] text-faint">{client.notes}</div> : null}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <StatMini label="Total dépensé" valeur={money(totalDepense)} tone="var(--brass)" />
          <StatMini label="Factures" valeur={String(transactions.length)} tone="var(--ink)" />
          <StatMini label="Articles achetés" valeur={String(nAchats)} tone="var(--ink)" />
        </div>

        <div className="mt-1 text-[0.66rem] uppercase tracking-[0.05em] text-faint">Historique des achats</div>
        {transactions.length ? transactions.map((t) => {
          const tot = t.reduce((s, a) => s + a.prix, 0);
          return (
            <div key={t[0].ticket || t[0].id} className="rounded-[8px] border border-border p-2">
              <div className="mb-1 flex items-center justify-between text-[0.7rem] text-faint"><span className="mono">{t[0].ticket || `VTE-${t[0].id.slice(-6)}`}</span><span>{t[0].dateVente}</span></div>
              {t.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 text-[0.78rem]">
                  <span className="min-w-0 truncate">{[a.marque, a.modele].filter(Boolean).join(" ") || "Article"}{a.quantite > 1 ? <span className="font-num"> ×{a.quantite}</span> : null}{a.numeroSerie ? <span className="mono text-faint"> · N° {a.numeroSerie}</span> : null}</span>
                  <span className="shrink-0 font-num">{money(a.prix)}</span>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t border-border pt-1 text-[0.78rem] font-semibold"><span>Total facture</span><span className="font-num">{money(tot)}</span></div>
            </div>
          );
        }) : <p className="text-[0.78rem] italic text-faint">Aucun achat enregistré.</p>}

        {contrats.length ? (
          <>
            <div className="mt-1 text-[0.66rem] uppercase tracking-[0.05em] text-faint">Contrats</div>
            {contrats.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 rounded-[8px] border border-border px-2 py-1.5 text-[0.78rem]">
                <span className="min-w-0 truncate">{c.arme || "Arme"}{c.numeroSerie ? <span className="mono text-faint"> · {c.numeroSerie}</span> : null} — {c.statut}</span>
                <span className="shrink-0 font-num">{money(c.prix)}</span>
              </div>
            ))}
          </>
        ) : null}

        <p className="mt-2 text-center text-[0.62rem] italic text-faint">Dossier tenu par l&apos;Iron Wolf Company — Armurerie de Van Horn. « La force est dans l&apos;ombre. »</p>
      </div>
      <div className="no-print mt-3 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Fermer</button>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Download className="h-3.5 w-3.5" /> Imprimer / PDF</button>
      </div>
    </Modal>
  );
}

// ═══════════════════ FACTURE (document imprimable) ═══════════════════
// Regroupe les lignes d'un même règlement (même ticket) en une facture signée.
function FactureModal({ ventes, client, onClose }: { ventes: ArmVente[]; client?: ArmClient | null; onClose: () => void }) {
  if (!ventes.length) return null;
  const v0 = ventes[0];
  const total = ventes.reduce((s, v) => s + v.prix, 0);
  const photo = ventes.find((v) => v.photo)?.photo || client?.carteIdentite || null;
  const tel = ventes.find((v) => v.telegramme)?.telegramme || client?.telegramme || null;
  const notes = ventes.find((v) => v.notes)?.notes || "";
  const num = v0.ticket || `VTE-${v0.id.slice(-6)}`;
  return (
    <Modal titre="🧾 Facture" onClose={onClose} max={640}>
      <style>{`@media print{body *{visibility:hidden!important}#facture-doc,#facture-doc *{visibility:visible!important}#facture-doc{position:fixed;inset:0;margin:0;padding:26px}.no-print{display:none!important}}`}</style>
      <div id="facture-doc" className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3 border-b-2 pb-2" style={{ borderColor: "var(--brass)" }}>
          <div>
            <div className="font-display text-[1.1rem] font-bold" style={{ color: "var(--brass)" }}>🐺 Iron Wolf Company</div>
            <div className="text-[0.72rem] text-muted">Armurerie de Van Horn — Bureau de Saint-Denis</div>
          </div>
          <div className="text-right">
            <div className="text-[0.66rem] uppercase tracking-[0.08em] text-faint">Facture</div>
            <div className="mono text-[0.92rem] font-bold">{num}</div>
            <div className="text-[0.72rem] text-muted">{v0.dateVente}</div>
          </div>
        </div>
        <div className="flex items-start gap-3">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="Client" className="h-16 w-16 shrink-0 rounded-[8px] border border-border object-cover" />
          ) : null}
          <div className="min-w-0 text-[0.82rem]">
            <div className="text-[0.64rem] uppercase tracking-[0.05em] text-faint">Client</div>
            <div className="font-semibold">{v0.acquereur}</div>
            {tel ? <div className="text-[0.74rem] text-muted">Télégramme : {tel}</div> : null}
            {notes ? <div className="text-[0.72rem] text-faint">{notes}</div> : null}
          </div>
        </div>
        <table className="w-full border-collapse text-[0.82rem]">
          <thead><tr className="text-[0.6rem] uppercase tracking-[0.05em] text-faint">
            <th className="border-b border-border py-1 text-left font-semibold">Désignation</th>
            <th className="border-b border-border py-1 text-right font-semibold">Qté</th>
            <th className="border-b border-border py-1 text-right font-semibold">P.U.</th>
            <th className="border-b border-border py-1 text-right font-semibold">Total</th>
          </tr></thead>
          <tbody>
            {ventes.map((v) => (
              <tr key={v.id}>
                <td className="border-b border-border py-1.5">{[v.marque, v.modele].filter(Boolean).join(" ") || "Article"}{v.numeroSerie ? <div className="mono text-[0.68rem] text-faint">N° {v.numeroSerie}</div> : null}</td>
                <td className="border-b border-border py-1.5 text-right font-num tabular-nums">{v.quantite}</td>
                <td className="border-b border-border py-1.5 text-right font-num tabular-nums">{money(v.prixUnitaire)}</td>
                <td className="border-b border-border py-1.5 text-right font-num tabular-nums font-semibold">{money(v.prix)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t-2 pt-2 text-[0.98rem] font-bold" style={{ borderColor: "var(--brass)" }}>
          <span>Total réglé</span><span className="font-num" style={{ color: "var(--brass)" }}>{money(total)}</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-6 text-[0.72rem]">
          <div className="border-t border-border pt-1 text-center text-faint">Pour la Compagnie<div className="mt-5 font-display text-[0.95rem] italic text-ink">{v0.vendeur || "Iron Wolf Company"}</div></div>
          <div className="border-t border-border pt-1 text-center text-faint">Le Client<div className="mt-5 font-display text-[0.95rem] italic text-ink">{v0.acquereur}</div></div>
        </div>
        <p className="mt-1 text-center text-[0.62rem] italic text-faint">Facture établie et signée par l&apos;Iron Wolf Company. « La force est dans l&apos;ombre. »</p>
      </div>
      <div className="no-print mt-3 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Fermer</button>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Download className="h-3.5 w-3.5" /> Imprimer / PDF</button>
      </div>
    </Modal>
  );
}

// ═══════════════════ VENTES (registre officiel) ═══════════════════
function VentesTab({ ventes, clients, router }: { ventes: ArmVente[]; clients: ArmClient[]; router: Router }) {
  const [sel, setSel] = useState<ArmVente | null>(null);
  const [nouveau, setNouveau] = useState(false);
  const [facture, setFacture] = useState<ArmVente[] | null>(null);
  const cliById = new Map(clients.map((c) => [c.id, c]));
  const groupeDe = (v: ArmVente) => v.ticket ? ventes.filter((x) => x.ticket === v.ticket) : [v];

  // Top produits vendus (nombre de ventes + chiffre d'affaires).
  const top = (() => {
    const m = new Map<string, { nom: string; n: number; ca: number }>();
    for (const v of ventes) { const nom = v.marque || "—"; const k = nom.toLowerCase(); const cur = m.get(k) || { nom, n: 0, ca: 0 }; cur.n += 1; cur.ca += v.prix; m.set(k, cur); }
    return [...m.values()].sort((a, b) => b.n - a.n || b.ca - a.ca).slice(0, 5);
  })();
  const maxN = Math.max(...top.map((t) => t.n), 1);

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
      l.push(`  Quantité .......... ${v.quantite}${v.quantite > 1 ? ` × ${money(v.prixUnitaire)}` : ""}`);
      l.push(`  Total ............. ${money(v.prix)}`);
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
       <div className="flex flex-col gap-3">
        {top.length ? (
          <div className="rounded-[12px] border border-border bg-surface-2 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-muted"><TrendingUp className="h-4 w-4" style={{ color: "var(--accent)" }} /> Top produits vendus</div>
            <div className="flex flex-col gap-1.5">
              {top.map((t) => (
                <div key={t.nom} className="flex items-center gap-2 text-[0.78rem]">
                  <span className="w-32 shrink-0 truncate sm:w-44">{t.nom}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full" style={{ width: `${Math.max(6, (t.n / maxN) * 100)}%`, background: "var(--accent)" }} /></div>
                  <span className="w-8 shrink-0 text-right font-num text-muted">{t.n}×</span>
                  <span className="w-20 shrink-0 text-right font-num font-semibold" style={{ color: "var(--good)" }}>{money(t.ca)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="overflow-x-auto rounded-[12px] border border-border" style={{ background: "color-mix(in srgb,var(--brass) 5%,var(--surface-2))" }}>
          <table className="w-full min-w-[720px] border-collapse text-left text-[0.82rem]">
            <thead>
              <tr className="text-[0.66rem] uppercase tracking-[0.06em] text-faint">
                {["Date", "Acquéreur", "Arme", "N° série", "Vendeur", "Télégramme", "Prix"].map((h) => <th key={h} className="border-b border-border px-2.5 py-2 font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {ventes.map((v) => {
                const cli = v.clientId ? cliById.get(v.clientId) : null;
                return (
                  <tr key={v.id} onClick={() => setSel(v)} className="cursor-pointer hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]">
                    <td className="border-b border-border px-2.5 py-2 text-muted">{v.dateVente}</td>
                    <td className="border-b border-border px-2.5 py-2 font-medium">
                      <span className="flex items-center gap-2">
                        {v.photo || cli?.carteIdentite ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={v.photo || cli!.carteIdentite!} alt="Acquéreur" className="h-7 w-7 shrink-0 rounded-[5px] border border-border object-cover" />
                        ) : null}
                        {v.acquereur}
                      </span>
                    </td>
                    <td className="border-b border-border px-2.5 py-2 text-muted">{[v.marque, v.modele].filter(Boolean).join(" ") || "—"}{v.quantite > 1 ? <span className="ml-1 font-num text-faint">×{v.quantite}</span> : null}</td>
                    <td className="border-b border-border px-2.5 py-2"><span className="mono text-[0.76rem]">{v.numeroSerie || "—"}</span></td>
                    <td className="border-b border-border px-2.5 py-2 text-muted">{v.vendeur || "—"}</td>
                    <td className="border-b border-border px-2.5 py-2 text-faint">{v.telegramme || (cli?.telegramme ?? "—")}</td>
                    <td className="border-b border-border px-2.5 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-right"><span className="font-num">{money(v.prix)}</span>{v.quantite > 1 ? <span className="block text-[0.64rem] text-faint">{v.quantite} × {money(v.prixUnitaire)}</span> : null}</span>
                        <button onClick={(e) => { e.stopPropagation(); setFacture(groupeDe(v)); }} title="Voir la facture" className="rounded-md border border-border bg-surface px-1.5 py-0.5 text-[0.72rem] hover:border-border-2">🧾</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
       </div>
      )}
      {nouveau ? <VenteModal clients={clients} onClose={() => setNouveau(false)} router={router} /> : null}
      {sel ? <VenteModal key={sel.id} vente={sel} clients={clients} onClose={() => setSel(null)} router={router} /> : null}
      {facture ? <FactureModal ventes={facture} client={facture[0].clientId ? cliById.get(facture[0].clientId) : null} onClose={() => setFacture(null)} /> : null}
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
  const [quantite, setQuantite] = useState(vente ? String(vente.quantite || 1) : "1");
  const [prixUnitaire, setPrixUnitaire] = useState(vente ? String(vente.prixUnitaire ?? vente.prix) : "");
  const [notes, setNotes] = useState(vente?.notes || "");
  const totalVente = Math.max(0, Math.round((Number(quantite) || 1) * (Number(prixUnitaire) || 0) * 100) / 100);
  const [photo, setPhoto] = useState(vente?.photo || "");
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
    setBusy("save");
    const data = { clientId: clientId || undefined, acquereur, dateVente, marque, modele, categorie, numeroSerie, vendeur, telegramme, quantite: Number(quantite) || 1, prixUnitaire: Number(prixUnitaire) || 0, prix: totalVente, notes, photo: photo || undefined };
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
        <div className="flex items-start gap-3 rounded-[12px] border border-border bg-surface-2 p-3">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt={acquereur || "Acquéreur"} className="h-24 w-24 shrink-0 rounded-[10px] border border-border object-cover" />
          ) : (
            <div className="grid h-24 w-24 shrink-0 place-items-center rounded-[10px] border border-dashed border-border text-center text-[0.62rem] leading-tight text-faint">Aucune<br />photo</div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[0.66rem] uppercase tracking-[0.05em] text-faint">Photo de l&apos;acquéreur / carte d&apos;identité</div>
            <div className="mt-1"><PhotoDrop dossier="armurerie-ventes" onUploaded={setPhoto} compact label={photo ? "Remplacer la photo" : "Glisser une photo de la personne"} /></div>
            {photo ? <button onClick={() => setPhoto("")} className="mt-1 text-[0.7rem] text-faint hover:text-ink">Retirer la photo</button> : null}
          </div>
        </div>
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
        <div className="grid gap-3 sm:grid-cols-3">
          <Champ label="Quantité"><input className={inputCls} type="number" min={1} step="1" value={quantite} onChange={(e) => setQuantite(e.target.value)} /></Champ>
          <Champ label="Prix unitaire ($)"><input className={inputCls} type="number" min={0} step="0.01" value={prixUnitaire} onChange={(e) => setPrixUnitaire(e.target.value)} /></Champ>
          <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Total</span><div className="flex h-full min-h-[38px] items-center rounded-lg border border-border bg-surface-2 px-3 font-num text-[0.95rem] font-bold" style={{ color: "var(--accent)" }}>{money(totalVente)}</div></div>
        </div>
        <Champ label="N° de série"><input className={inputCls + " mono"} value={numeroSerie} onChange={(e) => setNumeroSerie(e.target.value)} placeholder="Optionnel" maxLength={80} /></Champ>
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
const CTR_FILTRES = [
  { key: "tous", label: "Tous" },
  { key: "brouillon", label: "Brouillons" },
  { key: "envoye", label: "Envoyés" },
  { key: "signe", label: "Signés" },
  { key: "honore", label: "Honorés" },
  { key: "refuse", label: "Refusés" },
];
function ContratsTab({ contrats, clients, produits, router }: { contrats: ArmContrat[]; clients: ArmClient[]; produits: ArmProduit[]; router: Router }) {
  const [sel, setSel] = useState<ArmContrat | null>(null);
  const [nouveau, setNouveau] = useState(false);
  const [filtre, setFiltre] = useState("tous");
  const cliById = new Map(clients.map((c) => [c.id, c]));

  // Statistiques : valeur en cours (signés non honorés), valeur honorée, à envoyer.
  const enAttente = contrats.filter((c) => c.statut === "signe").reduce((s, c) => s + c.prix, 0);
  const honore = contrats.filter((c) => c.statut === "honore").reduce((s, c) => s + c.prix, 0);
  const aRelancer = contrats.filter((c) => c.statut === "envoye").length;
  const compte = (k: string) => k === "tous" ? contrats.length : contrats.filter((c) => (c.statut || "brouillon") === k).length;
  const liste = filtre === "tous" ? contrats : contrats.filter((c) => (c.statut || "brouillon") === filtre);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="mr-auto text-[0.74rem] italic text-faint">Contrats de vente — rédige, envoie au client sur Discord pour signature, puis honore (→ vente + facture).</p>
        <button onClick={() => setNouveau(true)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Plus className="h-3.5 w-3.5" /> Nouveau contrat</button>
      </div>
      {contrats.length ? (
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatMini label="Signés en attente" valeur={money(enAttente)} tone="var(--good)" />
          <StatMini label="Honorés (encaissés)" valeur={money(honore)} tone="var(--brass)" />
          <StatMini label="Envoyés à relancer" valeur={String(aRelancer)} tone="var(--accent)" />
          <StatMini label="Total contrats" valeur={String(contrats.length)} tone="var(--muted)" />
        </div>
      ) : null}
      {contrats.length ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {CTR_FILTRES.map((f) => { const n = compte(f.key); return (
            <button key={f.key} onClick={() => setFiltre(f.key)} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold transition" style={{ borderColor: filtre === f.key ? "var(--accent)" : "var(--border)", background: filtre === f.key ? "color-mix(in srgb,var(--accent) 12%,transparent)" : "var(--surface-2)", color: filtre === f.key ? "var(--accent)" : "var(--muted)" }}>{f.label}<span className="rounded-full bg-surface px-1.5 text-[0.64rem] text-faint">{n}</span></button>
          ); })}
        </div>
      ) : null}
      {contrats.length === 0 ? (
        <Vide icon={FileSignature} texte="Aucun contrat. Rédige un contrat de vente et envoie-le au client sur Discord (MP) pour signature — puis honore-le pour l'inscrire au registre." />
      ) : liste.length === 0 ? (
        <p className="py-8 text-center text-[0.82rem] text-faint">Aucun contrat « {CTR_FILTRES.find((f) => f.key === filtre)?.label} ».</p>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {liste.map((c) => { const cli = c.clientId ? cliById.get(c.clientId) : null; return (
            <button key={c.id} onClick={() => setSel(c)} className="flex flex-col gap-1 rounded-[12px] border border-border bg-surface-2 px-3.5 py-3 text-left transition hover:-translate-y-0.5 hover:border-border-2">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[0.88rem] font-semibold">{c.clientNom}</span>
                <Badge tone={ctrTone(c.statut)}>{ctrLabel(c.statut)}</Badge>
              </div>
              <div className="truncate text-[0.76rem] text-muted">{c.arme || "Arme à définir"}{c.numeroSerie ? ` · ${c.numeroSerie}` : ""}</div>
              <div className="flex items-center justify-between gap-2">
                {c.prix ? <span className="font-num text-[0.82rem] font-semibold" style={{ color: "var(--accent)" }}>{money(c.prix)}</span> : <span />}
                <span className="text-[0.62rem] text-faint">{(c.clientDiscordId || cli?.discordId) ? "💬 Discord" : "✍️ manuel"}</span>
              </div>
            </button>
          ); })}
        </div>
      )}
      {nouveau ? <ContratModal clients={clients} produits={produits} onClose={() => setNouveau(false)} router={router} /> : null}
      {sel ? <ContratModal key={sel.id} contrat={sel} clients={clients} produits={produits} onClose={() => setSel(null)} router={router} /> : null}
    </>
  );
}
function StatMini({ label, valeur, tone }: { label: string; valeur: string; tone: string }) {
  return (
    <div className="rounded-[12px] border border-border bg-surface-2 px-3 py-2">
      <div className="text-[0.6rem] uppercase tracking-[0.05em] text-faint">{label}</div>
      <div className="font-num text-[1.05rem] font-bold" style={{ color: tone }}>{valeur}</div>
    </div>
  );
}

function ContratModal({ contrat, clients, produits, onClose, router }: { contrat?: ArmContrat; clients: ArmClient[]; produits: ArmProduit[]; onClose: () => void; router: Router }) {
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
  const [apercu, setApercu] = useState(false);
  const st = contrat?.statut || "brouillon";
  const cli = editing && contrat!.clientId ? clients.find((c) => c.id === contrat!.clientId) : null;
  const peutEnvoyer = !!(contrat?.clientDiscordId || cli?.discordId);

  function choisir(id: string) {
    setClientId(id);
    const c = clients.find((x) => x.id === id);
    if (c) { setClientNom(c.nom); if (c.discordId) setClientDiscordId(c.discordId); }
  }
  // Choisir une arme du catalogue → renseigne le prix de vente automatiquement.
  function onArme(v: string) {
    setArme(v);
    const p = produits.find((x) => x.nom.toLowerCase() === v.trim().toLowerCase());
    if (p) setPrix(String(p.prix));
  }
  async function creer(envoyerApres: boolean) {
    setErr(null);
    if (clientNom.trim().length < 2) { setErr("Indique le nom du client."); return; }
    if (envoyerApres && !clientDiscordId.trim()) { setErr("Renseigne l'ID Discord du client pour l'envoi en MP."); return; }
    setBusy(envoyerApres ? "createsend" : "save");
    const r = await creerContrat({ clientId: clientId || undefined, clientNom, clientDiscordId, arme, numeroSerie, prix: Number(prix) || 0, conditions });
    if (!r.ok) { setBusy(null); setErr(r.error || "Impossible."); return; }
    if (envoyerApres && r.id) {
      const e = await envoyerContrat(r.id);
      setBusy(null);
      if (!e.ok) { setErr("Contrat créé, mais l'envoi Discord a échoué : " + (e.error || "")); router.refresh(); return; }
    } else setBusy(null);
    router.refresh(); onClose();
  }
  async function envoyer() {
    setBusy("send");
    const r = await envoyerContrat(contrat!.id);
    setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    setFlash("Contrat envoyé au client en message privé Discord — en attente de signature."); router.refresh();
  }
  async function marquer(stt: "signe" | "refuse") {
    setBusy(stt);
    const r = await marquerContrat(contrat!.id, stt);
    setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    setFlash(stt === "signe" ? "Contrat marqué signé." : "Contrat marqué refusé."); router.refresh();
  }
  async function honorer() {
    setBusy("honor");
    const r = await honorerContrat(contrat!.id);
    setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    setFlash(`Contrat honoré → vente de ${money(r.total || contrat!.prix)} inscrite au registre + facture + coffre + ressources décomptées.`); router.refresh();
  }
  async function supprimer() {
    setBusy("del");
    const r = await supprimerContrat(contrat!.id);
    setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    router.refresh(); onClose();
  }

  return (
    <>
    <Modal titre={editing ? `Contrat — ${contrat!.clientNom}` : "📜 Nouveau contrat de vente"} onClose={onClose} max={540}>
      {flash ? <div className="mb-3"><Flash>{flash}</Flash></div> : null}
      {editing ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 rounded-[12px] border border-border bg-surface-2 px-3.5 py-3">
            <div className="flex items-center justify-between"><span className="text-[0.86rem] font-semibold">{contrat!.clientNom}</span><Badge tone={ctrTone(st)}>{ctrLabel(st)}</Badge></div>
            {contrat!.arme ? <div className="text-[0.82rem] text-muted">{contrat!.arme}{contrat!.numeroSerie ? ` · ${contrat!.numeroSerie}` : ""}</div> : null}
            {contrat!.prix ? <div className="font-num text-[0.84rem] font-semibold" style={{ color: "var(--accent)" }}>{money(contrat!.prix)}</div> : null}
            {contrat!.conditions ? <div className="text-[0.8rem] text-muted"><span className="text-faint">Conditions : </span>{contrat!.conditions}</div> : null}
            <div className="text-[0.68rem] text-faint">{peutEnvoyer ? "💬 Client joignable sur Discord — envoi en MP possible." : "✍️ Pas d'ID Discord — signature à faire à la main."}</div>
          </div>
          {/* Pipeline visuel */}
          <div className="flex items-center gap-1 text-[0.62rem] font-semibold uppercase tracking-[0.05em]">
            {["brouillon", "envoye", "signe", "honore"].map((k, i) => { const done = ["brouillon", "envoye", "signe", "honore"].indexOf(st) >= i; return (
              <span key={k} className="flex items-center gap-1">
                <span className="rounded-full px-2 py-0.5" style={{ background: done ? "color-mix(in srgb,var(--good) 16%,transparent)" : "var(--surface-2)", color: done ? "var(--good)" : "var(--faint)" }}>{ctrLabel(k).replace(" ✓", "")}</span>
                {i < 3 ? <span className="text-faint">→</span> : null}
              </span>
            ); })}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-border pt-2">
            {st === "brouillon" || st === "refuse" || st === "envoye" ? (
              <button onClick={envoyer} disabled={busy === "send"} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.78rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>
                {busy === "send" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} {st === "envoye" ? "Renvoyer" : "Envoyer sur Discord"}
              </button>
            ) : null}
            <button onClick={() => setApercu(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[0.78rem] font-semibold hover:border-border-2"><FileSignature className="h-3.5 w-3.5" /> Aperçu / Imprimer</button>
            {st !== "signe" && st !== "honore" ? <button onClick={() => marquer("signe")} disabled={busy === "signe"} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.78rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--good)" }}>{busy === "signe" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Marquer signé</button> : null}
            {st === "signe" ? <button onClick={honorer} disabled={busy === "honor"} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.78rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--brass)" }}>{busy === "honor" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CircleDollarSign className="h-3.5 w-3.5" />} Honorer (encaisser)</button> : null}
            {st !== "refuse" && st !== "honore" ? <button onClick={() => marquer("refuse")} disabled={busy === "refuse"} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[0.78rem] font-semibold hover:border-border-2">{busy === "refuse" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Refusé</button> : null}
            <button onClick={supprimer} disabled={busy === "del"} className="ml-auto inline-flex items-center gap-1.5 text-[0.76rem] text-faint hover:text-ink"><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {clients.length ? (
            <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Client</span>
              <select className={inputCls} value={clientId} onChange={(e) => choisir(e.target.value)}>
                <option value="">— Saisir manuellement —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.nom}{c.discordId ? " 💬" : ""}</option>)}
              </select></div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ label="Nom du client *"><input className={inputCls} value={clientNom} onChange={(e) => setClientNom(e.target.value)} maxLength={120} /></Champ>
            <Champ label="ID Discord du client"><input className={inputCls} value={clientDiscordId} onChange={(e) => setClientDiscordId(e.target.value)} placeholder="Pour l'envoi en MP" maxLength={40} /></Champ>
          </div>
          {clientDiscordId.trim() ? <p className="-mt-1 text-[0.68rem]" style={{ color: "var(--good)" }}>💬 Le contrat pourra être envoyé directement au client sur Discord.</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ label="Arme (choisis dans le catalogue)"><input className={inputCls} value={arme} onChange={(e) => onArme(e.target.value)} list="ctr-armes" placeholder="Cattleman Revolver…" maxLength={120} /></Champ>
            <Champ label="N° de série"><input className={inputCls + " mono"} value={numeroSerie} onChange={(e) => setNumeroSerie(e.target.value)} placeholder="Optionnel" maxLength={80} /></Champ>
          </div>
          <datalist id="ctr-armes">{produits.map((p) => <option key={p.id} value={p.nom} />)}</datalist>
          <Champ label="Prix ($)"><input className={inputCls} type="number" min={0} step="0.01" value={prix} onChange={(e) => setPrix(e.target.value)} /></Champ>
          <Champ label="Conditions"><textarea className={inputCls + " min-h-[60px] resize-y"} value={conditions} onChange={(e) => setConditions(e.target.value)} maxLength={2000} placeholder="Modalités de paiement, garanties, clauses…" /></Champ>
          {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={() => creer(false)} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2 disabled:opacity-60">
              {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSignature className="h-3.5 w-3.5" />} Rédiger
            </button>
            <button onClick={() => creer(true)} disabled={!!busy || !clientDiscordId.trim()} title={clientDiscordId.trim() ? "" : "Renseigne l'ID Discord du client"} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-40" style={{ background: "var(--accent)" }}>
              {busy === "createsend" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Rédiger &amp; envoyer sur Discord
            </button>
          </div>
        </div>
      )}
    </Modal>
    {apercu && editing ? <ContratDoc contrat={contrat!} onClose={() => setApercu(false)} /> : null}
    </>
  );
}
// Contrat de vente imprimable (document officiel, signatures compagnie + client).
function ContratDoc({ contrat, onClose }: { contrat: ArmContrat; onClose: () => void }) {
  const num = `CTR-${contrat.id.slice(-6).toUpperCase()}`;
  return (
    <Modal titre="📜 Contrat de vente" onClose={onClose} max={640}>
      <style>{`@media print{body *{visibility:hidden!important}#ctr-doc,#ctr-doc *{visibility:visible!important}#ctr-doc{position:fixed;inset:0;margin:0;padding:26px}.no-print{display:none!important}}`}</style>
      <div id="ctr-doc" className="flex flex-col gap-3 text-[0.86rem]">
        <div className="flex items-start justify-between gap-3 border-b-2 pb-2" style={{ borderColor: "var(--brass)" }}>
          <div>
            <div className="font-display text-[1.1rem] font-bold" style={{ color: "var(--brass)" }}>🐺 Iron Wolf Company</div>
            <div className="text-[0.72rem] text-muted">Armurerie de Van Horn — Contrat de vente d&apos;arme à feu</div>
          </div>
          <div className="text-right"><div className="text-[0.66rem] uppercase tracking-[0.08em] text-faint">Contrat n°</div><div className="mono text-[0.92rem] font-bold">{num}</div></div>
        </div>
        <p className="text-[0.82rem] leading-relaxed text-muted">Entre la <b className="text-ink">Iron Wolf Company</b> (le Vendeur) et <b className="text-ink">{contrat.clientNom}</b> (l&apos;Acquéreur), il est convenu la vente de l&apos;arme désignée ci-dessous, conformément au Décret N°2 de l&apos;État de Louisiane.</p>
        <table className="w-full border-collapse text-[0.84rem]">
          <tbody>
            <tr><td className="border-b border-border py-1.5 text-faint">Arme</td><td className="border-b border-border py-1.5 text-right font-semibold">{contrat.arme || "—"}</td></tr>
            <tr><td className="border-b border-border py-1.5 text-faint">N° de série</td><td className="border-b border-border py-1.5 text-right mono">{contrat.numeroSerie || "—"}</td></tr>
            <tr><td className="border-b border-border py-1.5 text-faint">Prix convenu</td><td className="border-b border-border py-1.5 text-right font-num font-bold" style={{ color: "var(--brass)" }}>{money(contrat.prix)}</td></tr>
          </tbody>
        </table>
        {contrat.conditions ? <div><div className="text-[0.66rem] uppercase tracking-[0.05em] text-faint">Conditions</div><div className="text-[0.82rem] text-muted">{contrat.conditions}</div></div> : null}
        <div className="mt-6 grid grid-cols-2 gap-6 text-[0.72rem]">
          <div className="border-t border-border pt-1 text-center text-faint">Pour la Compagnie<div className="mt-6 font-display text-[0.95rem] italic text-ink">Iron Wolf Company</div></div>
          <div className="border-t border-border pt-1 text-center text-faint">L&apos;Acquéreur<div className="mt-6 font-display text-[0.95rem] italic text-ink">{contrat.clientNom}</div></div>
        </div>
        <p className="mt-1 text-center text-[0.62rem] italic text-faint">« La force est dans l&apos;ombre. » — Contrat établi par l&apos;Iron Wolf Company.</p>
      </div>
      <div className="no-print mt-3 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Fermer</button>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Download className="h-3.5 w-3.5" /> Imprimer / PDF</button>
      </div>
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
