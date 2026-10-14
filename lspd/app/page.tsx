import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// L'accueil renvoie vers le tableau de bord ; le proxy redirige vers /login si
// l'agent n'est pas connecté.
export default function Home() {
  redirect("/dashboard");
}
