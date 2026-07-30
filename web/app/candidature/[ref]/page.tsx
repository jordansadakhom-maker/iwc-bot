import Link from "next/link";
import { chargerCandidatureParRef } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Suivi de ma candidature — Iron Wolf Company" };

function Crest() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-9 w-9" aria-hidden>
      <path d="M12 2 8.5 5H5l-.7 3.4L2 10l1.6 2.2L3 15l2.7 1 .8 3 3-1.2L12 21l1.5-3.2 3 1.2.8-3 2.7-1-.6-2.8L22 10l-2.3-1.6L19 5h-3.5L12 2Zm0 5.5 1.8 1.6L12 11l-1.8-1.9L12 7.5Z" />
    </svg>
  );
}

const dateFR = (s: string | null | undefined) => {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }); } catch { return ""; }
};

// Un point de la frise + son libellé.
function Etape({ etat, titre, texte, last }: { etat: "done" | "current" | "pending" | "good" | "bad"; titre: string; texte: string; last?: boolean }) {
  const col = etat === "good" ? "var(--good)" : etat === "bad" ? "var(--oxblood)" : etat === "done" ? "var(--good)" : etat === "current" ? "var(--accent)" : "var(--faint)";
  const plein = etat === "done" || etat === "good" || etat === "bad";
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span className="grid h-5 w-5 place-items-center rounded-full border-2" style={{ borderColor: col, background: plein ? col : "transparent" }}>
          {plein ? <span className="text-[0.6rem] font-bold text-black/85">✓</span> : etat === "current" ? <span className="h-1.5 w-1.5 rounded-full" style={{ background: col }} /> : null}
        </span>
        {!last ? <span className="my-0.5 w-0.5 flex-1" style={{ background: "var(--border)" }} /> : null}
      </div>
      <div className={last ? "pb-0" : "pb-5"}>
        <p className="text-[0.9rem] font-semibold" style={{ color: etat === "pending" ? "var(--faint)" : "var(--ink)" }}>{titre}</p>
        <p className="mt-0.5 text-[0.8rem] leading-relaxed text-muted">{texte}</p>
      </div>
    </div>
  );
}

