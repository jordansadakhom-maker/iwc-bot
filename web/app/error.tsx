"use client";

// Filet de sécurité pour TOUTES les routes de premier niveau (dont l'espace
// Dispensaire, qui n'était couvert par aucune error.tsx jusqu'ici). Un souci
// passager (base momentanément indisponible, déploiement en cours) affiche un
// écran doux avec réessai automatique — plus jamais de « souci avec le serveur » brut.
import { ErreurBoundary } from "@/components/erreur-boundary";

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErreurBoundary {...props} />;
}
