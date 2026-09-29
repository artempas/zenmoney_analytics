# syntax=docker/dockerfile:1

# Base image can be overridden, e.g. --build-arg NODE_IMAGE=mirror.gcr.io/library/node:24-bookworm-slim
ARG NODE_IMAGE=node:24-bookworm-slim

# Native modules ship prebuilt binaries (better-sqlite3 prebuilds, @node-rs/argon2 optional deps),
# so install scripts (node-gyp) are skipped and no compiler toolchain is needed.

# ---- Build: compile the server and bundle the web app ----
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --ignore-scripts
COPY tsconfig.base.json ./
COPY shared shared
COPY server server
COPY web web
RUN npm run build

# ---- Production dependencies of the server only ----
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --ignore-scripts --workspace server && mkdir -p server/node_modules

# ---- Runtime ----
FROM ${NODE_IMAGE}
# The app runs as PUID:PGID (default: the image's "node" user, 1000:1000).
# The entrypoint starts as root only to hand the data directory to that user, then drops privileges.
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    PUID=1000 \
    PGID=1000
WORKDIR /app
COPY --from=deps /app/package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY --from=build /app/server/package.json ./server/
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/drizzle ./server/drizzle
COPY --from=build /app/web/dist ./web/dist
COPY --chmod=0755 docker-entrypoint.sh /usr/local/bin/zenmoney-entrypoint
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
ENTRYPOINT ["zenmoney-entrypoint"]
CMD ["node", "server/dist/index.js"]
