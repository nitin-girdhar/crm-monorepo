FROM node:20-alpine AS base
RUN npm install -g pnpm@9.15.0
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/db/package.json packages/db/
COPY services/activities-service/package.json services/activities-service/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY tsconfig.base.json ./
COPY packages/db/ packages/db/
COPY services/activities-service/ services/activities-service/
RUN pnpm --filter @crm/db build
RUN pnpm --filter @crm/activities-service build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/services/activities-service/dist ./services/activities-service/dist
COPY packages/db/package.json ./packages/db/
COPY services/activities-service/package.json ./services/activities-service/
EXPOSE 4006
CMD ["node", "services/activities-service/dist/server.js"]
