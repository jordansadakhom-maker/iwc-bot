# ── Image du bot IWC pour Fly.io ───────────────────────────────
# Base Debian (glibc) — indispensable : les modules natifs précompilés
# (@discordjs/opus, sharp, le binaire ffmpeg-static) sont prévus pour glibc,
# pas pour musl (Alpine). On évite donc Alpine.
FROM node:22-bookworm-slim

# Outils de secours si un module natif doit se recompiler (sinon non utilisés).
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates python3 build-essential curl \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp : extraction audio YouTube (binaire autonome, mis à jour souvent).
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
      -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp \
    && /usr/local/bin/yt-dlp --version

WORKDIR /app

# Dépendances d'abord (meilleur cache Docker).
COPY package.json package-lock.json* ./
# npm ci si le lockfile est en phase, sinon fallback npm install.
RUN npm ci --omit=dev || npm install --omit=dev

# Code de l'application.
COPY . .

ENV NODE_ENV=production
ENV PORT=8080
# Active le module musique intégré (voix + yt-dlp) — uniquement dans cette image
# (Fly), où l'UDP et yt-dlp sont disponibles. Absent sur Render → module en sommeil.
ENV MUSIQUE_ENABLED=1
EXPOSE 8080

CMD ["node", "index.js"]
