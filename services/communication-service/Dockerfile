FROM node:20-alpine AS base
RUN npm install -g pnpm@9.15.0
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY services/communication-service/package.json services/communication-service/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY tsconfig.base.json ./
COPY services/communication-service/ services/communication-service/
RUN pnpm --filter @crm/communication-service build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/services/communication-service/dist ./services/communication-service/dist
COPY services/communication-service/package.json ./services/communication-service/
EXPOSE 4009
CMD ["node", "services/communication-service/dist/server.js"]
