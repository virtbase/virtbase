FROM oven/bun:1 AS base

FROM base AS builder
WORKDIR /app
COPY . .
RUN bunx turbo prune @virtbase/novnc-proxy --docker

FROM base AS installer
WORKDIR /app

COPY --from=builder /app/out/json/ .
RUN bun install --frozen-lockfile --production --ignore-scripts
COPY --from=builder /app/out/full/ .

FROM oven/bun:1-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 bun-user \
 && adduser --system --uid 1001 bun-user
USER bun-user

COPY --from=installer /app/ .

WORKDIR /app/apps/novnc-proxy
EXPOSE ${PORT:-8443}/tcp
ENTRYPOINT ["bun", "run", "src/index.ts"]
