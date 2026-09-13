"use client";

// Filet d'erreur PROPRE à l'espace Dispensaire : capturé ici, le souci passager
// reste dans la mise en page du Dispensaire (au lieu de remonter au filet global
// et de perdre la nav). Même écran doux + réessai automatique que le reste du site.
import { ErreurBoundary } from "@/components/erreur-boundary";

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErreurBoundary {...props} />;
}