export default async function SuiviCandidaturePage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const c = await chargerCandidatureParRef(decodeURIComponent(ref));
  const statut = c.statut || "nouveau";
  const decide = statut === "accepte" || statut === "refuse";
  const contactTxt = c.contact ? `${c.moyen ? c.moyen + " : " : ""}${c.contact}` : "le moyen de contact indiqué";

  return (
    <main className="grid min-h-screen place-items-center px-5 py-10" style={{ background: "radial-gradient(1000px 520px at 50% -10%, color-mix(in srgb,var(--accent) 12%,transparent), transparent 62%), var(--bg)" }}>
      <div className="w-full max-w-[500px]">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-border-2 text-accent" style={{ background: "radial-gradient(circle at 30% 25%, color-mix(in srgb,var(--accent) 30%,transparent), transparent 70%), var(--surface)" }}>
            <Crest />
          </div>
          <h1 className="font-display text-2xl tracking-[0.1em]">SUIVI DE CANDIDATURE</h1>
          <p className="mt-2 max-w-[360px] text-[0.86rem] leading-relaxed text-muted">Iron Wolf Company — l&apos;avancement de ta candidature, en direct.</p>
        </div>

        <section className="rounded-2xl border border-border bg-surface p-6 shadow-card" style={{ background: "linear-gradient(180deg,var(--surface),color-mix(in srgb,var(--surface) 88%,#000))" }}>
          {!c.trouve ? (
            <div className="py-4 text-center">
              <p className="text-[0.9rem] font-semibold text-ink">Dossier introuvable</p>
              <p className="mx-auto mt-2 max-w-sm text-[0.84rem] leading-relaxed text-muted">Ce numéro de dossier n&apos;existe pas (ou plus). Vérifie qu&apos;il est bien saisi, ou dépose une nouvelle candidature.</p>
              <Link href="/rejoindre" className="mt-4 inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-[0.86rem] font-semibold text-black/85" style={{ background: "linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 55%,#000))" }}>Déposer une candidature</Link>
            </div>
          ) : (
            <>
              <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-[0.72rem] uppercase tracking-[0.06em] text-faint">Candidat</p>
                  <p className="font-display text-lg">{c.nomRP}</p>
                </div>
                {c.createdAt ? <p className="text-[0.76rem] text-faint">Déposée le {dateFR(c.createdAt)}</p> : null}
              </div>

              {/* Frise d'avancement */}
              <div className="rounded-xl border border-border bg-surface-2 p-4">
                <Etape etat="done" titre="Candidature reçue" texte="Ton dossier est bien arrivé à la maison." />
                <Etape
                  etat={decide ? "done" : "current"}
                  titre={statut === "entretien" ? "En entretien" : "À l'étude"}
                  texte={statut === "entretien" ? "La Direction souhaite échanger avec toi." : "La Direction étudie ton dossier."}
                />
                <Etape
                  etat={statut === "accepte" ? "good" : statut === "refuse" ? "bad" : "pending"}
                  titre="Décision"
                  texte={statut === "accepte" ? "Ta candidature est acceptée." : statut === "refuse" ? "Réponse rendue par la Direction." : "En attente de la décision finale."}
                  last
                />
              </div>

              {/* Message selon l'état */}
              {statut === "accepte" ? (
                <div className="mt-4 rounded-xl border p-4" style={{ borderColor: "color-mix(in srgb,var(--good) 40%,var(--border))", background: "color-mix(in srgb,var(--good) 8%,transparent)" }}>
                  <p className="font-display text-[1.05rem]" style={{ color: "var(--good)" }}>🐺 Bienvenue dans la meute&nbsp;!</p>
                  <p className="mt-1.5 text-[0.85rem] leading-relaxed text-ink">Félicitations <b>{c.nomRP}</b>, ta candidature est <b>acceptée</b>. Voici la suite&nbsp;:</p>
                  <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-[0.84rem] leading-relaxed text-muted">
                    <li>On te recontacte très vite via <b>{contactTxt}</b> pour t&apos;accueillir.</li>
                    <li>Prépare ton personnage : son histoire, sa tenue, ce qu&apos;il vient chercher chez nous.</li>
                    <li>À ton arrivée, tu découvriras le règlement, la hiérarchie et tes premières missions.</li>
                  </ol>
                  <p className="mt-2.5 text-[0.8rem] italic text-faint">La Compagnie t&apos;attend. Sois au rendez-vous.</p>
                </div>
              ) : statut === "refuse" ? (
                <div className="mt-4 rounded-xl border border-border bg-surface-2 p-4">
                  <p className="text-[0.85rem] leading-relaxed text-ink">Merci <b>{c.nomRP}</b> pour ta candidature et pour l&apos;intérêt porté à la Iron Wolf Company. La Direction ne donne pas suite cette fois-ci.</p>
                  <p className="mt-2 text-[0.82rem] leading-relaxed text-muted">Ce n&apos;est pas définitif : tu peux retenter ta chance plus tard. Bonne route en attendant.</p>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-border bg-surface-2 p-4">
                  <p className="text-[0.85rem] leading-relaxed text-ink">{statut === "entretien" ? "La Direction souhaite te rencontrer." : "Ta candidature est entre de bonnes mains."}</p>
                  <p className="mt-2 text-[0.82rem] leading-relaxed text-muted">On te recontacte via <b>{contactTxt}</b>. Garde un œil dessus — tu peux revenir ici à tout moment pour suivre l&apos;avancement.</p>
                </div>
              )}
            </>
          )}
        </section>

        <p className="mt-5 text-center text-[0.72rem] text-faint">Iron Wolf Company · Aucune connexion nécessaire pour suivre ta candidature.</p>
      </div>
    </main>
  );
}
