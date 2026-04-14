#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCH_FILE="${SCRIPT_DIR}/proxmox-snippet-upload.patch"
PVE_BASE="/usr/share/perl5/PVE"

usage() {
  cat <<'EOF'
Usage:
  ./patch.sh apply
  ./patch.sh unapply
  ./patch.sh dry-run-apply
  ./patch.sh dry-run-unapply

Environment overrides:
  PATCH_FILE=/path/to/proxmox-snippet-upload.patch
  PVE_BASE=/usr/share/perl5/PVE
EOF
}

require_patch_file() {
  if [[ ! -f "${PATCH_FILE}" ]]; then
    echo "Patch file not found: ${PATCH_FILE}" >&2
    exit 1
  fi
}

restart_services() {
  sudo systemctl restart pvedaemon pveproxy
}

apply_patch() {
  sudo patch -d "${PVE_BASE}" -p1 < "${PATCH_FILE}"
}

unapply_patch() {
  sudo patch -R -d "${PVE_BASE}" -p1 < "${PATCH_FILE}"
}

dry_run_apply() {
  sudo patch --dry-run -d "${PVE_BASE}" -p1 < "${PATCH_FILE}"
}

dry_run_unapply() {
  sudo patch --dry-run -R -d "${PVE_BASE}" -p1 < "${PATCH_FILE}"
}

main() {
  require_patch_file

  case "${1:-}" in
    apply)
      apply_patch
      restart_services
      ;;
    unapply)
      unapply_patch
      restart_services
      ;;
    dry-run-apply)
      dry_run_apply
      ;;
    dry-run-unapply)
      dry_run_unapply
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "${@}"
