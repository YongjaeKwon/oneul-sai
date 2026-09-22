FROM node:22-alpine AS base
RUN npm install -g pnpm@11.24.0 turbo@2.11.2
WORKDIR /app

FROM base AS pruner
COPY . .
RUN turbo prune @oneul-sai/payment-service --docker

FROM base AS builder
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=@oneul-sai/payment-service

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app .
USER node
EXPOSE 4005
CMD ["node", "apps/payment-service/dist/main.js"]
