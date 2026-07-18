// Croquis d'armes dessinés à l'encre (SVG pur) — un dessin par catégorie, choisi
// à partir de la catégorie puis, à défaut, de mots-clés du type. Style « planche
// d'armurier » : traits fins, teinte encre, sur papier vieilli.

type Props = { categorie?: string | null; type?: string | null; className?: string };

function norm(s?: string | null) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Détermine le dessin à utiliser.
function choisir(categorie?: string | null, type?: string | null): string {
  const c = norm(categorie), t = norm(type), all = c + " " + t;
  if (/couteau|lame|machette|tomahawk|hache|dague/.test(all)) return "couteau";
  if (/\barc\b|arbalete/.test(all)) return "arc";
  if (/precision|sniper|rolling|bolt|carcano|springfield/.test(all)) return "precision";
  if (/pompe|shotgun|pump|canon scie|double|semi.?auto shot/.test(all)) return "pompe";
  if (/repetition|repeater|winchester|levier|lever|litchfield/.test(all)) return "repetition";
  if (/carabine|carbine/.test(all)) return "carabine";
  if (/pistolet|pistol|mauser|semi.?auto|volcanic/.test(all)) return "pistolet";
  if (/revolver|cattleman|schofield|navy|double.?action|lemat/.test(all)) return "revolver";
  return "revolver";
}

// ── Dessins (traits encre, currentColor) ─────────────────────────
function Revolver() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {/* canon */}
      <path d="M108 40 H196" />
      <path d="M108 46 H190" />
      <path d="M196 38 v6" />
      {/* guidon */}
      <path d="M150 40 v-3" />
      {/* barillet */}
      <path d="M88 34 h22 v20 h-22 z" />
      <circle cx="99" cy="44" r="4.5" />
      {/* carcasse + chien */}
      <path d="M70 34 h18" />
      <path d="M70 34 l-4 -5 l6 1" />
      {/* poignée */}
      <path d="M72 40 q-2 22 -14 34 q-6 -3 -4 -12 q3 -14 8 -22" />
      {/* pontet + détente */}
      <path d="M78 54 q6 12 18 8" />
      <path d="M84 54 v6" />
    </g>
  );
}
function Pistolet() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {/* glissière */}
      <path d="M96 32 H188 v12 H96 z" />
      <path d="M100 36 H150" />
      <path d="M188 34 v8" />
      {/* poignée inclinée */}
      <path d="M100 44 l-10 34 q8 4 16 0 l6 -34" />
      <path d="M96 50 l14 22" />
      {/* pontet */}
      <path d="M112 44 q8 12 20 6" />
      <path d="M118 44 v6" />
    </g>
  );
}
function Repetition() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {/* canon */}
      <path d="M92 30 H206" />
      <path d="M92 36 H200" />
      <path d="M206 28 v8" />
      {/* fût (bois) */}
      <path d="M112 36 H176 v8 H112 z" />
      {/* carcasse */}
      <path d="M74 28 H92 v18 H74 z" />
      {/* chien */}
      <path d="M74 28 l-4 -5 l6 1" />
      {/* levier à boucle (signature) */}
      <path d="M78 46 q-2 14 6 18 q10 4 8 -6" />
      {/* crosse bois */}
      <path d="M74 30 l-44 6 q-4 1 -2 10 l40 4 z" />
    </g>
  );
}
function Carabine() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M100 32 H192" />
      <path d="M100 38 H186" />
      <path d="M192 30 v8" />
      <path d="M118 38 H168 v7 H118 z" />
      <path d="M80 30 H100 v16 H80 z" />
      <path d="M80 30 l-4 -5 l6 1" />
      {/* verrou */}
      <path d="M86 30 l6 -6" />
      <circle cx="93" cy="23" r="2.5" />
      {/* pontet + crosse */}
      <path d="M86 46 q6 10 16 6" />
      <path d="M80 32 l-42 6 q-4 1 -2 10 l38 4 z" />
    </g>
  );
}
function Pompe() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {/* deux canons */}
      <path d="M96 30 H204" />
      <path d="M96 35 H204" />
      <path d="M96 40 H204" />
      <path d="M204 28 v14" />
      {/* brisure / carcasse */}
      <path d="M78 28 H96 v18 H78 z" />
      {/* chien */}
      <path d="M78 28 l-4 -5 l6 1" />
      {/* pontet */}
      <path d="M84 46 q7 11 18 6" />
      <path d="M90 46 v6" />
      {/* crosse */}
      <path d="M78 30 l-46 6 q-4 1 -2 11 l42 4 z" />
    </g>
  );
}
function Precision() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {/* canon long */}
      <path d="M92 40 H214" />
      <path d="M92 46 H206" />
      <path d="M214 38 v8" />
      {/* lunette */}
      <path d="M104 24 H150 v8 H104 z" />
      <path d="M112 24 v8 M138 24 v8" />
      <path d="M110 40 v-8 M144 40 v-8" />
      {/* carcasse + verrou */}
      <path d="M72 38 H92 v16 H72 z" />
      <path d="M84 38 l7 -7" />
      <circle cx="92" cy="30" r="2.5" />
      {/* pontet + crosse */}
      <path d="M80 54 q6 10 16 6" />
      <path d="M72 40 l-44 6 q-4 1 -2 10 l40 4 z" />
    </g>
  );
}
function Couteau() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {/* lame */}
      <path d="M60 52 L150 34 q10 -2 14 4 q-6 6 -16 8 L64 60 z" />
      <path d="M70 52 L150 38" />
      {/* garde + manche */}
      <path d="M58 46 v14" />
      <path d="M40 48 h18 v10 h-18 q-4 -5 0 -10 z" />
    </g>
  );
}
function Arc() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {/* arc */}
      <path d="M150 12 q-40 32 0 66" />
      {/* corde */}
      <path d="M150 14 L150 76" />
      {/* flèche */}
      <path d="M96 44 H188" />
      <path d="M188 44 l-8 -4 M188 44 l-8 4" />
      <path d="M96 44 l6 -4 M96 44 l6 4 M100 40 l0 8" />
    </g>
  );
}

const DESSINS: Record<string, () => React.ReactElement> = {
  revolver: Revolver, pistolet: Pistolet, repetition: Repetition,
  carabine: Carabine, pompe: Pompe, precision: Precision, couteau: Couteau, arc: Arc,
};

export function ArmeCroquis({ categorie, type, className }: Props) {
  const key = choisir(categorie, type);
  const Dessin = DESSINS[key] || Revolver;
  return (
    <svg viewBox="0 0 232 92" className={className} role="img" aria-label={`Croquis — ${type || categorie || "arme"}`} style={{ color: "var(--ink)" }}>
      <Dessin />
    </svg>
  );
}

export const CROQUIS_KEYS = ["revolver", "pistolet", "repetition", "carabine", "pompe", "precision", "couteau", "arc"] as const;
