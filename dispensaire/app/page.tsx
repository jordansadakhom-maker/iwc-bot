import { Entete } from "@/components/entete";
import { Accueil } from "@/components/accueil";
import { getSalaries, getServicesEnCours, getStockAlerte, dbPrete } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const pret = dbPrete();
  const [salaries, services, alerte] = pret
    ? await Promise.all([getSalaries(), getServicesEnCours(), getStockAlerte()])
    : [[], [], []];

  return (
    <main className="mx-auto w-full max-w-[1080px] px-4 py-8 sm:px-6">
      <Entete actif="/" />
      {!pret ? (
        <div className="rounded-[8px] border border-[var(--line)] bg-[var(--card)] p-6 text-[0.9rem] text-[var(--muted)]">
          Base de données non reliée. Définis <code className="rounded bg-[var(--paper-2)] px-1">SUPABASE_URL</code> et <code className="rounded bg-[var(--paper-2)] px-1">SUPABASE_SERVICE_ROLE_KEY</code> (mêmes que le site principal), puis exécute <code className="rounded bg-[var(--paper-2)] px-1">sql/init.sql</code> dans Supabase.
        </div>
      ) : (
        <Accueil salaries={salaries} services={services} alerte={alerte} />
      )}
      <footer className="regle mt-10 pt-4 text-center text-[0.74rem] italic text-[var(--faint)]">Dispensaire de Saint-Denis — « Primum non nocere » · Registre tenu à l&apos;encre.</footer>
    </main>
  );
}
