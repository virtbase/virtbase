# syntax=docker/dockerfile:1

# Built from the repository root, because the proxy imports workspace packages:
#
#   docker build -f apps/novnc-proxy/Dockerfile .
#
# The result is the proxy compiled into one executable (`bun build --compile`)
# on distroless/base: glibc, CA certificates and a non-root user, no shell and
# no package manager. The executable needs nothing from the image but libc.

FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS pruner
WORKDIR /app
COPY . .
RUN bunx turbo@2.11.7 prune @virtbase/novnc-proxy --docker

FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN bun install --frozen-lockfile --ignore-scripts
COPY --from=pruner /app/out/full/ .
WORKDIR /app/apps/novnc-proxy
# The package's own `compile` script, so the image and a local build cannot
# drift apart.
RUN bun run compile && cp dist/novnc-proxy /novnc-proxy

# Just the executable, for `docker build --target binary --output type=local,dest=.`
# - which is how the release workflow attaches it to a GitHub release.
FROM scratch AS binary
COPY --from=builder /novnc-proxy /novnc-proxy

FROM gcr.io/distroless/base-debian13:nonroot@sha256:f9518b74815721f537a7458cc693b4406208c04fce23bbffab511516117f34fd
COPY --from=builder /novnc-proxy /usr/local/bin/novnc-proxy
ENV PORT=8443
EXPOSE 8443
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["/usr/local/bin/novnc-proxy", "healthcheck"]
ENTRYPOINT ["/usr/local/bin/novnc-proxy"]
