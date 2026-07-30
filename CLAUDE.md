# CLAUDE.md — consignes de travail sur ce dépôt

Dépôt « Iron Wolf Company » : application web **Next.js** dans `web/` + **bot Discord**
à la racine, backend **Supabase**. Plateforme RP RDR2/RedM (dont le « Dispensaire de
Saint-Denis »). **Toujours répondre à l'utilisateur en français.**

## 📣 Récapitulatif après chaque grosse modification — OBLIGATOIRE

Après **toute modification substantielle** (nouvelle fonctionnalité, refonte, gros
correctif, lot livré/mergé), fournir **systématiquement et sans qu'on le redemande**
un récapitulatif **prêt à être transféré à l'équipe**, en plus du travail technique :

- **En français**, langage **simple et non technique**, orienté « **ce qui change pour
  vous** » (pas de jargon, pas de noms de fichiers/tables).
- **Format Discord** : emojis, titres courts, puces — présenté dans un **bloc
  copiable tel quel**.
- Par **défaut : version staff / joueurs**. Proposer en plus une **version Direction**
  (détails techniques + éventuels SQL à lancer dans Supabase) quand c'est pertinent.
- But : l'utilisateur le **copie-colle et le transmet** pour que tout le monde
  comprenne les changements.

## Vérification & livraison (rappel)

- Vérifier chaque lot de code dans `web/` : `npm run typecheck`, `npm test`,
  `npm run build`. (Une modif purement documentaire peut sauter le build.)
- Changements **additifs et réversibles**, **sans régression**, **design conservé**.
- Ne pas exécuter de SQL sur la base de l'utilisateur : fournir le SQL **prêt à
  copier-coller** (contenu complet, jamais un simple chemin de fichier).
