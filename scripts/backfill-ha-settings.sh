#!/usr/bin/env bash
#
# Backfill Proxmox HA resources + node-affinity rules for every VM in the
# cluster that does not already have them.
#
# Mirrors the runtime logic in:
#   packages/api/src/workflows/shared/update-ha-settings.ts (mode "create")
#
# Intended as a one-shot migration on clusters whose VMs predate the
# "HA-on-provision" change. Idempotent: existing resources / rules are left
# alone — including rules that reference the VM under a different name.
#
# Usage:
#   ./backfill-ha-settings.sh [options] <node> [<node> ...]
#
# Each <node> is added to the rule's affinity list with priority 0. Each VM's
# current node is also added with priority 0 (deduplicated), mirroring the
# `[primary, ...nodes]` set built by `updateHASettingsStep`.
#
# Requires `pvesh` (run on a Proxmox cluster node) and `jq`.
#

set -euo pipefail

DRY_RUN=0
NODES=()
IGNORED_NODES=()
IGNORED_VMS=()

RESOURCE_COMMENT="Backfilled resource"
RULE_COMMENT="Backfilled rule"

usage() {
  cat <<EOF
Usage: $0 [options] <node> [<node> ...]

Backfill HA resources and node-affinity rules for every VM in the cluster
that does not already have them. Mirrors the create-mode logic of
packages/api/src/workflows/shared/update-ha-settings.ts.

Options:
  --dry-run               Print the pvesh calls that would be made.
  --ignore-node <name>    Skip VMs currently on this node AND never include
                          it in any rule's affinity list. Repeatable.
  --ignore-vm <vmid>      Skip this specific VM entirely. Repeatable.
  -h, --help              Show this help.

Arguments:
  <node> ...   Hostnames to include in the HA node-affinity rule (priority 0
               each). Each VM's current node is also included automatically
               unless that node is in --ignore-node.

Required tools: pvesh (Proxmox node), jq.
EOF
}

