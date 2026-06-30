# Déployer le bot IWC sur Fly.io (avec la musique vocale)

Render bloque l'UDP → la musique vocale ne marche pas. **Fly.io laisse passer l'UDP**, donc le bot pourra parler dans le vocal. Ce guide te fait migrer en ~15 minutes.

Les fichiers nécessaires sont déjà dans le dépôt : `Dockerfile`, `.dockerignore`, `fly.toml`.

---

## 1. Installer l'outil Fly (une seule fois)

- **Windows (PowerShell)** : `iwr https://fly.io/install.ps1 -useb | iex`
- **Mac / Linux** : `curl -L https://fly.io/install.sh | sh`

Puis crée un compte / connecte-toi :

```bash
fly auth signup     # première fois
# ou
fly auth login
```

> Fly demande une carte bancaire. Ce n'est **pas gratuit** mais c'est peu : une petite machine allumée 24h/24 coûte ~5 $/mois. (Avantage : plus besoin d'UptimeRobot, la machine ne se met jamais en veille.)

---

## 2. Créer l'application

Depuis le dossier du projet (là où se trouve `fly.toml`) :

```bash
fly launch --no-deploy
```

- Quand il demande s'il faut réutiliser la config existante (`fly.toml`) → **oui**.
- Si le nom `iwc-bot` est déjà pris → accepte le nom proposé, ou choisis-en un. **Note bien ce nom**, ton URL sera `https://<nom>.fly.dev`.
- Ne déploie pas encore (`--no-deploy`) : on met d'abord les secrets.

---

## 3. Mettre les variables d'environnement (secrets)

Le plus simple : **recopier celles que tu as déjà sur Render**.

### Méthode rapide (en bloc)
Sur Render → ton service → onglet **Environment** → copie tes variables dans un fichier `.env` local (format `CLÉ=valeur`, une par ligne), puis :

```bash
fly secrets import < .env
```

(supprime le fichier `.env` ensuite, il contient tes clés).

### Méthode manuelle (une par une)
```bash
fly secrets set DISCORD_TOKEN=xxxx
fly secrets set ANTHROPIC_API_KEY=xxxx
fly secrets set GITHUB_TOKEN=xxxx GITHUB_GIST_ID=xxxx
# ... etc.
```

### Variables à ne pas oublier
| Variable | À quoi ça sert | Indispensable ? |
|----------|----------------|-----------------|
| `DISCORD_TOKEN` (ou `TOKEN`) | connexion du bot | ✅ oui |
| `GITHUB_TOKEN` + `GITHUB_GIST_ID` | sauvegarde des données | ✅ oui |
| `ANTHROPIC_API_KEY` | fonctions IA (rapports, profils…) | ✅ oui |
| `PUBLIC_URL` | liens carte / tableau web | ✅ **à mettre = ton URL Fly** |
| `OPENAI_API_KEY` | génération d'images | si utilisé |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | images (alternative) | si utilisé |
| `NOTION_TOKEN` + `NOTION_*_DB` | intégration Notion | si utilisé |
| `CLIENT_ID`, `GUILD_ID` | commandes slash | si déjà présents |
| autres (`SEUIL_*`, `LIMITE_*`, `*_CHANNEL_ID`, `NOTE_SECRET`…) | réglages | recopie-les |

**Important — l'URL publique** (pour que la carte et le tableau web marchent) :
```bash
fly secrets set PUBLIC_URL=https://<nom-de-ton-app>.fly.dev
```

> Pas besoin de `PORT` : il est déjà fixé dans `fly.toml` (8080).

---

## 4. Déployer

```bash
fly deploy
```

Le premier build prend quelques minutes (il installe ffmpeg, opus, sharp…). Ensuite :

```bash
fly logs        # voir les logs en direct
```

Tu dois voir : `✅ Connecté : ...`, `🔐 musique : libsodium prêt`, et le rapport des dépendances audio.

---

## 5. Tester la musique 🎶

1. Rejoins un salon vocal sur Discord.
2. Dans le salon **🎶 musique**, choisis une station puis clique **▶️ Lancer**.
3. Dans `fly logs` tu dois voir :
   - `🎙️ musique : connecté au vocal …`
   - `🎵 ffmpeg reçoit de l'audio (…) — flux OK`
   - `🔊 musique : lecture en cours`
4. Et cette fois… tu **entends** la musique. 🤠

---

## 6. Éteindre l'ancien service Render

Une fois que tout marche sur Fly, **suspends ou supprime** le service sur Render (sinon deux bots tournent en parallèle et répondent en double).

> Tu peux aussi désactiver le ping UptimeRobot : inutile sur Fly.

---

## Dépannage rapide
- **Toujours muet** → `fly logs` : si tu vois encore `voice connect timeout`, vérifie que tu es bien sur Fly (et pas Render), et que le bot n'est pas « rendu muet » dans le salon.
- **Le bot répond en double** → l'ancien service Render tourne encore : suspends-le.
- **Carte / tableau cassés** → vérifie `fly secrets list` : `PUBLIC_URL` doit pointer vers `https://<ton-app>.fly.dev`.
- **Manque de mémoire (OOM)** → dans `fly.toml`, monte `memory = "2048mb"` puis `fly deploy`.
- **Données disparues au redéploiement** → normal si la sauvegarde Gist n'était pas faite ; elle l'est désormais ~12 s après chaque changement. Vérifie `GITHUB_TOKEN`/`GITHUB_GIST_ID`.
