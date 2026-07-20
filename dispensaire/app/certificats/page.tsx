import { Coquille } from "@/components/coquille";
import { Certificats } from "@/components/certificats";
import { getCertificats, dbPrete } from "@/lib/data";

export const dynamic = "force-dynamic";

// Toujours affiché : impression / copie fonctionnent même sans base reliée.
export default async function Page() {
  const archive = dbPrete() ? await getCertificats() : [];
  return (
    <Coquille actif="/certificats" pret={true}>
      <Certificats archive={archive} />
    </Coquille>
  );
}
