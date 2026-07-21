"use server";

import { revalidatePath } from "next/cache";
import { envoyerCommande, type CommandeResult } from "@/lib/commandes";

// Déclarer / lever une absence depuis le site. Passe par la file de commandes :
// le bot applique le même modèle que le panneau Discord #absences (status,
// absentJusqu, absentRaison ou absenceProgrammee) puis resynchronise le site.

export async function declarerAbsence(input: {
  membreId: string; jusqu?: string; debut?: string; raison?: string;
}): Promise<CommandeResult> {
  const membreId = String(input.membreId || "").trim();
  if (!membreId) return { ok: false, error: "Indique le membre concerné." };
  const res = await envoyerCommande(
    "absence.declarer",
    {
      membreId,
      jusqu: input.jusqu ? String(input.jusqu) : null,
      debut: input.debut ? String(input.debut) : null,
      raison: String(input.raison || "").slice(0, 200),
    },
    { attendre: true },
  );
  revalidatePath("/absences");
  revalidatePath("/dashboard");
  return res;
}

export async function leverAbsence(membreId: string): Promise<CommandeResult> {
  const id = String(membreId || "").trim();
  if (!id) return { ok: false, error: "Membre introuvable." };
  const res = await envoyerCommande("absence.retour", { membreId: id }, { attendre: true });
  revalidatePath("/absences");
  revalidatePath("/dashboard");
  return res;
}
