# Dispensaire de Saint-Denis — registre 1904

Site **séparé** (indépendant du site principal de l'armurerie), public et sans
connexion, présenté comme un vieux registre de dispensaire (papier sépia, 1904).
Il réutilise **la même base Supabase** que le site principal (tables préfixées
`Disp…`, aucune table existante n'est touchée).

## Onglets

1. **Accueil** — tableau de bord (vignettes de synthèse) + prise / fin de service
   (chrono des heures) + stocks en alerte.
1bis. **Patients** — fiches patients : **scanner une photo de carte d'identité**
   → l'IA remplit nom, prénom, date de naissance, sexe, nationalité, n° de carte ;
   + dossier médical (groupe sanguin, allergies, notes). *(scan : `ANTHROPIC_API_KEY`)*
2. **Stockage** — coffres, matières premières, matériel, nourriture ; `+/‑` avec
   traçabilité (qui a pris/ajouté quoi) et seuils d'alerte ; correction directe
   d'une quantité au clic ; filtres par catégorie ; **« Scanner une photo »** :
   glisser une photo du coffre/panneau → l'IA lit les quantités et met à jour le
   stock (nécessite `ANTHROPIC_API_KEY`).
3. **Facturation F.D.O.** — shérifs par bureau + prix du soin.
4. **Répertoire** — coordonnées des entreprises (mine, menuiserie…).
5. **Personnel** 🔒 — salariés, niveaux, qualifications, n° compte bancaire et
   télégramme (protégé par un code).
6. **Certificats** — remplissage rapide, aperçu imprimable, dépôt sur Discord
   (webhook) et bouton *Effacer*.
7. **Documents** — documents importants (liens + notes).
8. **Ventes de bandages** — vente aux civils, limite **10 / semaine / patient**,
   alerte automatique à la limite.
9. **Factures en retard** 🔒 — factures patients, alerte quand l'échéance est
   dépassée (protégé par un code).

## Déploiement (nouveau projet Vercel)

1. **Nouveau projet Vercel** → même dépôt Git, **Root Directory = `dispensaire`**.
2. Variables d'environnement (onglet *Settings → Environment Variables*) :
   - `SUPABASE_URL` — identique au site principal.
   - `SUPABASE_SERVICE_ROLE_KEY` — clé `service_role` (secrète).
   - `DISP_CODE_CHEF` — le code des onglets Personnel / Factures.
   - `DISP_DISCORD_WEBHOOK` *(optionnel)* — URL de webhook Discord pour les
     certificats (Salon → Paramètres → Intégrations → Webhooks).
   - `ANTHROPIC_API_KEY` *(optionnel)* — active « Scanner une photo » du stock.
3. Dans Supabase → **SQL Editor**, exécuter **une fois** `dispensaire/sql/init.sql`
   (additif et idempotent : il ne touche pas aux tables existantes).
4. Déployer. Le site s'ouvre sur l'Accueil ; les onglets se remplissent au fur et
   à mesure des saisies.

Tant que la base n'est pas reliée, chaque page l'indique clairement plutôt que de
planter.
