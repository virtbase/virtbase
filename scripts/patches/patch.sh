#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PVE_BASE="/usr/share/perl5/PVE"

# Applied in this order; unapply reverses it.
DEFAULT_PATCH_FILES=(
  "${SCRIPT_DIR}/proxmox-snippet-upload.patch"
  "${SCRIPT_DIR}/proxmox-hookscript.patch"
)

usage() {
  cat <<'EOF'
Usage:
  ./patch.sh apply
  ./patch.sh unapply
  ./patch.sh dry-run-apply
  ./patch.sh dry-run-unapply

Applies both patches (snippet upload, hookscript) under /usr/share/perl5/PVE.

Environment overrides:
  PVE_BASE=/usr/share/perl5/PVE
  PATCH_FILES="path1 path2"   space-separated list (replaces defaults)
  PATCH_FILE=/path/to/single.patch   single patch only (legacy)
EOF
}

resolve_patch_files() {
  PATCH_FILES=()
  if [[ -n "${PATCH_FILE:-}" ]]; then
    PATCH_FILES=("${PATCH_FILE}")
  elif [[ -n "${PATCH_FILES:-}" ]]; then
    # shellcheck disable=SC2206
    PATCH_FILES=(${PATCH_FILES})
  else
    PATCH_FILES=("${DEFAULT_PATCH_FILES[@]}")
  fi
}

require_patch_files() {
  local f
  for f in "${PATCH_FILES[@]}"; do
    if [[ ! -f "${f}" ]]; then
      echo "Patch file not found: ${f}" >&2
      exit 1
    fi
  done
}

restart_services() {
  sudo systemctl restart pvedaemon pveproxy
}

apply_patch_file() {
  local patch_file="$1"
  echo "Applying ${patch_file} ..."
  sudo patch -d "${PVE_BASE}" -p1 < "${patch_file}"
}

unapply_patch_file() {
  local patch_file="$1"
  echo "Reverting ${patch_file} ..."
  sudo patch -R -d "${PVE_BASE}" -p1 < "${patch_file}"
}

dry_run_apply_patch_file() {
  local patch_file="$1"
  echo "Dry-run apply ${patch_file} ..."
  sudo patch --dry-run -d "${PVE_BASE}" -p1 < "${patch_file}"
}

dry_run_unapply_patch_file() {
  local patch_file="$1"
  echo "Dry-run revert ${patch_file} ..."
  sudo patch --dry-run -R -d "${PVE_BASE}" -p1 < "${patch_file}"
}

apply_patches() {
  local f
  for f in "${PATCH_FILES[@]}"; do
    apply_patch_file "${f}"
  done
}

unapply_patches() {
  local i
  for ((i = ${#PATCH_FILES[@]} - 1; i >= 0; i--)); do
    unapply_patch_file "${PATCH_FILES[i]}"
  done
}

dry_run_apply_patches() {
  local f
  for f in "${PATCH_FILES[@]}"; do
    dry_run_apply_patch_file "${f}"
  done
}

dry_run_unapply_patches() {
  local i
  for ((i = ${#PATCH_FILES[@]} - 1; i >= 0; i--)); do
    dry_run_unapply_patch_file "${PATCH_FILES[i]}"
  done
}

main() {
  resolve_patch_files
  require_patch_files

  case "${1:-}" in
    apply)
      apply_patches
      restart_services
      ;;
    unapply)
      unapply_patches
      restart_services
      ;;
    dry-run-apply)
      dry_run_apply_patches
      ;;
    dry-run-unapply)
      dry_run_unapply_patches
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "${@}"
