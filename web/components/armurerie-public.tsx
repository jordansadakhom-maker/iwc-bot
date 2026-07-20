"use client";

import { useState } from "react";
import { cents } from "@/lib/format";
import type { ArmProduit, ArmRessource, ArmClient, ArmVente, ArmContrat, ArmMouvement } from "@/lib/queries";

const money = (n: number) => `${cents(n)}$`;

function groupBy<T>(arr: T[], key: (t: T) => string): { nom: string; items: T[] }[] {
  const out: { nom: string; items: T[] }[] = [];
  for (const it of arr) { const k = key(it) || "Divers"; let g = out.find((x) => x.nom === k); if (!g) { g = { nom: k, items: [] }; out.push(g); } g.items.push(it); }
  return out;
}

const clientStatut = (s: string) => /interdit/.test(s) ? { t: "Interdit", c: "var(--oxblood)" } : /surveill/.test(s) ? { t: "Surveillance", c: "var(--warn)" } : { t: "Actif", c: "var(--good)" };

export function ArmureriePublic({ produits, ressources, clients, ventes, contrats, ca, coffre, mouvements }: { produits: ArmProduit[]; ressources: ArmRessource[]; clients: ArmClient[]; ventes: ArmVente[]; contrats: ArmContrat[]; ca: number; coffre: number; mouvements: ArmMouvement[] }) {
  const TABS = [
    { k: "tarifs", label: "Tarifs" },
    { k: "stock", label: "Produits & stock" },
    { k: "ressources", label: "Ressources" },
    { k: "clients", label: "Fichier clients" },
    { k: "ventes", label: "Registre des ventes" },
    { k: "contrats", label: "Contrats" },
    { k: "finances", label: "Finances" },
  ];
  const [tab, setTab] = useState("tarifs");

  return (
    <div>
      {/* Bandeau lecture seule */}
      <div className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-center text-[0.76rem] text-muted">
        👁️ Vue publique — <b className="text-ink">lecture seule</b>. Rien ne peut être modifié depuis cette page.
      </div>

      {/* Onglets */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const on = t.k === tab;
          return (
            <button key={t.k} onClick={() => setTab(t.k)} className="rounded-lg border px-3 py-1.5 text-[0.8rem] font-semibold transition" style={on ? { borderColor: "var(--accent)", background: "color-mix(in srgb,var(--accent) 14%,var(--surface))", color: "var(--ink)" } : { borderColor: "var(--border)", background: "var(--surface)", color: "var(--muted)" }}>
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "tarifs" ? <Tarifs produits={produits} /> : null}
      {tab === "stock" ? <Stock produits={produits} /> : null}
      {tab === "ressources" ? <Ressources ressources={ressources} /> : null}
      {tab === "clients" ? <Clients clients={clients} ventes={ventes} /> : null}
      {tab === "ventes" ? <Ventes ventes={ventes} /> : null}
      {tab === "contrats" ? <Contrats contrats={contrats} /> : null}
      {tab === "finances" ? <Finances ca={ca} coffre={coffre} mouvements={mouvements} /> : null}
    </div>
  );
}

function Finances({ ca, coffre, mouvements }: { ca: number; coffre: number; mouvements: ArmMouvement[] }) {
  const dateCourte = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); };
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-[0.64rem] uppercase tracking-[0.06em] text-faint">Chiffre d&apos;affaires</div>
          <div className="mt-0.5 font-num text-[1.6rem] font-bold tabular-nums" style={{ color: "var(--accent)" }}>{money(ca)}</div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-[0.64rem] uppercase tracking-[0.06em] text-faint">Solde du coffre</div>
          <div className="mt-0.5 font-num text-[1.6rem] font-bold tabular-nums" style={{ color: coffre < 0 ? "var(--oxblood)" : "var(--good)" }}>{money(coffre)}</div>
        </div>
      </div>
      <Bloc titre="Comptabilité — mouvements du coffre" n={mouvements.length}>
        {mouvements.length === 0 ? <Vide>Aucun mouvement enregistré.</Vide> : (
          <ul className="max-h-[560px] divide-y divide-border overflow-auto">
            {mouvements.slice(0, 300).map((m) => {
              const entree = m.sens === "entree";
              return (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2 text-[0.83rem]">
                  <span className="w-24 shrink-0 text-right font-num tabular-nums font-bold" style={{ color: entree ? "var(--good)" : "var(--oxblood)" }}>{entree ? "+" : "−"}{money(m.montant)}</span>
                  <span className="min-w-0 flex-1 truncate">{m.motif || (entree ? "Entrée" : "Sortie")}{m.nature ? <span className="text-faint"> · {m.nature}</span> : null}</span>
                  <span className="hidden shrink-0 text-[0.74rem] text-faint sm:inline">{m.auteur || ""}</span>
                  <span className="shrink-0 text-[0.72rem] text-faint tabular-nums">{dateCourte(m.createdAt)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Bloc>
    </>
  );
}

function Bloc({ titre, n, children }: { titre: string; n?: number; children: React.ReactNode }) {
  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 className="font-display text-[1.02rem] tracking-[0.02em]">{titre}</h2>
        {n !== undefined ? <span className="text-[0.7rem] text-faint">{n}</span> : null}
      </div>
      {children}
    </section>
  );
}
const Vide = ({ children }: { children: React.ReactNode }) => <p className="px-4 py-6 text-center text-[0.86rem] italic text-faint">{children}</p>;

function Tarifs({ produits }: { produits: ArmProduit[] }) {
  const cats = groupBy(produits, (p) => p.categorie);
  if (!produits.length) return <Bloc titre="Tarifs"><Vide>Catalogue en préparation.</Vide></Bloc>;
  return (<>{cats.map((c) => (
    <Bloc key={c.nom} titre={c.nom} n={c.items.length}>
      <ul className="divide-y divide-border">
        {c.items.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="min-w-0 flex-1 truncate text-[0.9rem] font-medium">{p.nom}</span>
            <span className="shrink-0 rounded-full px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.04em]" style={!p.aLaDemande && p.stock > 0 ? { color: "var(--good)", background: "color-mix(in srgb,var(--good) 15%,transparent)" } : { color: "var(--muted)", background: "color-mix(in srgb,var(--ink) 8%,transparent)" }}>{!p.aLaDemande && p.stock > 0 ? "En stock" : "Sur commande"}</span>
            <span className="shrink-0 font-num text-[0.98rem] font-bold tabular-nums" style={{ color: p.prix > 0 ? "var(--accent)" : "var(--faint)" }}>{p.prix > 0 ? money(p.prix) : "Sur devis"}</span>
          </li>
        ))}
      </ul>
    </Bloc>
  ))}</>);
}

function Stock({ produits }: { produits: ArmProduit[] }) {
  const cats = groupBy(produits, (p) => p.categorie);
  if (!produits.length) return <Bloc titre="Produits & stock"><Vide>Aucun produit.</Vide></Bloc>;
  return (<>{cats.map((c) => (
    <Bloc key={c.nom} titre={c.nom} n={c.items.length}>
      <ul className="divide-y divide-border">
        {c.items.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-2 text-[0.85rem]">
            <span className="min-w-0 flex-1 truncate font-medium">{p.nom}</span>
            {p.aLaDemande ? <span className="text-[0.72rem] text-faint">à la demande</span> : <span className="font-num tabular-nums" style={{ color: p.stock === 0 ? "var(--oxblood)" : "var(--ink)" }}>{p.stock} en stock</span>}
            <span className="w-20 shrink-0 text-right font-num tabular-nums text-[0.82rem]" style={{ color: "var(--accent)" }}>{p.prix > 0 ? money(p.prix) : "—"}</span>
          </li>
        ))}
      </ul>
    </Bloc>
  ))}</>);
}

