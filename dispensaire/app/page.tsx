import { Coquille } from "@/components/coquille";
import { Accueil } from "@/components/accueil";
import { getSalaries, getServicesEnCours, getStockAlerte, getResume, dbPrete } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const pret = dbPrete();
  const [salaries, services, alerte, resume] = pret
    ? await Promise.all([getSalaries(), getServicesEnCours(), getStockAlerte(), getResume()])
    : [[], [], [], { articles: 0, alertes: 0, enService: 0, ventesSemaine: 0, facturesRetard: 0, salaries: 0 }];

  return (
    <Coquille actif="/" pret={pret}>
      <Accueil salaries={salaries} services={services} alerte={alerte} resume={resume} />
    </Coquille>
  );
}
