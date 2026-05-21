#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: set-hookscript.sh --from VMID --to VMID --storage STORAGE [options]

Set the Proxmox guest hookscript for a range of VM IDs.

Required:
  --from VMID       First VM ID (inclusive)
  --to VMID         Last VM ID (inclusive)
  --storage NAME    Snippet storage ID (e.g. cephfs)

Options:
  --script NAME     Hookscript filename (default: hookscript.pl)
  --dry-run         Print commands without running them
  -h, --help        Show this help message

Example:
  ./scripts/set-hookscript.sh --from 1000 --to 1049 --storage cephfs
EOF
}

FROM=""
TO=""
STORAGE=""
SCRIPT="hookscript.pl"
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from)
      FROM="${2:-}"
      shift 2
      ;;
    --to)
      TO="${2:-}"
      shift 2
      ;;
    --storage)
      STORAGE="${2:-}"
      shift 2
      ;;
    --script)
      SCRIPT="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$FROM" || -z "$TO" || -z "$STORAGE" ]]; then
  echo "Missing required arguments." >&2
  usage >&2
  exit 1
fi

if ! [[ "$FROM" =~ ^[0-9]+$ && "$TO" =~ ^[0-9]+$ ]]; then
  echo "VM IDs must be positive integers." >&2
  exit 1
fi

if (( FROM > TO )); then
  echo "Invalid range: --from ($FROM) must be <= --to ($TO)." >&2
  exit 1
fi

HOOKSCRIPT="${STORAGE}:snippets/${SCRIPT}"

run_qm_set() {
  local vmid="$1"
  local cmd=(qm set "$vmid" --hookscript "$HOOKSCRIPT")

  if (( DRY_RUN )); then
    printf '[dry-run] %q\n' "${cmd[@]}"
    return 0
  fi

  echo "[*] Setting hookscript on VM $vmid..."
  "${cmd[@]}"
}

for (( vmid = FROM; vmid <= TO; vmid++ )); do
  run_qm_set "$vmid"
done

echo "[*] Done. Updated VM IDs ${FROM}-${TO} with hookscript ${HOOKSCRIPT}."