function Ressources({ ressources }: { ressources: ArmRessource[] }) {
  const cats = groupBy(ressources, (r) => r.categorie);
  if (!ressources.length) return <Bloc titre="Ressources"><Vide>Aucune ressource enregistrée.</Vide></Bloc>;
  return (<>{cats.map((c) => (
    <Bloc key={c.nom} titre={c.nom} n={c.items.length}>
      <ul className="divide-y divide-border">
        {c.items.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-2 text-[0.85rem]">
            <span className="min-w-0 flex-1 truncate font-medium">{r.nom}{r.mine ? <span className="ml-1 text-[0.68rem] text-faint">· minée</span> : null}</span>
            <span className="font-num tabular-nums" style={{ color: r.stock === 0 ? "var(--oxblood)" : "var(--ink)" }}>{r.stock}</span>
            <span className="w-20 shrink-0 text-right font-num tabular-nums text-[0.8rem] text-faint">{r.prix > 0 ? money(r.prix) : ""}</span>
          </li>
        ))}
      </ul>
    </Bloc>
  ))}</>);
}

function Clients({ clients, ventes }: { clients: ArmClient[]; ventes: ArmVente[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!clients.length) return <Bloc titre="Fichier clients"><Vide>Aucun client fiché.</Vide></Bloc>;
  return (
    <Bloc titre="Fichier clients" n={clients.length}>
      <ul className="divide-y divide-border">
        {clients.map((c) => {
          const achats = ventes.filter((v) => v.clientId === c.id);
          const total = achats.reduce((s, a) => s + a.prix, 0);
          const st = clientStatut(c.statut);
          const est = open === c.id;
          return (
            <li key={c.id} className="px-4 py-2.5">
              <button onClick={() => setOpen(est ? null : c.id)} className="flex w-full items-center gap-3 text-left">
                {c.carteIdentite ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.carteIdentite} alt="CNI" className="h-10 w-10 shrink-0 rounded-lg border border-border object-cover" />
                ) : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-dashed border-border text-faint">🪪</span>}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9rem] font-semibold">{c.nom}</span>
                  <span className="block truncate text-[0.72rem] text-faint">{c.telegramme ? `☎ ${c.telegramme}` : "—"}{achats.length ? ` · ${achats.length} achat${achats.length > 1 ? "s" : ""} · ${money(total)}` : ""}</span>
                </span>
                <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[0.6rem] font-bold uppercase" style={{ color: st.c, background: `color-mix(in srgb,${st.c} 16%,transparent)` }}>{st.t}</span>
              </button>
              {est && achats.length ? (
                <div className="mt-2 flex flex-col gap-1.5 border-t border-border pt-2">
                  {groupBy(achats, (a) => a.ticket || a.id).map((t) => {
                    const tot = t.items.reduce((s, a) => s + a.prix, 0);
                    return (
                      <div key={t.nom} className="rounded-lg border border-border bg-surface-2 p-2 text-[0.78rem]">
                        <div className="mb-1 text-[0.68rem] text-faint"><span className="mono">{t.items[0].ticket || "VTE"}</span> · {t.items[0].dateVente}</div>
                        {t.items.map((a) => (
                          <div key={a.id} className="flex items-center justify-between gap-2"><span className="min-w-0 truncate text-muted">{[a.marque, a.modele].filter(Boolean).join(" ") || "Arme"}{a.quantite > 1 ? ` ×${a.quantite}` : ""}</span><span className="shrink-0 font-num">{money(a.prix)}</span></div>
                        ))}
                        <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold"><span>Total</span><span className="font-num" style={{ color: "var(--accent)" }}>{money(tot)}</span></div>
                      </div>
                    );
                  })}
                </div>
              ) : est ? <p className="mt-2 border-t border-border pt-2 text-[0.78rem] italic text-faint">Aucun achat enregistré.</p> : null}
            </li>
          );
        })}
      </ul>
    </Bloc>
  );
}

