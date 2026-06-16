FROM node:20-alpine AS base
RUN npm install -g pnpm@9.15.0
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml ./
COPY packages/types/package.json packages/types/
COPY packages/auth-constants/package.json packages/auth-constants/
COPY packages/permissions/package.json packages/permissions/
COPY packages/db/package.json packages/db/
COPY packages/validation/package.json packages/validation/
COPY packages/internal-client/package.json packages/internal-client/
COPY services/users-service/package.json services/users-service/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY tsconfig.base.json ./
COPY packages/ packages/
COPY services/users-service/ services/users-service/
RUN pnpm --filter @crm/types build
RUN pnpm --filter @crm/auth-constants build
RUN pnpm --filter @crm/permissions build
RUN pnpm --filter @crm/db build
RUN pnpm --filter @crm/validation build
RUN pnpm --filter @crm/internal-client build
RUN pnpm --filter @crm/users-service build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/auth-constants/dist ./packages/auth-constants/dist
COPY --from=builder /app/packages/permissions/dist ./packages/permissions/dist
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/validation/dist ./packages/validation/dist
COPY --from=builder /app/packages/internal-client/dist ./packages/internal-client/dist
COPY --from=builder /app/services/users-service/dist ./services/users-service/dist
COPY packages/types/package.json ./packages/types/
COPY packages/auth-constants/package.json ./packages/auth-constants/
COPY packages/permissions/package.json ./packages/permissions/
COPY packages/db/package.json ./packages/db/
COPY packages/validation/package.json ./packages/validation/
COPY packages/internal-client/package.json ./packages/internal-client/
COPY services/users-service/package.json ./services/users-service/
EXPOSE 4003
CMD ["node", "services/users-service/dist/server.js"]
