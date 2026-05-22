#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PVE_BASE="${PVE_BASE:-/usr/share/perl5/PVE}"

# Applied in this order; unapply reverses it.
DEFAULT_PATCH_FILES=(
  "${SCRIPT_DIR}/proxmox-snippet-upload.patch"
  "${SCRIPT_DIR}/proxmox-hookscript.patch"
)

# Tracks whether any patch was actually applied/reverted in this run, so we
# only restart Proxmox services when something changed.
CHANGES_MADE=0
# Tracks per-run failures so we keep going across patches and report a single
# non-zero exit at the end (instead of aborting on the first failure).
FAILED_PATCHES=()

usage() {
  cat <<'EOF'
Usage:
  ./patch.sh apply              apply all patches (idempotent)
  ./patch.sh unapply            revert all patches (idempotent)
  ./patch.sh status             show applied / pending state per patch
  ./patch.sh dry-run-apply      check that apply would succeed
  ./patch.sh dry-run-unapply    check that unapply would succeed

Patches that are already in the desired state are detected and skipped
without prompting or writing .rej files. Patches are processed independently
so a failure in one does not skip the rest. Services are restarted only when
at least one patch was newly applied or reverted.

Environment overrides:
  PVE_BASE=/usr/share/perl5/PVE       base directory (passed to `patch -d`)
  PATCH_FILES="path1 path2"           space-separated list (replaces defaults)
  PATCH_FILE=/path/to/single.patch    single patch only (legacy)
  SKIP_RESTART=1                      skip pvedaemon/pveproxy restart
EOF
}

resolve_patch_files() {
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

# Run `patch` non-interactively. `--batch` disables prompts entirely so a
# patch that looks already-applied or reversed fails fast rather than waiting
# on stdin. `-d` / `-p1` mirror what the README documents for manual use.
run_patch() {
  sudo patch --batch -d "${PVE_BASE}" -p1 "$@"
}

# Silent variant for detection passes — we don't care about stdout, only the
# exit code, but errors are still surfaced to stderr if something is really
# wrong with the patch file itself.
run_patch_quiet() {
  sudo patch --batch --silent -d "${PVE_BASE}" -p1 "$@" >/dev/null
}

# Classify a patch against the current PVE source tree.
#
# Echoes one of:
#   pending   - would apply cleanly (not yet applied)
#   applied   - reverse-applies cleanly (already applied)
#   unknown   - neither direction applies cleanly (partial / drifted / wrong)
classify_patch() {
  local patch_file="$1"
  if run_patch_quiet --dry-run < "${patch_file}" 2>/dev/null; then
    echo "pending"
    return 0
  fi
  if run_patch_quiet --dry-run -R < "${patch_file}" 2>/dev/null; then
    echo "applied"
    return 0
  fi
  echo "unknown"
}

apply_patch_file() {
  local patch_file="$1"
  local label
  label="$(basename "${patch_file}")"

  local state
  state="$(classify_patch "${patch_file}")"

  case "${state}" in
    applied)
      printf '  [skip]   %s — already applied\n' "${label}"
      ;;
    pending)
      printf '  [apply]  %s\n' "${label}"
      run_patch < "${patch_file}"
      CHANGES_MADE=1
      ;;
    unknown)
      printf '  [fail]   %s — does not apply cleanly against %s\n' \
        "${label}" "${PVE_BASE}" >&2
      # Surface the real reason to aid debugging without leaving .rej files
      # behind on disk.
      run_patch --dry-run --reject-file=- < "${patch_file}" >&2 || true
      FAILED_PATCHES+=("${label}")
      ;;
  esac
}

unapply_patch_file() {
  local patch_file="$1"
  local label
  label="$(basename "${patch_file}")"

  local state
  state="$(classify_patch "${patch_file}")"

  case "${state}" in
    pending)
      printf '  [skip]   %s — not currently applied\n' "${label}"
      ;;
    applied)
      printf '  [revert] %s\n' "${label}"
      run_patch -R < "${patch_file}"
      CHANGES_MADE=1
      ;;
    unknown)
      printf '  [fail]   %s — cannot be cleanly reverted from %s\n' \
        "${label}" "${PVE_BASE}" >&2
      run_patch --dry-run -R --reject-file=- < "${patch_file}" >&2 || true
      FAILED_PATCHES+=("${label}")
      ;;
  esac
}

dry_run_apply_patch_file() {
  local patch_file="$1"
  local label
  label="$(basename "${patch_file}")"

  local state
  state="$(classify_patch "${patch_file}")"

  case "${state}" in
    pending)
      printf '  [ok]     %s — would apply cleanly\n' "${label}"
      ;;
    applied)
      printf '  [skip]   %s — already applied, would be a no-op\n' "${label}"
      ;;
    unknown)
      printf '  [fail]   %s — would not apply cleanly\n' "${label}" >&2
      run_patch --dry-run --reject-file=- < "${patch_file}" >&2 || true
      FAILED_PATCHES+=("${label}")
      ;;
  esac
}

dry_run_unapply_patch_file() {
  local patch_file="$1"
  local label
  label="$(basename "${patch_file}")"

  local state
  state="$(classify_patch "${patch_file}")"

  case "${state}" in
    applied)
      printf '  [ok]     %s — would revert cleanly\n' "${label}"
      ;;
    pending)
      printf '  [skip]   %s — not applied, would be a no-op\n' "${label}"
      ;;
    unknown)
      printf '  [fail]   %s — would not revert cleanly\n' "${label}" >&2
      run_patch --dry-run -R --reject-file=- < "${patch_file}" >&2 || true
      FAILED_PATCHES+=("${label}")
      ;;
  esac
}

status_patch_file() {
  local patch_file="$1"
  local label
  label="$(basename "${patch_file}")"

  local state
  state="$(classify_patch "${patch_file}")"
  printf '  [%-7s] %s\n' "${state}" "${label}"
}

iterate_forward() {
  local fn="$1"
  local f
  for f in "${PATCH_FILES[@]}"; do
    "${fn}" "${f}"
  done
}

iterate_reverse() {
  local fn="$1"
  local i
  for ((i = ${#PATCH_FILES[@]} - 1; i >= 0; i--)); do
    "${fn}" "${PATCH_FILES[i]}"
  done
}

maybe_restart_services() {
  if [[ -n "${SKIP_RESTART:-}" ]]; then
    echo "SKIP_RESTART is set — not restarting services."
    return 0
  fi
  if [[ "${CHANGES_MADE}" -eq 0 ]]; then
    echo "No patches changed state — skipping service restart."
    return 0
  fi
  echo "Restarting pvedaemon and pveproxy ..."
  sudo systemctl restart pvedaemon pveproxy
}

report_failures() {
  if [[ "${#FAILED_PATCHES[@]}" -eq 0 ]]; then
    return 0
  fi
  echo "" >&2
  echo "The following patches failed:" >&2
  local p
  for p in "${FAILED_PATCHES[@]}"; do
    echo "  - ${p}" >&2
  done
  exit 1
}

main() {
  resolve_patch_files
  require_patch_files

  case "${1:-}" in
    apply)
      iterate_forward apply_patch_file
      maybe_restart_services
      report_failures
      ;;
    unapply)
      iterate_reverse unapply_patch_file
      maybe_restart_services
      report_failures
      ;;
    dry-run-apply)
      iterate_forward dry_run_apply_patch_file
      report_failures
      ;;
    dry-run-unapply)
      iterate_reverse dry_run_unapply_patch_file
      report_failures
      ;;
    status)
      iterate_forward status_patch_file
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "${@}"
