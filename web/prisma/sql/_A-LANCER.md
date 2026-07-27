# SQL à lancer — récapitulatif

Source de vérité unique de ce qu'il reste à exécuter dans les bases Supabase.
Tous les scripts sont **additifs & idempotents** (rejouables sans risque, aucune
donnée existante touchée). Copier-coller dans le **SQL Editor** de la bonne base.

---

## ① Supabase PRINCIPAL de l'IWC (site + Armurerie)

| Fichier | Rôle | Obligatoire |
|---|---|---|
| [`licences.sql`](./licences.sql) | Système de Licences complet : types, licences, journal, numérotation officielle, config Armurerie, rôles, marqueur de notifications Discord | ✅ pour l'onglet **Licences** |

## ② Supabase du DISPENSAIRE (projet séparé)

| Fichier | Rôle | Obligatoire |
|---|---|---|
| [`dispensaire-membre-rp.sql`](./dispensaire-membre-rp.sql) | 3 colonnes d'identité RP (`nomRp`, `prenomRp`, `serveur`) sur la fiche membre | ✅ pour les champs RP en Administration |
| [`perf-index-dispensaire.sql`](./perf-index-dispensaire.sql) | Index (dont composites) accélérant les grosses listes | ⭕ optionnel (perf) |

---

## Mode Audit

**Aucun SQL** — les pages `/audit` (IWC) et `/dispensaire/audit` (Dispensaire)
ne font que **lire** l'état courant. Rien à installer.

## Notifications Discord des licences (hors SQL)

Sur l'hébergement du **bot** (Fly/Render), définir la variable d'environnement
**`SALON_LICENCES`** = l'ID du salon Discord où poster, puis **redéployer le bot**.
Sans elle, les notifications restent silencieuses (rien d'autre n'est affecté).

---

### Ordre conseillé
1. `licences.sql` → base principale.
2. `dispensaire-membre-rp.sql` → base du Dispensaire.
3. (option) `perf-index-dispensaire.sql` → base du Dispensaire.
4. Variable `SALON_LICENCES` + redéploiement du bot.
