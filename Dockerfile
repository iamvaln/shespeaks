# One image for the app (`node server.js`) and the `migrate` service (`scripts/db.mjs setup`).
FROM node:22-alpine AS deps
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /src
COPY --from=deps /src/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 DATA_DIR=/data
COPY --from=build --chown=node:node /src/.next/standalone ./
COPY --from=build --chown=node:node /src/.next/static ./.next/static
COPY --from=build --chown=node:node /src/public ./public
# what the migrate service runs: the CLI, the migrations, and the one module they import
COPY --from=build --chown=node:node /src/scripts ./scripts
COPY --from=build --chown=node:node /src/supabase/migrations ./supabase/migrations
COPY --from=build --chown=node:node /src/src/lib/env.ts ./src/lib/env.ts
COPY --from=deps --chown=node:node /src/node_modules/postgres ./node_modules/postgres
# a named volume mounted here takes this ownership the first time, so the app (not root) can write photos
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 3000
CMD ["node", "server.js"]
