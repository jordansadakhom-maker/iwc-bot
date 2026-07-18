import { redirect } from "next/navigation";

// La racine mène au tableau de bord (l'auth Discord viendra en Phase 1).
export default function Home() {
  redirect("/dashboard");
}
