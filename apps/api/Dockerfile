FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/module-sdk/package.json ./packages/module-sdk/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile || pnpm install

FROM deps AS builder
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @deska/shared build
RUN pnpm --filter @deska/module-sdk build
RUN pnpm --filter @deska/api db:generate
RUN pnpm --filter @deska/api build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/packages ./packages
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["sh", "-c", "for attempt in $(seq 1 30); do ./node_modules/.bin/prisma migrate deploy --schema=./prisma/schema.prisma && exec node dist/main.js; echo \"Database is not ready (attempt $attempt/30); retrying...\"; sleep 3; done; exit 1"]