function Ventes({ ventes }: { ventes: ArmVente[] }) {
  if (!ventes.length) return <Bloc titre="Registre des ventes"><Vide>Aucune vente enregistrée.</Vide></Bloc>;
  return (
    <Bloc titre="Registre des ventes" n={ventes.length}>
      <ul className="divide-y divide-border">
        {ventes.slice(0, 200).map((v) => (
          <li key={v.id} className="flex items-center gap-3 px-4 py-2 text-[0.83rem]">
            <span className="min-w-0 flex-1 truncate"><span className="font-medium">{[v.marque, v.modele].filter(Boolean).join(" ") || "Arme"}</span>{v.quantite > 1 ? <span className="font-num"> ×{v.quantite}</span> : null}<span className="text-faint"> — {v.acquereur}</span></span>
            {v.numeroSerie ? <span className="mono hidden shrink-0 text-[0.68rem] text-faint sm:inline">{v.numeroSerie}</span> : null}
            <span className="shrink-0 text-[0.72rem] text-faint">{v.dateVente}</span>
            <span className="w-20 shrink-0 text-right font-num tabular-nums font-semibold" style={{ color: "var(--accent)" }}>{money(v.prix)}</span>
          </li>
        ))}
      </ul>
    </Bloc>
  );
}

function Contrats({ contrats }: { contrats: ArmContrat[] }) {
  if (!contrats.length) return <Bloc titre="Contrats"><Vide>Aucun contrat.</Vide></Bloc>;
  return (
    <Bloc titre="Contrats" n={contrats.length}>
      <ul className="divide-y divide-border">
        {contrats.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-[0.85rem]">
            <span className="min-w-0 flex-1"><span className="font-medium">{c.arme || "Arme"}</span>{c.numeroSerie ? <span className="mono text-faint"> · {c.numeroSerie}</span> : null}<span className="block truncate text-[0.74rem] text-faint">{c.clientNom}</span></span>
            <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase text-muted" style={{ background: "color-mix(in srgb,var(--ink) 8%,transparent)" }}>{c.statut}</span>
            <span className="w-20 shrink-0 text-right font-num tabular-nums font-semibold" style={{ color: "var(--accent)" }}>{money(c.prix)}</span>
          </li>
        ))}
      </ul>
    </Bloc>
  );
}
