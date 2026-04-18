#!/usr/bin/env bash
# Loads .cursor/sentry-mcp.env (gitignored) then starts @sentry/mcp-server.
# Cursor's envFile is unreliable for some stdio servers; sourcing ensures the token is set.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/sentry-mcp.env"
if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi
exec bunx @sentry/mcp-server@latest \
  --host=sentry.virtbase.com \
  --disable-skills=seer \
  "$@"
