FROM node:20-alpine AS base
RUN npm install -g pnpm@9.15.0
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/types/package.json packages/types/
COPY packages/auth-constants/package.json packages/auth-constants/
COPY packages/permissions/package.json packages/permissions/
COPY packages/db/package.json packages/db/
COPY services/analytics-service/package.json services/analytics-service/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY tsconfig.base.json ./
COPY packages/ packages/
COPY services/analytics-service/ services/analytics-service/
RUN pnpm --filter @crm/auth-constants build
RUN pnpm --filter @crm/types build
RUN pnpm --filter @crm/permissions build
RUN pnpm --filter @crm/db build
RUN pnpm --filter @crm/analytics-service build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/auth-constants/dist ./packages/auth-constants/dist
COPY --from=builder /app/packages/permissions/dist ./packages/permissions/dist
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/services/analytics-service/dist ./services/analytics-service/dist
COPY packages/types/package.json ./packages/types/
COPY packages/auth-constants/package.json ./packages/auth-constants/
COPY packages/permissions/package.json ./packages/permissions/
COPY packages/db/package.json ./packages/db/
COPY services/analytics-service/package.json ./services/analytics-service/
EXPOSE 4006
CMD ["node", "services/analytics-service/dist/server.js"]
