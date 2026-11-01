#!/usr/bin/env bash
#
# Applies, reverts and reports the Proxmox VE patches that sit next to this
# script. Every command is idempotent and handles each patch independently.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PVE_BASE="${PVE_BASE:-/usr/share/perl5/PVE}"

# Applied in this order and reverted in reverse. The snippet-mode patch is
# generated against a tree that already carries the snippet-upload patch, so
# its line numbers are exact only in this order.
DEFAULT_PATCH_FILES=(
  "${SCRIPT_DIR}/proxmox-snippet-upload.patch"
  "${SCRIPT_DIR}/proxmox-snippet-mode.patch"
  "${SCRIPT_DIR}/proxmox-hookscript.patch"
)

CHANGES_MADE=0
FAILED_PATCHES=()

usage() {
  cat <<'EOF'
Usage: patch.sh COMMAND

Commands:
  apply             apply every patch that is not applied yet
  unapply           revert every patch that is applied
  status [--json]   show each patch as applied, pending or unknown
  dry-run-apply     check that apply would succeed
  dry-run-unapply   check that unapply would succeed

Environment:
  PVE_BASE      tree the patches apply to (default /usr/share/perl5/PVE)
  PATCH_FILES   space-separated patch files, replacing the default list
  SKIP_RESTART  set to skip restarting pvedaemon and pveproxy
EOF
}

resolve_patch_files() {
  if [[ -n "${PATCH_FILES:-}" ]]; then
    read -r -a PATCH_FILES <<<"${PATCH_FILES}"
  else
    PATCH_FILES=("${DEFAULT_PATCH_FILES[@]}")
  fi

  local file
  for file in "${PATCH_FILES[@]}"; do
    if [[ ! -f "${file}" ]]; then
      echo "Patch file not found: ${file}" >&2
      exit 1
    fi
  done
}

# Escalates only when the tree is not writable, so a copy of it can be checked
# without privileges.
if [[ "$(id -u)" -eq 0 || -w "${PVE_BASE}" ]]; then
  SUDO=()
else
  SUDO=(sudo)
fi

# --forward is load-bearing: without it, --batch takes an already applied patch
# for a reversed one, reverts it and exits 0. --fuzz=0 makes a patch whose
# context has changed fail instead of landing in the wrong place.
run_patch() {
  "${SUDO[@]}" patch --batch --forward --fuzz=0 -d "${PVE_BASE}" -p1 "$@"
}

# Prints pending (applies cleanly), applied (reverts cleanly) or unknown
# (neither: the patch no longer fits this Proxmox version).
classify_patch() {
  local patch_file="$1"
  if run_patch --dry-run --silent <"${patch_file}" >/dev/null 2>&1; then
    echo pending
  elif run_patch --dry-run --silent -R <"${patch_file}" >/dev/null 2>&1; then
    echo applied
  else
    echo unknown
  fi
}

# Brings one patch into the state COMMAND asks for, or reports what it would do.
process_patch() {
  local command="$1" patch_file="$2"
  local label reverse=() wanted done_state verb
  label="$(basename "${patch_file}")"

  case "${command}" in
    apply | dry-run-apply)
      wanted=applied done_state=pending verb=apply
      ;;
    unapply | dry-run-unapply)
      wanted=pending done_state=applied verb=revert reverse=(-R)
      ;;
  esac

  local state
  state="$(classify_patch "${patch_file}")"

  if [[ "${state}" == "${wanted}" ]]; then
    printf '  [skip]   %s - already %s\n' "${label}" "${wanted}"
  elif [[ "${state}" == "${done_state}" ]]; then
    if [[ "${command}" == dry-run-* ]]; then
      printf '  [ok]     %s - would %s cleanly\n' "${label}" "${verb}"
    else
      printf '  [%-6s] %s\n' "${verb}" "${label}"
      run_patch "${reverse[@]}" <"${patch_file}"
      CHANGES_MADE=1
    fi
  else
    printf '  [fail]   %s - does not %s cleanly against %s\n' \
      "${label}" "${verb}" "${PVE_BASE}" >&2
    run_patch --dry-run "${reverse[@]}" --reject-file=- <"${patch_file}" >&2 || true
    FAILED_PATCHES+=("${label}")
  fi
}

process_all() {
  local command="$1" i
  if [[ "${command}" == *unapply ]]; then
    for ((i = ${#PATCH_FILES[@]} - 1; i >= 0; i--)); do
      process_patch "${command}" "${PATCH_FILES[i]}"
    done
  else
    for i in "${!PATCH_FILES[@]}"; do
      process_patch "${command}" "${PATCH_FILES[i]}"
    done
  fi
}

# Patch names come from file names in this directory, so they need no JSON
# escaping.
print_status() {
  local file label state first=1
  if [[ "${1:-}" == "--json" ]]; then
    printf '{"base":"%s","patches":[' "${PVE_BASE}"
    for file in "${PATCH_FILES[@]}"; do
      label="$(basename "${file}")"
      state="$(classify_patch "${file}")"
      [[ "${first}" -eq 1 ]] || printf ','
      first=0
      printf '{"patch":"%s","state":"%s"}' "${label}" "${state}"
    done
    printf ']}\n'
  else
    for file in "${PATCH_FILES[@]}"; do
      printf '  [%-7s] %s\n' "$(classify_patch "${file}")" "$(basename "${file}")"
    done
  fi
}

# The patched modules are loaded once by the API daemons, so a change only takes
# effect after a restart. A tree other than the installed one is not what the
# daemons load, and without a running systemd (a container, an image build)
# there is nothing to restart.
restart_services() {
  if [[ -n "${SKIP_RESTART:-}" || "${CHANGES_MADE}" -eq 0 ]]; then
    return 0
  fi
  if [[ "${PVE_BASE}" != /usr/share/perl5/PVE ]]; then
    return 0
  fi
  if [[ ! -d /run/systemd/system ]]; then
    echo "systemd is not running; restart pvedaemon and pveproxy yourself."
    return 0
  fi
  echo "Restarting pvedaemon and pveproxy ..."
  "${SUDO[@]}" systemctl restart pvedaemon pveproxy
}

report_failures() {
  [[ "${#FAILED_PATCHES[@]}" -eq 0 ]] && return 0
  printf '\nThese patches failed:\n' >&2
  printf '  - %s\n' "${FAILED_PATCHES[@]}" >&2
  exit 1
}

main() {
  local command="${1:-}"
  case "${command}" in
    apply | unapply)
      resolve_patch_files
      process_all "${command}"
      restart_services
      report_failures
      ;;
    dry-run-apply | dry-run-unapply)
      resolve_patch_files
      process_all "${command}"
      report_failures
      ;;
    status)
      resolve_patch_files
      print_status "${2:-}"
      ;;
    *)
      usage
      exit 64
      ;;
  esac
}

main "$@"
