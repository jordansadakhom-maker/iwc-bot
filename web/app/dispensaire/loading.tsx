// Écran de chargement instantané du Dispensaire : Next l'affiche dès qu'on navigue
// vers une page interne (dynamique, lue depuis Supabase) au lieu de laisser
// l'ancienne page figée. La coquille (en-tête + onglets) reste en place — elle
// vit dans le layout. Squelette neutre : il adopte le parchemin via les tokens.
export default function Loading() {
  const Bloc = ({ h = 96, w = "100%" }: { h?: number; w?: string }) => (
    <div className="animate-pulse rounded-card border border-border bg-surface" style={{ height: h, width: w }} />
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="h-6 w-60 animate-pulse rounded bg-surface-2" />
        <div className="h-3 w-40 animate-pulse rounded bg-surface" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Bloc /><Bloc /><Bloc /><Bloc />
      </div>
      <Bloc h={280} />
      <div className="flex items-center gap-2 pt-1 text-[0.8rem] text-faint">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border-2 border-t-accent" />
        Ouverture du registre…
      </div>
    </div>
  );
}
