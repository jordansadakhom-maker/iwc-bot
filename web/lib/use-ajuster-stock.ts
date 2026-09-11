"use client";

import { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ajusterStock } from "@/app/dispensaire/stockage/actions";

// Sérialise les ajustements de stock ± pour éviter les « mises à jour perdues ».
//
// Le problème signalé (« ça ne s'enregistre plus correctement, il faut
// recommencer plusieurs fois ») : chaque clic +/− lançait un appel serveur qui
// LIT le stock puis ÉCRIT (stock + delta). Deux clics rapprochés lisaient donc
// la MÊME valeur de départ → le second écrasait le premier. En prime, le
// router.refresh() déclenché à CHAQUE clic pouvait ramener une valeur encore en
// cours d'écriture et faire « sauter » l'affichage en arrière.
//
// La solution, sans rien changer côté base :
//   • pour un même article, les ajustements s'enchaînent STRICTEMENT l'un après
//     l'autre (chaque appel lit ainsi le résultat du précédent — plus de perte) ;
//   • on ne rafraîchit qu'UNE fois, quand toute la rafale est écrite → plus de
//     retour en arrière visuel.
// L'affichage optimiste reste géré par l'appelant, en RELATIF (stock ± delta),
// pour rester juste pendant toute la rafale. `enVol` sert à l'appelant pour ne
// pas écraser une saisie en cours lors d'un rafraîchissement.
export function useAjusterStock() {
  const router = useRouter();
  const chaines = useRef(new Map<string, Promise<unknown>>());
  const enVol = useRef(0);

  const enfiler = useCallback(
    (id: string, delta: number, motif: string | undefined, onErreur: (msg: string) => void) => {
      enVol.current += 1;
      const precedent = chaines.current.get(id) ?? Promise.resolve();
      const suite = precedent
        .then(async () => {
          let msg: string | null = null;
          try {
            const r = await ajusterStock(id, delta, motif);
            if (!r.ok) msg = r.error || "Enregistrement impossible.";
          } catch {
            msg = "Enregistrement impossible.";
          }
          if (msg) onErreur(msg);
        })
        .finally(() => {
          enVol.current = Math.max(0, enVol.current - 1);
          if (chaines.current.get(id) === suite) chaines.current.delete(id);
          // Un seul refresh, une fois toute la rafale écrite → pas de retour en arrière.
          if (enVol.current === 0) router.refresh();
        });
      chaines.current.set(id, suite);
    },
    [router],
  );

  return { enfiler, enVol };
}