require_value() {
  if [[ $# -lt 2 || -z "$2" ]]; then
    echo "Option '$1' requires a value." >&2
    usage >&2
    exit 1
  fi
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run)
        DRY_RUN=1
        shift
        ;;
      --ignore-node)
        require_value "$@"
        IGNORED_NODES+=("$2")
        shift 2
        ;;
      --ignore-node=*)
        IGNORED_NODES+=("${1#*=}")
        shift
        ;;
      --ignore-vm)
        require_value "$@"
        IGNORED_VMS+=("$2")
        shift 2
        ;;
      --ignore-vm=*)
        IGNORED_VMS+=("${1#*=}")
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      --)
        shift
        while [[ $# -gt 0 ]]; do
          NODES+=("$1")
          shift
        done
        ;;
      -*)
        echo "Unknown option: $1" >&2
        usage >&2
        exit 1
        ;;
      *)
        NODES+=("$1")
        shift
        ;;
    esac
  done

  if [[ ${#NODES[@]} -eq 0 ]]; then
    echo "At least one node is required." >&2
    usage >&2
    exit 1
  fi
}

require_tools() {
  if ! command -v pvesh >/dev/null; then
    echo "pvesh not found — run this script on a Proxmox cluster node." >&2
    exit 1
  fi
  if ! command -v jq >/dev/null; then
    echo "jq not found — install it with 'apt install jq'." >&2
    exit 1
  fi
}

# Membership helpers. `${arr[@]:-}` keeps `set -u` happy when the array is
# empty (the empty expansion still produces zero iterations).
array_contains() {
  local needle="$1"
  shift
  local item
  for item in "$@"; do
    [[ "${item}" == "${needle}" ]] && return 0
  done
  return 1
}

is_ignored_node() {
  array_contains "$1" "${IGNORED_NODES[@]:-}"
}

is_ignored_vm() {
  array_contains "$1" "${IGNORED_VMS[@]:-}"
}

# Print + execute, or print only in dry-run mode. Quoting via %q so the
# printed command is safe to copy-paste.
run_or_dry() {
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    printf '  [dry-run]'
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi
  "$@"
}

# Build the comma-separated `<hostname>:0,...` string used by HA node-affinity
# rules, preserving the first-seen order while removing duplicates and
# ignored nodes. Matches:
#   [...new Set([proxmoxNode.hostname, ...nodes])].map(h => `${h}:0`).join(",")
build_nodes_string() {
  local n
  local -a seen=()
  local out=""
  for n in "$@"; do
    if is_ignored_node "${n}"; then
      continue
    fi
    if array_contains "${n}" "${seen[@]:-}"; then
      continue
    fi
    seen+=("${n}")
    if [[ -z "${out}" ]]; then
      out="${n}:0"
    else
      out="${out},${n}:0"
    fi
  done
  printf '%s' "${out}"
}

# Returns 0 iff $sid appears in any existing node-affinity rule's resources
# list (rules store resources as a comma-separated string, possibly with
# whitespace around entries).
resource_covered_by_any_rule() {
  local sid="$1"
  jq -e --arg sid "${sid}" '
    [
      .[]
      | select(.type == "node-affinity")
      | (.resources // "")
      | split(",")
      | .[]
      | gsub("^ *| *$"; "")
    ]
    | any(. == $sid)
  ' <<< "${ha_rules_json}" >/dev/null
}

main() {
  parse_args "$@"
  require_tools

  echo "Fetching cluster state ..."
  # shellcheck disable=SC2034   # used by resource_covered_by_any_rule via globals
  local ha_resources_json ha_rules_json cluster_vms_json
  ha_resources_json="$(pvesh get /cluster/ha/resources --output-format json)"
  ha_rules_json="$(pvesh get /cluster/ha/rules --output-format json)"
  cluster_vms_json="$(pvesh get /cluster/resources --type vm --output-format json)"

  local created_resources=0
  local skipped_resources=0
  local created_rules=0
  local skipped_rules=0
  local skipped_templates=0
  local skipped_ignored=0

  local vmid node template
  local sid nodes_str
  while IFS=$'\t' read -r vmid node template; do
    # Skip QEMU templates — they cannot be HA-managed.
    if [[ "${template}" == "1" ]]; then
      skipped_templates=$((skipped_templates + 1))
      continue
    fi

    if is_ignored_vm "${vmid}"; then
      printf '  [skip]   vm:%-12s ignored via --ignore-vm\n' "${vmid}"
      skipped_ignored=$((skipped_ignored + 1))
      continue
    fi

    if is_ignored_node "${node}"; then
      printf '  [skip]   vm:%-12s on ignored node %s\n' "${vmid}" "${node}"
      skipped_ignored=$((skipped_ignored + 1))
      continue
    fi

    sid="vm:${vmid}"
    nodes_str="$(build_nodes_string "${node}" "${NODES[@]}")"

    if [[ -z "${nodes_str}" ]]; then
      printf '  [skip]   vm:%-12s no eligible nodes after applying --ignore-node\n' \
        "${vmid}"
      skipped_ignored=$((skipped_ignored + 1))
      continue
    fi

    # --- HA resource ---
    if jq -e --arg sid "${sid}" 'any(.[]; .sid == $sid)' \
        <<< "${ha_resources_json}" >/dev/null; then
      printf '  [skip]   resource %-14s already exists\n' "${sid}"
      skipped_resources=$((skipped_resources + 1))
    else
      printf '  [create] resource %-14s (currently on %s)\n' "${sid}" "${node}"
      run_or_dry pvesh create /cluster/ha/resources \
        --sid "${sid}" \
        --comment "${RESOURCE_COMMENT}" \
        --max_relocate 1 \
        --max_restart 1 \
        --state started
      created_resources=$((created_resources + 1))
    fi

    # --- HA node-affinity rule ---
    # Proxmox rejects creating a second node-affinity rule for the same
    # resource ("resource 'vm:X' is already used in another node affinity
    # rule"), so we check whether ANY existing rule references this sid,
    # not just one named ha-rule-<vmid>.
    if resource_covered_by_any_rule "${sid}"; then
      printf '  [skip]   rule for %-14s already covered by an existing node-affinity rule\n' \
        "${sid}"
      skipped_rules=$((skipped_rules + 1))
    else
      local rule_name="ha-rule-${vmid}"
      printf '  [create] rule     %-14s nodes=%s\n' "${rule_name}" "${nodes_str}"
      run_or_dry pvesh create /cluster/ha/rules \
        --rule "${rule_name}" \
        --type node-affinity \
        --comment "${RULE_COMMENT}" \
        --disable 0 \
        --nodes "${nodes_str}" \
        --resources "${sid}" \
        --strict 1
      created_rules=$((created_rules + 1))
    fi
  done < <(
    jq -r '
      .[]
      | select(.type == "qemu")
      | [.vmid, .node, (.template // 0)]
      | @tsv
    ' <<< "${cluster_vms_json}"
  )

  printf '\nSummary:\n'
  printf '  resources created: %d\n' "${created_resources}"
  printf '  resources skipped: %d\n' "${skipped_resources}"
  printf '  rules     created: %d\n' "${created_rules}"
  printf '  rules     skipped: %d\n' "${skipped_rules}"
  printf '  templates skipped: %d\n' "${skipped_templates}"
  printf '  ignored   skipped: %d\n' "${skipped_ignored}"

  if [[ "${DRY_RUN}" -eq 1 ]]; then
    printf '\n(dry-run — no changes were applied)\n'
  fi
}

main "$@"
