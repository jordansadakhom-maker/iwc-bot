// Écran de chargement instantané : Next l'affiche dès qu'on navigue vers une page
// interne (dynamique, lue depuis Supabase), au lieu de laisser l'ancienne page
// figée. La barre latérale et l'en-tête restent en place (ils sont dans le layout).
// Skeleton « shimmer » (balayage lumineux) pour un ressenti premium.
export default function Loading() {
  const Bloc = ({ h = 96, w = "100%" }: { h?: number; w?: string }) => (
    <div className="iwc-skeleton rounded-card border border-border bg-surface" style={{ height: h, width: w }} />
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="iwc-skeleton h-10 w-10 rounded-full bg-surface-2" />
        <div className="flex flex-col gap-2">
          <div className="iwc-skeleton h-5 w-52 rounded bg-surface-2" />
          <div className="iwc-skeleton h-3 w-72 rounded bg-surface" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Bloc /><Bloc /><Bloc /><Bloc />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><Bloc h={220} /></div>
        <Bloc h={220} />
      </div>
      <div className="flex items-center gap-2 pt-1 text-[0.8rem] text-faint">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border-2 border-t-accent" />
        Chargement…
      </div>
    </div>
  );
}
