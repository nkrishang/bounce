# syntax=docker/dockerfile:1.5

FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

# ---- Install dependencies ----
FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN pnpm install --frozen-lockfile --filter ./apps/api...

# ---- Build ----
FROM deps AS build

COPY apps/api apps/api
COPY packages/shared packages/shared
COPY packages/contracts packages/contracts

# Build dependencies first, then api
RUN pnpm --filter @thesis/shared run build && \
    pnpm --filter @thesis/contracts run build && \
    pnpm --filter @thesis/api run build

# ---- Runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

COPY --from=build /app /app

WORKDIR /app/apps/api
CMD ["node", "dist/index.js"]
