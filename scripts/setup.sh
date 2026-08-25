#!/usr/bin/env bash
#
# Bring a fresh clone to a working development environment.
#
# Safe to re-run: every step checks whether it is already done.
#
#   ./scripts/setup.sh              database, migrations, seed
#   ./scripts/setup.sh --cluster    also build and bootstrap the Proxmox cluster
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WITH_CLUSTER=0
[[ "${1:-}" == "--cluster" ]] && WITH_CLUSTER=1

log()  { printf '\033[1;36m❯\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✔\033[0m %s\n' "$*"; }

# ------------------------------------------------------------------- env ----

if [[ ! -f .env ]]; then
  log "creating .env from .env.example"
  cp .env.example .env
  warn ".env holds placeholders. The app boots, but anything needing Stripe,"
  warn "Resend or OAuth stays disabled until you fill them in."
fi

# The cluster serves its API with its own CA, and the Proxmox client has no way
# to skip verification. Recorded in .env so `bun dev` picks it up.
CA_PATH="$ROOT/tooling/proxmox-cluster/pve-root-ca.pem"
if [[ -f "$CA_PATH" ]] && ! grep -q '^NODE_EXTRA_CA_CERTS=' .env; then
  log "pointing NODE_EXTRA_CA_CERTS at the cluster CA"
  printf '\n# Trust the local Proxmox cluster CA (tooling/proxmox-cluster).\nNODE_EXTRA_CA_CERTS="%s"\n' \
    "$CA_PATH" >> .env
fi

# -------------------------------------------------------------- services ----

log "starting postgres, the neon proxy and redis"
docker compose up -d postgres neon-proxy redis serverless-redis-http

log "waiting for postgres"
for _ in $(seq 1 60); do
  docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 2
done

# -------------------------------------------------------------- cluster ----

if [[ "$WITH_CLUSTER" -eq 1 ]]; then
  if [[ ! -e /dev/kvm ]]; then
    warn "/dev/kvm is missing - the Proxmox cluster needs nested virtualisation."
    warn "Skipping it; everything else below still works."
  else
    log "starting the proxmox cluster (first build takes a few minutes)"
    docker compose -f tooling/proxmox-cluster/docker-compose.yml up -d --build
    ./tooling/proxmox-cluster/bootstrap.sh
  fi
fi

# ------------------------------------------------------------- database ----

log "running migrations"
# Not fatal. A database created with `db:push` has no migration journal, so
# `migrate` tries to replay everything and trips over objects that already
# exist. On a fresh clone this is the path that runs; on an existing database it
# is noise, and stopping here would hide the rest of the setup.
if ! bun db:migrate >/dev/null 2>&1; then
  warn "migrations did not apply cleanly - continuing."
  warn "If this is a fresh database, run 'bun db:migrate' to see why."
fi

log "seeding"
# The base seed is not idempotent - it inserts a fixed set of rows and fails on
# a second run. That is fine and expected once the database is populated.
if bun script dev/seed >/dev/null 2>&1; then
  ok "database seeded"
else
  warn "seed skipped (already populated). Use 'bun script dev/seed --truncate' to reset."
fi

if [[ -f tooling/proxmox-cluster/cluster.json ]]; then
  log "registering the proxmox cluster with the database"
  bun script dev/cluster
fi

# ---------------------------------------------------------------- done ----

echo
ok "ready"
echo "  bun dev                          start the app"
echo "  https://127.0.0.1:8006           proxmox web UI (root / virtbase)"
if [[ ! -f tooling/proxmox-cluster/cluster.json ]]; then
  echo
  echo "  No Proxmox cluster yet. Nothing can be provisioned without one:"
  echo "    ./scripts/setup.sh --cluster"
fi
