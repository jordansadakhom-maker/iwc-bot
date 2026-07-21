import Link from "next/link";
import {
  Shield, Crosshair, Scale, Users, Target, ArrowRight, Swords, Wallet,
  MapPin, ClipboardCheck, Handshake, Star, type LucideIcon,
} from "lucide-react";
import type { VitrineData } from "@/lib/queries";

// Page de COUVERTURE publique de la Iron Wolf Company. Pensée pour être partagée
// dans un salon Discord : donner envie de rejoindre. Aucune donnée inventée —
// les compteurs viennent de la vraie base (ou sont masqués s'ils sont vides).

function Crest({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2 8.5 5H5l-.7 3.4L2 10l1.6 2.2L3 15l2.7 1 .8 3 3-1.2L12 21l1.5-3.2 3 1.2.8-3 2.7-1-.6-2.8L22 10l-2.3-1.6L19 5h-3.5L12 2Zm0 5.5 1.8 1.6L12 11l-1.8-1.9L12 7.5Z" />
    </svg>
  );
}

function Stat({ valeur, label }: { valeur: number; label: string }) {
  return (
    <div className="flex flex-col items-center px-4">
      <span className="font-num text-[1.9rem] font-bold tabular-nums leading-none text-accent sm:text-[2.3rem]">{valeur}</span>
      <span className="mt-1.5 text-[0.66rem] uppercase tracking-[0.14em] text-faint">{label}</span>
    </div>
  );
}

function Carte({ icon: Icon, titre, texte }: { icon: LucideIcon; titre: string; texte: string }) {
  return (
    <div className="group rounded-2xl border border-border bg-surface p-5 transition hover:-translate-y-0.5 hover:border-border-2" style={{ background: "linear-gradient(180deg,var(--surface),color-mix(in srgb,var(--surface) 90%,#000))" }}>
      <span className="mb-3 inline-grid h-11 w-11 place-items-center rounded-xl text-accent" style={{ background: "color-mix(in srgb,var(--accent) 14%,transparent)" }}>
        <Icon className="h-[1.35rem] w-[1.35rem]" strokeWidth={1.7} />
      </span>
      <h3 className="font-display text-[1.05rem] tracking-[0.01em]">{titre}</h3>
      <p className="mt-1.5 text-[0.85rem] leading-relaxed text-muted">{texte}</p>
    </div>
  );
}

const CTA_PRIMAIRE = "inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-[0.95rem] font-semibold text-black transition hover:brightness-110";
const CTA_SECONDAIRE = "inline-flex items-center justify-center gap-2 rounded-xl border border-border-2 bg-surface px-6 py-3.5 text-[0.95rem] font-semibold text-ink transition hover:border-accent";

