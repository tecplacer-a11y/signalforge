# ─────────────────────────────────────────────────────────────
# SignalForge — production image
# Multi-stage: build the client+server bundle, then ship a slim runtime.
# ─────────────────────────────────────────────────────────────

# ---- Stage 1: build ----
FROM node:20-slim AS build
WORKDIR /app

# Install ALL deps (incl. dev) for the build
COPY package.json package-lock.json* ./
RUN npm ci

# Build client (Vite -> dist/public) + server (esbuild -> dist/index.cjs)
COPY . .
RUN npm run build

# Prune to production deps only (pg, drizzle-orm runtime, etc.)
RUN npm prune --omit=dev

# ---- Stage 2: runtime ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000

# Non-root user
RUN groupadd -r app && useradd -r -g app app

# Copy only what the server needs at runtime
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

USER app
EXPOSE 5000

# Simple healthcheck against the /healthz route
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.cjs"]
