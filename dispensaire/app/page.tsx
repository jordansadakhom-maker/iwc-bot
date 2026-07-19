import { Coquille } from "@/components/coquille";
import { Accueil } from "@/components/accueil";
import { getSalaries, getServicesEnCours, getStockAlerte, dbPrete } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const pret = dbPrete();
  const [salaries, services, alerte] = pret
    ? await Promise.all([getSalaries(), getServicesEnCours(), getStockAlerte()])
    : [[], [], []];

  return (
    <Coquille actif="/" pret={pret}>
      <Accueil salaries={salaries} services={services} alerte={alerte} />
    </Coquille>
  );
}
