import { Coquille } from "@/components/coquille";
import { RH } from "@/components/rh";
import { dbPrete } from "@/lib/data";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Coquille actif="/rh" pret={dbPrete()}>
      <RH />
    </Coquille>
  );
}
