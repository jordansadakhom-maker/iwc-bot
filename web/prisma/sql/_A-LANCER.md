# SQL à lancer — récapitulatif

Source de vérité unique de ce qu'il reste à exécuter dans les bases Supabase.
Tous les scripts sont **additifs & idempotents** (rejouables sans risque, aucune
donnée existante touchée). Copier-coller dans le **SQL Editor** de la bonne base.

---

## ① Supabase PRINCIPAL de l'IWC (site + Armurerie)

| Fichier | Rôle | Obligatoire |
|---|---|---|
| [`licences.sql`](./licences.sql) | Système de Licences complet : types, licences, journal, numérotation officielle, config Armurerie, rôles, marqueur de notifications Discord | ✅ pour l'onglet **Licences** |
| [`demandes.sql`](./demandes.sql) | Plateforme centrale **Demandes** (tickets) : dossiers, messages, historique, numérotation `DEM-AAAA-NNNNN`, marqueur d'annonce Discord | ✅ pour l'onglet **Demandes** |
| [`notifications-corbeille.sql`](./notifications-corbeille.sql) | Colonne `supprime` du centre de notifications → **corbeille** (suppression réversible + restauration) | ⭕ recommandé (sinon suppression définitive) |
| [`activite-avant-apres.sql`](./activite-avant-apres.sql) | Colonne `ActivityLog.payload` + trigger → le journal affiche **motif/contexte** (avant→après déjà supporté) | ⭕ recommandé (journal détaillé) |
| [`perf-index-search.sql`](./perf-index-search.sql) | Index **trigram** (`pg_trgm`) accélérant la recherche universelle ⌘K | ⭕ optionnel (perf) |

## ② Supabase du DISPENSAIRE (projet séparé)

| Fichier | Rôle | Obligatoire |
|---|---|---|
| [`dispensaire-membre-rp.sql`](./dispensaire-membre-rp.sql) | 3 colonnes d'identité RP (`nomRp`, `prenomRp`, `serveur`) sur la fiche membre | ✅ pour les champs RP en Administration |
| [`perf-index-dispensaire.sql`](./perf-index-dispensaire.sql) | Index (dont composites) accélérant les grosses listes | ⭕ optionnel (perf) |

---

## Mode Audit

**Aucun SQL** — les pages `/audit` (IWC) et `/dispensaire/audit` (Dispensaire)
ne font que **lire** l'état courant. Rien à installer.

## Notifications Discord (hors SQL) — variables du bot

Sur l'hébergement du **bot** (Fly/Render), définir puis **redéployer le bot** :

- **`SALON_LICENCES`** = ID du salon Discord où poster les notifications de **licences**.
- **`SALON_DEMANDES`** = ID du salon où poster les notifications de **demandes**.

Sans elles, les notifications concernées restent silencieuses (rien d'autre n'est affecté).

## Assistant IA (hors SQL) — variable Vercel

Pour activer les fonctions IA (résumé/brouillon de demande, briefing…), définir
sur **Vercel** la variable **`ANTHROPIC_API_KEY`**. Absente, l'IA reste inactive
avec un message clair (aucune autre fonction affectée).

---

### Ordre conseillé
1. `licences.sql` → base principale.
2. `demandes.sql` → base principale.
3. `notifications-corbeille.sql` → base principale.
4. `dispensaire-membre-rp.sql` → base du Dispensaire.
5. (option) `perf-index-dispensaire.sql` → base du Dispensaire.
6. Variables bot `SALON_LICENCES` + `SALON_DEMANDES` (+ redéploiement du bot).
7. (option) Variable Vercel `ANTHROPIC_API_KEY` pour l'IA.
