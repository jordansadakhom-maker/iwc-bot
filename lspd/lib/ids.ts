// Identifiants stables, préfixés par type (lisibles dans les journaux et les URL).
export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// Numéro de référence lisible pour les interventions / dossiers (ex. INT-2A3F9K).
export function refCode(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}
