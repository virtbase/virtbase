#!/usr/bin/env bash
#
# Take the cluster in cluster.yaml from "not there" or "stopped" to "the app can
# use it": create or start it with proxbase, apply the Virtbase patches to every
# node, and write the cluster.json the seed and the E2E suite read.
#
# Every step is idempotent, so this is also the way back after a reboot.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
NAME=virtbase
PATCH_DIR=/opt/virtbase-pve-patches

log() { printf '\033[1;36m❯\033[0m %s\n' "$*"; }

for tool in proxbase jq; do
  command -v "$tool" >/dev/null || {
    echo "$tool is required - see tooling/proxbase/README.md" >&2
    exit 1
  }
done

# ---------------------------------------------------------------- cluster ----

phase=$(proxbase list -o json | jq -r --arg name "$NAME" '.[] | select(.name == $name) | .phase')
case "$phase" in
  ready)
    log "starting $NAME"
    proxbase start "$NAME"
    ;;
  *)
    # A failed create is resumed by running it again.
    log "creating $NAME (a first create on this host takes 15-20 minutes)"
    proxbase create -f "$HERE/cluster.yaml"
    ;;
esac

nodes=$(proxbase status "$NAME" -o json | jq -r '.nodes[].name')

# ---------------------------------------------------------------- patches ----

# Without them cloud-init snippets cannot be uploaded, an uploaded hookscript is
# not executable, and `hookscript` is rejected on VM config updates - which is to
# say provisioning does not work. Applied after the create rather than baked
# into an image, because installing Ceph upgrades `libpve-storage-perl`, one of
# the packages they patch.
for node in $nodes; do
  log "applying pve-patches on $node"
  proxbase ssh "$NAME" "$node" -- mkdir -p "$PATCH_DIR"
  for file in patch.sh proxmox-snippet-upload.patch proxmox-snippet-mode.patch proxmox-hookscript.patch; do
    proxbase cp "$ROOT/tooling/pve-patches/$file" "$NAME:$node:$PATCH_DIR/$file" >/dev/null
  done
  proxbase ssh "$NAME" "$node" -- "chmod +x $PATCH_DIR/patch.sh &&
    { command -v patch >/dev/null || DEBIAN_FRONTEND=noninteractive apt-get install -y -qq patch >/dev/null; } &&
    $PATCH_DIR/patch.sh apply"
done

# ------------------------------------------------------------ credentials ----

# proxbase's own token, `proxbase@pve!api`, is an Administrator on `/` - the
# same rights the production token has.
env=$(proxbase env "$NAME" --format json)

# Proxmox serves its API with its own CA, and the client has no way to skip
# verification, so the CA is trusted through NODE_EXTRA_CA_CERTS instead.
cp "$(jq -r .caCert <<<"$env")" "$HERE/pve-root-ca.pem"

# Every node is addressed through the first node's forwarded port: pveproxy
# forwards `/nodes/<other>` to the right member. The port goes into `fqdn`,
# which the API client puts into the URL as it is.
jq --argjson nodes "$(proxbase status "$NAME" -o json)" '{
  fqdn: (.endpoint | ltrimstr("https://") | rtrimstr("/")),
  tokenId,
  tokenSecret,
  caFile: "tooling/proxbase/pve-root-ca.pem",
  storage: { vm: "vm-storage", iso: "cephfs", backup: "cephfs", snippet: "cephfs", import: "cephfs" },
  nodes: [$nodes.nodes[] | { hostname: .name, ip }]
}' <<<"$env" >"$HERE/cluster.json"
chmod 600 "$HERE/cluster.json"

log "cluster ready"
proxbase status "$NAME"
printf '\n\033[1;32m✔\033[0m credentials in tooling/proxbase/cluster.json\n'
printf '  export NODE_EXTRA_CA_CERTS=%s/pve-root-ca.pem\n' "$HERE"
