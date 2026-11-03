#!/usr/bin/env bash
#
# Delete the cluster and the credentials written for it. `bun cluster:up` then
# creates a fresh one, in a few minutes once proxbase has its base image cached.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if proxbase list -o json | jq -e '.[] | select(.name == "virtbase")' >/dev/null; then
  proxbase destroy virtbase --yes
fi

rm -f "$HERE/cluster.json" "$HERE/pve-root-ca.pem"
printf '\033[1;36m❯\033[0m %s\n' "reset complete - run 'bun cluster:up' for a fresh cluster"