export function Vitrine({ stats }: { stats: VitrineData }) {
  const chiffres = [
    stats.membres && stats.membres > 0 ? { valeur: stats.membres, label: "membres dans la meute" } : null,
    stats.operations && stats.operations > 0 ? { valeur: stats.operations, label: "opérations menées" } : null,
    stats.armes && stats.armes > 0 ? { valeur: stats.armes, label: "armes au registre" } : null,
  ].filter(Boolean) as { valeur: number; label: string }[];

  return (
    <main className="min-h-screen">
      {/* Barre du haut */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-border-2 text-accent" style={{ background: "radial-gradient(circle at 30% 25%, color-mix(in srgb,var(--accent) 30%,transparent), transparent 70%), var(--surface)" }}>
            <Crest className="h-5 w-5" />
          </span>
          <span className="font-display text-[0.98rem] font-semibold tracking-[0.18em]">IRON WOLF C<span className="text-accent">°</span></span>
        </div>
        <Link href="/login" className="rounded-lg border border-border px-3.5 py-2 text-[0.8rem] font-semibold text-muted transition hover:border-accent hover:text-ink">Espace membre</Link>
      </header>

      {/* HÉRO */}
      <section className="relative mx-auto max-w-6xl px-5 pb-8 pt-8 text-center sm:pt-16">
        <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-3xl border border-border-2 text-accent" style={{ background: "radial-gradient(circle at 30% 22%, color-mix(in srgb,var(--accent) 32%,transparent), transparent 68%), var(--surface)" }}>
          <Crest className="h-11 w-11" />
        </div>
        <p className="text-[0.68rem] uppercase tracking-[0.34em] text-faint">Compagnie de sécurité · État de Louisiane</p>
        <h1 className="mx-auto mt-3 max-w-3xl font-display text-[2.6rem] font-semibold leading-[1.05] tracking-[0.02em] sm:text-[3.9rem]">
          Iron Wolf Company
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[1.05rem] leading-relaxed text-muted">
          Sécurité, escorte, armement et chasse de prime. Une meute soudée, un registre tenu à la lettre, une parole qui vaut de l&apos;or. <span className="text-ink">Ta place t&apos;attend.</span>
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/rejoindre" className={CTA_PRIMAIRE} style={{ background: "linear-gradient(180deg,var(--accent-hi),var(--accent))" }}>
            <Users className="h-[1.15rem] w-[1.15rem]" /> Rejoindre la meute <ArrowRight className="h-[1.05rem] w-[1.05rem]" />
          </Link>
          <Link href="/rendez-vous" className={CTA_SECONDAIRE}>
            <Handshake className="h-[1.15rem] w-[1.15rem] text-accent" /> Demander une prestation
          </Link>
        </div>

        {chiffres.length ? (
          <div className="mx-auto mt-11 flex max-w-lg items-center justify-center divide-x divide-border rounded-2xl border border-border bg-surface/60 py-5" style={{ backdropFilter: "blur(2px)" }}>
            {chiffres.map((c) => <Stat key={c.label} valeur={c.valeur} label={c.label} />)}
          </div>
        ) : null}
      </section>

      {/* CE QUE NOUS SOMMES */}
      <section className="mx-auto max-w-6xl px-5 py-12">
        <h2 className="text-center font-display text-[1.5rem] tracking-[0.02em]">Ce que nous défendons</h2>
        <p className="mx-auto mt-2 max-w-lg text-center text-[0.88rem] text-muted">Une compagnie professionnelle, pas une bande. Chaque mission est cadrée, chaque arme est enregistrée, chaque contrat est honoré.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Carte icon={Shield} titre="Protection & escorte" texte="Convois, diligences, personnalités, points sensibles. On assure la route et on ramène tout le monde entier." />
          <Carte icon={Crosshair} titre="Chasse de prime" texte="Avis de recherche, traques, captures. Les hors-la-loi ont un prix — on va le chercher, dans les règles." />
          <Carte icon={Swords} titre="Armurerie de Van Horn" texte="Armes au registre officiel, munitions, réparations. Un comptoir tenu à la lettre du Décret N°2." />
          <Carte icon={Scale} titre="Parole & contrats" texte="Contrat signé, prime versée, registre à jour. Ce qui est promis est tenu — et écrit noir sur blanc." />
        </div>
      </section>

      {/* POURQUOI NOUS REJOINDRE */}
      <section className="mx-auto max-w-6xl px-5 py-8">
        <div className="grid items-center gap-8 rounded-3xl border border-border p-7 sm:p-10 lg:grid-cols-2" style={{ background: "linear-gradient(155deg, color-mix(in srgb,var(--accent) 8%,var(--surface)), var(--surface))" }}>
          <div>
            <p className="text-[0.68rem] uppercase tracking-[0.28em] text-accent">Rejoindre la meute</p>
            <h2 className="mt-2 font-display text-[1.7rem] leading-tight">On ne recrute pas des soldats.<br />On adopte une famille.</h2>
            <p className="mt-3 text-[0.9rem] leading-relaxed text-muted">
              Débutant ou vétéran de la gâchette, il y a une place pour toi. On forme, on équipe, on couvre tes arrières. En échange : de la loyauté, du sérieux, et l&apos;envie d&apos;écrire une belle histoire dans l&apos;Ouest.
            </p>
          </div>
          <ul className="grid gap-2.5">
            {[
              ["Une solde et des primes", "Contrats rémunérés, part sur les captures, coffre transparent."],
              ["Un armement fourni", "Accès à l'armurerie de Van Horn et à ses tarifs internes."],
              ["Une vraie progression", "Grades, spécialités, responsabilités — on grandit ensemble."],
              ["Des frères d'armes", "Une meute qui ne laisse personne au bord de la piste."],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-3 rounded-xl border border-border bg-surface/70 px-4 py-3">
                <Star className="mt-0.5 h-[1.05rem] w-[1.05rem] shrink-0 text-accent" fill="currentColor" strokeWidth={0} />
                <span><span className="text-[0.9rem] font-semibold text-ink">{t}</span><span className="block text-[0.8rem] text-muted">{d}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* REJOINDRE EN 3 ÉTAPES */}
      <section className="mx-auto max-w-6xl px-5 py-12">
        <h2 className="text-center font-display text-[1.5rem] tracking-[0.02em]">Rejoindre en trois temps</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            { n: "I", icon: ClipboardCheck, t: "Dépose ta candidature", d: "Un formulaire, deux minutes. Dis-nous qui tu es et ce que tu cherches." },
            { n: "II", icon: Handshake, t: "On te recontacte", d: "La Direction étudie ton dossier et te recontacte pour un entretien." },
            { n: "III", icon: Target, t: "Intègre la meute", d: "Équipement, grade, première mission. Bienvenue chez les loups." },
          ].map((e) => (
            <div key={e.n} className="relative rounded-2xl border border-border bg-surface p-5">
              <span className="absolute right-4 top-3 font-display text-[1.6rem] text-faint/40">{e.n}</span>
              <span className="mb-3 inline-grid h-11 w-11 place-items-center rounded-xl text-accent" style={{ background: "color-mix(in srgb,var(--accent) 14%,transparent)" }}>
                <e.icon className="h-[1.35rem] w-[1.35rem]" strokeWidth={1.7} />
              </span>
              <h3 className="font-display text-[1.02rem]">{e.t}</h3>
              <p className="mt-1.5 text-[0.85rem] leading-relaxed text-muted">{e.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="mx-auto max-w-6xl px-5 pb-6">
        <div className="rounded-3xl border border-border-2 px-6 py-11 text-center" style={{ background: "radial-gradient(700px 300px at 50% -20%, color-mix(in srgb,var(--accent) 16%,transparent), transparent 65%), var(--surface)" }}>
          <h2 className="mx-auto max-w-xl font-display text-[1.8rem] leading-tight sm:text-[2.1rem]">Le pays a besoin de loups.<br />Et les loups chassent en meute.</h2>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/rejoindre" className={CTA_PRIMAIRE} style={{ background: "linear-gradient(180deg,var(--accent-hi),var(--accent))" }}>
              <Users className="h-[1.15rem] w-[1.15rem]" /> Déposer ma candidature <ArrowRight className="h-[1.05rem] w-[1.05rem]" />
            </Link>
            <Link href="/armurerie-vh" className={CTA_SECONDAIRE}>
              <Swords className="h-[1.15rem] w-[1.15rem] text-accent" /> Visiter l&apos;armurerie
            </Link>
          </div>
          <p className="mt-5 text-[0.8rem] text-faint">
            Une question ? <Link href="/telegramme" className="font-semibold text-muted underline decoration-dotted underline-offset-2 hover:text-accent">Envoie-nous un télégramme</Link>.
          </p>
        </div>
      </section>

      {/* PIED DE PAGE */}
      <footer className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-5 py-9 text-center">
        <span className="flex items-center gap-2 text-accent"><Crest className="h-5 w-5" /><span className="font-display text-[0.85rem] tracking-[0.2em] text-muted">IRON WOLF COMPANY</span></span>
        <p className="flex items-center gap-1.5 text-[0.72rem] text-faint"><MapPin className="h-3.5 w-3.5" /> Van Horn · Roanoke Ridge · État de Louisiane</p>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[0.74rem] text-faint">
          <Link href="/rejoindre" className="hover:text-accent">Recrutement</Link>
          <Link href="/rendez-vous" className="hover:text-accent">Prestations</Link>
          <Link href="/armurerie-vh" className="hover:text-accent">Armurerie</Link>
          <Link href="/telegramme" className="hover:text-accent">Nous écrire</Link>
          <Link href="/login" className="hover:text-accent">Espace membre</Link>
        </div>
      </footer>
    </main>
  );
}
