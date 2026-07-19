import { Coquille } from "@/components/coquille";
import { Certificats } from "@/components/certificats";

export const dynamic = "force-dynamic";

// Toujours affiché : impression / copie fonctionnent même sans base reliée.
export default function Page() {
  return (
    <Coquille actif="/certificats" pret={true}>
      <Certificats />
    </Coquille>
  );
}
