# IWC — Plateforme web (Poste de commandement)

Interface web qui centralise la gestion aujourd'hui répartie sur Discord
(Iron Wolf Company ⚖️ / La Confrérie 🔪). Elle partagera à terme **la même base
de données** que le bot Discord, qui continue de fonctionner en parallèle.

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** — design system « nuit frontière » (dark) + accent laiton/or,
  bascule de pôle Iron Wolf ↔ Confrérie
- **Recharts** (graphiques), **lucide-react** (icônes)
- **Prisma** + **PostgreSQL (Supabase)** — source de vérité unique *(branché en Phase 1)*
- Déployable tel quel sur **Vercel** (recommandé) ou **Render**

## État — Phase 0 (socle)

✅ Structure du projet, design system, coquille (barre latérale + header),
**Tableau de bord** fonctionnel avec données de démonstration, schéma de base
initial (`prisma/schema.prisma`).

⏭️ Phase 1 : connexion **Discord OAuth2**, récupération des rôles/permissions,
branchement des vraies données.

## Lancer en local

```bash
cd web
npm install
cp .env.example .env      # à remplir en Phase 1 (l'UI tourne déjà sans)
npm run dev               # http://localhost:3000
```

`npm run build` compile la version de production. `npm run typecheck` vérifie les types.

## Mise en place Phase 1 (à faire ensemble)

1. **Supabase** — créer un projet (gratuit) → récupérer `DATABASE_URL`, l'URL et
   les clés (`NEXT_PUBLIC_SUPABASE_URL`, `..._ANON_KEY`, `SERVICE_ROLE_KEY`).
2. **Discord Developer Portal** — créer une application → OAuth2 → renseigner
   `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` + URL de redirection.
3. Reporter le tout dans `.env` (jamais commité).
4. `npm run prisma:generate` puis la première migration.

## Arborescence

```
web/
├─ app/
│  ├─ layout.tsx            racine (thème sombre, métadonnées)
│  ├─ page.tsx              redirige vers /dashboard
│  └─ (app)/                coquille interne (sidebar + header)
│     ├─ layout.tsx
│     └─ dashboard/page.tsx
├─ components/
│  ├─ shell.tsx             barre latérale + header + bascule de pôle
│  └─ dashboard.tsx         KPI, courbe trésorerie, attention, kanban, notifs
├─ lib/data.ts              navigation + données de démonstration
└─ prisma/schema.prisma     modèle de données (source de vérité)
```
