// Garde-fou anti-blocage partagé : rend la main après `ms` si une promesse
// (envoi de photo/audio, transcription…) n'aboutit pas, pour ne JAMAIS figer un
// spinner « en cours ». La tâche continue peut-être côté serveur, mais l'interface
// cesse d'attendre indéfiniment et peut afficher une erreur claire.
export function avecDelai<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
}
