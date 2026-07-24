import { Scale, Stamp } from "lucide-react";
import { REGLEMENT_ENTETE, REGLEMENT_ARTICLES, REGLEMENT_PIED, AVENANT } from "@/lib/dispensaire-reglement-const";

// Onglet « Règlement » — lecture seule, mise en page d'époque. Reprend fidèlement
// les documents officiels de la Direction (règlement + avenant N°1).
export function DispensaireReglement() {
  return (
    <div className="flex flex-col gap-4">
      {/* Règlement */}
      <section className="rounded-[16px] border border-border bg-surface p-5 sm:p-7" style={{ background: "linear-gradient(180deg, color-mix(in srgb,var(--warn) 5%,var(--surface)), var(--surface))" }}>
        <header className="border-b border-border pb-4 text-center">
          <div className="text-[0.66rem] uppercase tracking-[0.22em] text-faint">{REGLEMENT_ENTETE.annee}</div>
          <h2 className="mt-1 font-display text-[1.5rem] font-bold tracking-wide">Cabinet Médical de Saint-Denis</h2>
          <div className="mt-1 text-[0.82rem] font-semibold uppercase tracking-[0.14em] text-muted">{REGLEMENT_ENTETE.devise}</div>
          <div className="text-[0.74rem] italic text-faint">{REGLEMENT_ENTETE.latin}</div>
          <div className="mx-auto mt-3 h-px w-24 bg-border" />
          <h3 className="mt-3 font-display text-[1.15rem] font-bold uppercase tracking-[0.1em]">{REGLEMENT_ENTETE.titre}</h3>
          <p className="text-[0.76rem] italic text-faint">{REGLEMENT_ENTETE.sous}</p>
        </header>

        <div className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {REGLEMENT_ARTICLES.map((a) => (
            <article key={a.num}>
              <h4 className="flex items-baseline gap-2 font-display text-[0.98rem] font-bold uppercase tracking-[0.04em]"><span className="text-accent">{a.num}.</span> {a.titre}</h4>
              <div className="mt-1 space-y-1 text-[0.83rem] leading-relaxed text-muted">
                {a.texte.map((t, i) => <p key={i}>{t}</p>)}
              </div>
            </article>
          ))}
        </div>

        <footer className="mt-6 border-t border-border pt-4 text-center">
          <div className="font-display text-[0.86rem] font-semibold uppercase tracking-[0.12em]">{REGLEMENT_PIED.devise}</div>
          <div className="text-[0.78rem] italic text-faint">{REGLEMENT_PIED.latin}</div>
          <div className="mt-3 flex items-center justify-center gap-2 text-[0.8rem]"><Scale className="h-4 w-4 text-accent" /> <span className="font-semibold">{REGLEMENT_PIED.signature}</span></div>
        </footer>
      </section>

      {/* Avenant N°1 */}
      <section className="rounded-[16px] border border-border bg-surface p-5 sm:p-7">
        <header className="border-b border-border pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-display text-[1.1rem] font-bold uppercase tracking-[0.06em]"><Stamp className="h-5 w-5 text-oxblood" /> {AVENANT.titre}</h3>
            <span className="text-[0.74rem] text-faint">Date : {AVENANT.date}</span>
          </div>
          <p className="mt-1 text-[0.8rem] italic text-muted">{AVENANT.objet}</p>
          <p className="mt-2 text-[0.82rem] font-semibold uppercase tracking-[0.08em]">{AVENANT.section}</p>
        </header>
        <div className="mt-3 space-y-2.5 text-[0.84rem] leading-relaxed text-muted">
          {AVENANT.paragraphes.map((p, i) => <p key={i}>{p}</p>)}
        </div>
        <p className="mt-4 border-t border-border pt-3 text-right text-[0.8rem]">Pour le Cabinet Médical de Saint-Denis,<br /><span className="font-semibold">Dr. Ed Remington</span> — Directeur</p>
      </section>
    </div>
  );
}
