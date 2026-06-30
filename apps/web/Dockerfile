FROM node:22-alpine AS base
RUN npm install -g pnpm@9 turbo

FROM base AS builder
WORKDIR /app
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG API_GATEWAY_INTERNAL_URL=http://api-gateway:4000
ENV API_GATEWAY_INTERNAL_URL=$API_GATEWAY_INTERNAL_URL
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages/ packages/
COPY apps/web/ apps/web/
RUN echo "shamefully-hoist=true" > .npmrc
RUN pnpm install --frozen-lockfile
RUN pnpm turbo build --filter=@crm/web

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN npm install -g pnpm@9
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages/ packages/
COPY --from=builder /app/apps/web/.next/ apps/web/.next/
COPY --from=builder /app/apps/web/public/ apps/web/public/
COPY --from=builder /app/apps/web/package.json apps/web/package.json
COPY --from=builder /app/node_modules/ node_modules/
RUN echo "shamefully-hoist=true" > .npmrc
RUN pnpm install --frozen-lockfile --prod
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["../../node_modules/.bin/next", "start"]
