# syntax=docker/dockerfile:1

# Built from the repository root, because the proxy imports workspace packages:
#
#   docker build -f apps/novnc-proxy/Dockerfile .
#
# The result is the proxy compiled into one executable (`bun build --compile`)
# on distroless/base: glibc, CA certificates and a non-root user, no shell and
# no package manager. The executable needs nothing from the image but libc.

FROM oven/bun:1.4.2@sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895 AS pruner
WORKDIR /app
COPY . .
RUN bunx turbo@2.10.12 prune @virtbase/novnc-proxy --docker

FROM oven/bun:1.4.2@sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895 AS builder
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

FROM gcr.io/distroless/base-debian13:nonroot@sha256:a0d70d6a97cd697d9362bc2aae4a6560dd65817e365d0043b07325a97975dc91
COPY --from=builder /novnc-proxy /usr/local/bin/novnc-proxy
ENV PORT=8443
EXPOSE 8443
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["/usr/local/bin/novnc-proxy", "healthcheck"]
ENTRYPOINT ["/usr/local/bin/novnc-proxy"]
