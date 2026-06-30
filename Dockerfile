# ── Image du bot IWC pour Fly.io ───────────────────────────────
# Base Debian (glibc) — indispensable : les modules natifs précompilés
# (@discordjs/opus, sharp, le binaire ffmpeg-static) sont prévus pour glibc,
# pas pour musl (Alpine). On évite donc Alpine.
FROM node:22-bookworm-slim

# Outils de secours si un module natif doit se recompiler (sinon non utilisés).
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates python3 build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dépendances d'abord (meilleur cache Docker).
COPY package.json package-lock.json* ./
# npm ci si le lockfile est en phase, sinon fallback npm install.
RUN npm ci --omit=dev || npm install --omit=dev

# Code de l'application.
COPY . .

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "index.js"]
