#!/usr/bin/env bash
#
# Take the three containers from "running" to "the app can use them": a quorate
# PVE 9 cluster, Ceph with RBD and CephFS, an API token, and a cluster.json the
# seed reads.
#
# Every stage checks whether it has already been done, so re-running after a
# restart costs seconds instead of re-bootstrapping.
#
# Nothing here is the documented happy path - Proxmox does not expect to run in a
# container, and each workaround below is load-bearing. They are commented where
# the reason is not obvious.
set -euo pipefail

CLUSTER_NAME="${CLUSTER_NAME:-virtbase-dev}"
CEPH_NETWORK="${CEPH_NETWORK:-172.28.0.0/24}"
OSD_SIZE="${OSD_SIZE:-12G}"
NODES=(pve1 pve2 pve3)
declare -A NODE_IP=([pve1]=172.28.0.11 [pve2]=172.28.0.12 [pve3]=172.28.0.13)
PRIMARY=pve1

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# LVM refuses to create a logical volume in a container because udev never
# creates the device node it waits for. This tells it to make the node itself.
LVM_CONF='activation{udev_sync=0 udev_rules=0 verify_udev_operations=1}'

log()  { printf '\033[1;36m❯\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*"; }

pve() { docker exec "virtbase-$1" "${@:2}"; }

wait_for_api() {
  local node=$1 tries=90
  until pve "$node" pvesh get /version >/dev/null 2>&1; do
    tries=$((tries - 1))
    [ "$tries" -gt 0 ] || { warn "$node: API never came up"; return 1; }
    sleep 2
  done
}

# ---------------------------------------------------------------- cluster ----

cluster_is_formed() { pve "$PRIMARY" pvecm status >/dev/null 2>&1; }

# `/etc/pve` is pmxcfs, and pmxcfs mounts read-only until corosync reaches
# quorum. `pvecm create` and `pvecm add` both return before that happens, so
# anything that writes to /etc/pve immediately afterwards - the SSH key copy in
# `pvecm add`, `pveceph init` - fails with a bare "Permission denied".
wait_for_quorum() {
  # An actual write, not `test -w`: root passes the permission check even on a
  # read-only pmxcfs mount, so the test would return true immediately and defeat
  # the whole point of waiting.
  local node=$1 tries=60
  until pve "$node" bash -c 'touch /etc/pve/.bootstrap-probe && rm -f /etc/pve/.bootstrap-probe' >/dev/null 2>&1; do
    tries=$((tries - 1))
    [ "$tries" -gt 0 ] || { warn "$node: /etc/pve never became writable"; return 1; }
    sleep 2
  done
}
node_in_cluster()   { pve "$PRIMARY" pvecm nodes 2>/dev/null | grep -qE "\s$1(\s|\$)"; }

distribute_ssh_trust() {
  local pubkeys=""
  for node in "${NODES[@]}"; do
    pve "$node" bash -c '[ -f /root/.ssh/id_ed25519 ] || ssh-keygen -q -t ed25519 -N "" -f /root/.ssh/id_ed25519'
    pubkeys+="$(pve "$node" cat /root/.ssh/id_ed25519.pub)"$'\n'
  done

  for node in "${NODES[@]}"; do
    # `docker exec` only forwards stdin with -i, and `/root/.ssh/authorized_keys`
    # is a symlink into pmxcfs (`/etc/pve/priv/authorized_keys`) - append through
    # it rather than replacing the symlink with a regular file.
    printf '%s' "$pubkeys" | docker exec -i "virtbase-$node" bash -c '
      mkdir -p /root/.ssh && chmod 700 /root/.ssh
      touch /root/.ssh/authorized_keys
      while read -r key; do
        [ -n "$key" ] || continue
        grep -qF "$key" /root/.ssh/authorized_keys || printf "%s\n" "$key" >> /root/.ssh/authorized_keys
      done
    '
    for peer in "${NODES[@]}"; do
      pve "$node" bash -c "ssh-keyscan -H ${NODE_IP[$peer]} $peer >> /root/.ssh/known_hosts 2>/dev/null; sort -u /root/.ssh/known_hosts -o /root/.ssh/known_hosts"
    done
  done
}

form_cluster() {
  if cluster_is_formed; then
    log "cluster already formed"
  else
    log "creating cluster '$CLUSTER_NAME'"
    pve "$PRIMARY" pvecm create "$CLUSTER_NAME" --link0 "${NODE_IP[$PRIMARY]}"
    wait_for_quorum "$PRIMARY"
  fi

  for node in "${NODES[@]}"; do
    [ "$node" = "$PRIMARY" ] && continue
    node_in_cluster "$node" && { log "$node already joined"; continue; }
    log "joining $node"
    pve "$node" pvecm add "${NODE_IP[$PRIMARY]}" --link0 "${NODE_IP[$node]}" --use_ssh 1
    wait_for_quorum "$node"
  done
}

# ------------------------------------------------------------------- ceph ----

ceph_installed() { pve "$1" which ceph-osd >/dev/null 2>&1; }

install_ceph() {
  for node in "${NODES[@]}"; do
    ceph_installed "$node" && { log "ceph already installed on $node"; continue; }
    log "installing ceph on $node (a few minutes)"
    # `pveceph install` asks apt for confirmation and aborts without a TTY.
    yes | docker exec -i -e DEBIAN_FRONTEND=noninteractive "virtbase-$node" \
      pveceph install --repository no-subscription >/dev/null
  done
}

ceph_initialised() { pve "$PRIMARY" test -f /etc/pve/ceph.conf; }

init_ceph() {
  if ceph_initialised; then
    log "ceph already initialised"
  else
    log "initialising ceph on $CEPH_NETWORK"
    pve "$PRIMARY" pveceph init --network "$CEPH_NETWORK"
  fi

  # `/etc/ceph` lives in the container filesystem, not a volume, so recreating a
  # container (a port change, an image bump) silently loses these symlinks and
  # every ceph command then fails with "error calling conf_read_file".
  for node in "${NODES[@]}"; do
    pve "$node" bash -c '
      mkdir -p /etc/ceph
      [ -e /etc/ceph/ceph.conf ] || ln -s /etc/pve/ceph.conf /etc/ceph/ceph.conf
      [ -e /etc/ceph/ceph.client.admin.keyring ] ||
        ln -s /etc/pve/priv/ceph.client.admin.keyring /etc/ceph/ceph.client.admin.keyring
    ' || true
  done

  for node in "${NODES[@]}"; do
    if pve "$node" test -d "/var/lib/ceph/mon/ceph-$node"; then
      log "mon already on $node"
      continue
    fi
    log "creating mon on $node"
    # The first join races mon quorum; one retry is enough in practice.
    pve "$node" pveceph mon create || { sleep 10; pve "$node" pveceph mon create; }
  done
}

create_osds() {
  # The keyring is needed in two places: PVE points ceph.conf at its own path in
  # pmxcfs, while `ceph-volume` passes its upstream default explicitly on the
  # command line. Missing either one fails with a bare "RADOS object not found".
  pve "$PRIMARY" bash -c '[ -f /etc/pve/priv/ceph.client.bootstrap-osd.keyring ] ||
    ceph auth get-or-create client.bootstrap-osd mon "allow profile bootstrap-osd" \
      -o /etc/pve/priv/ceph.client.bootstrap-osd.keyring >/dev/null'

  for node in "${NODES[@]}"; do
    pve "$node" bash -c '
      mkdir -p /var/lib/ceph/bootstrap-osd
      [ -s /var/lib/ceph/bootstrap-osd/ceph.keyring ] ||
        cp /etc/pve/priv/ceph.client.bootstrap-osd.keyring /var/lib/ceph/bootstrap-osd/ceph.keyring
      chown -R ceph:ceph /var/lib/ceph/bootstrap-osd
    ' || true
  done

  for node in "${NODES[@]}"; do
    # Re-attach the backing file first: loop devices are host state and do not
    # survive a container restart, so the LVM volume group is invisible until it
    # is back.
    pve "$node" bash -c "
      [ -f /osd/osd.img ] || truncate -s $OSD_SIZE /osd/osd.img
      if ! losetup -j /osd/osd.img | grep -q .; then
        # `losetup -f` prints '/dev/loop8 (lost)' when the node is missing, so
        # take only the path.
        dev=\$(losetup -f | awk '{print \$1}')
        # The kernel allocates the loop device on the host, but nothing creates
        # its node inside the container - there is no udev here. Without this,
        # losetup reports 'device node /dev/loopN is lost'.
        [ -b \"\$dev\" ] || mknod \"\$dev\" b 7 \"\${dev#/dev/loop}\"
        losetup \"\$dev\" /osd/osd.img
      fi
      vgchange --config '$LVM_CONF' -ay >/dev/null 2>&1 || true
      # udev is what normally creates /dev/mapper entries, and it does not run
      # here - so LVM reports success while ceph-volume then fails with
      # '/dev/mapper/... not found'. This materialises the nodes by hand.
      dmsetup mknodes >/dev/null 2>&1 || true
    "

    # `/var/lib/ceph` lives in the container filesystem, so recreating a
    # container loses the OSD's metadata directory even though its data is safe
    # on the /osd volume. `activate` rebuilds that directory from the LVM tags,
    # which is the difference between a restart and a rebuild.
    # The only trustworthy signal is this node's own block device. Neither
    # `/var/lib/ceph/osd` nor `vgs` can be trusted: the directory accumulates
    # debris from OSDs that were adopted in error, and LVM is host-global so
    # every node lists every other node's volume groups. The LV on our loop
    # device carries `ceph.osd_id` / `ceph.osd_fsid` tags, and that is the truth.
    local osd_id osd_fsid
    read -r osd_id osd_fsid <<< "$(pve "$node" bash -c '
      dev=$(losetup -j /osd/osd.img | cut -d: -f1)
      vg=$(pvs --noheadings -o vg_name "$dev" 2>/dev/null | tr -d " ")
      [ -n "$vg" ] || exit 0
      tags=$(lvs --noheadings -o lv_tags "$vg" 2>/dev/null | tr "," "\n")
      printf "%s %s" \
        "$(printf "%s" "$tags" | sed -n "s/.*ceph.osd_id=\([0-9]*\).*/\1/p" | head -1)" \
        "$(printf "%s" "$tags" | sed -n "s/.*ceph.osd_fsid=\([0-9a-f-]*\).*/\1/p" | head -1)"
    ' 2>/dev/null)"

    if [ -n "${osd_id:-}" ] && [ -n "${osd_fsid:-}" ]; then
      log "activating osd.$osd_id on $node"
      pve "$node" ceph-volume lvm activate "$osd_id" "$osd_fsid" >/dev/null 2>&1 || true
    else
      log "creating osd on $node"
      pve "$node" bash -c "
        set -e
        dev=\$(losetup -j /osd/osd.img | cut -d: -f1)
        for vg in \$(pvs --noheadings -o vg_name \"\$dev\" 2>/dev/null | tr -d ' ' || true); do
          vgchange --config '$LVM_CONF' -an \"\$vg\" >/dev/null 2>&1 || true
          vgremove --config '$LVM_CONF' -y -f \"\$vg\" >/dev/null 2>&1 || true
        done
        wipefs -a \"\$dev\" >/dev/null 2>&1 || true
        uuid=\$(cat /proc/sys/kernel/random/uuid); vg=\"ceph-\$uuid\"
        pvcreate -y -ff \"\$dev\" >/dev/null
        vgcreate \"\$vg\" \"\$dev\" >/dev/null
        lvcreate --config '$LVM_CONF' -y -l 100%FREE -n \"osd-block-\$uuid\" \"\$vg\" >/dev/null
        dmsetup mknodes >/dev/null 2>&1 || true
        ceph-volume lvm create --data \"\$vg/osd-block-\$uuid\" >/dev/null
      "
    fi

    pve "$node" bash -c 'for id in $(ls /var/lib/ceph/osd 2>/dev/null | sed "s/ceph-//"); do
      systemctl is-active --quiet "ceph-osd@$id" || systemctl start "ceph-osd@$id" || true
    done'
  done
}

# An OSD that will not come back gets rebuilt rather than nursed.
#
# Device-mapper and loop devices are host state shared by every container, and
# after a restart an OSD's block device can end up unreadable ("Operation not
# permitted") even though its data is intact. On a disposable dev cluster the
# cheap answer is to purge and recreate: Ceph backfills from the other two
# replicas and the cluster is healthy again in seconds. On a real cluster this
# would of course be the wrong instinct entirely.
heal_osds() {
  for node in "${NODES[@]}"; do
    local id
    id=$(pve "$PRIMARY" bash -c "ceph osd tree 2>/dev/null | awk -v h=$node '
      \$3 == \"host\" { inhost = (\$4 == h) }
      inhost && \$1 ~ /^[0-9]+\$/ && \$5 == \"down\" { print \$1; exit }'" || true)
    [ -n "$id" ] || continue

    warn "osd.$id on $node did not come back - rebuilding it"
    pve "$PRIMARY" ceph osd purge "$id" --yes-i-really-mean-it >/dev/null 2>&1 || true
    pve "$node" bash -c "
      rm -rf /var/lib/ceph/osd/ceph-$id
      dev=\$(losetup -j /osd/osd.img | cut -d: -f1)
      for vg in \$(pvs --noheadings -o vg_name \"\$dev\" 2>/dev/null | tr -d ' ' || true); do
        # Deactivate before removing: an active volume group keeps the device
        # busy, vgremove fails, and pvcreate then refuses with 'device has a
        # signature'.
        vgchange --config '$LVM_CONF' -an \"\$vg\" >/dev/null 2>&1 || true
        vgremove --config '$LVM_CONF' -y -f \"\$vg\" >/dev/null 2>&1 || true
      done
      wipefs -a \"\$dev\" >/dev/null 2>&1 || true
      uuid=\$(cat /proc/sys/kernel/random/uuid); vg=\"ceph-\$uuid\"
      pvcreate -y -ff \"\$dev\" >/dev/null
      vgcreate \"\$vg\" \"\$dev\" >/dev/null
      lvcreate --config '$LVM_CONF' -y -l 100%FREE -n \"osd-block-\$uuid\" \"\$vg\" >/dev/null
      dmsetup mknodes >/dev/null 2>&1 || true
      ceph-volume lvm create --data \"\$vg/osd-block-\$uuid\" >/dev/null 2>&1
    " || warn "could not rebuild the osd on $node"
  done
}

create_storages() {
  if pve "$PRIMARY" ceph osd pool ls 2>/dev/null | grep -qx 'vm-storage'; then
    log "rbd pool already exists"
  else
    log "creating rbd pool"
    pve "$PRIMARY" pveceph pool create vm-storage --application rbd --pg_num 32 --add_storages 1
  fi

  # CephFS backs iso/backup/snippets: those need a filesystem, and making it
  # shared is what lets every node see the same ISO - the open TODO in
  # `packages/api/src/router/iso/index.ts`.
  if pve "$PRIMARY" ceph fs ls 2>/dev/null | grep -q 'name: cephfs'; then
    log "cephfs already exists"
  else
    for node in "${NODES[@]}"; do
      pve "$node" test -d "/var/lib/ceph/mds/ceph-$node" || pve "$node" pveceph mds create
    done
    log "creating cephfs"
    # Default pg_num of 128 exceeds mon_max_pg_per_osd on a three-OSD cluster.
    pve "$PRIMARY" pveceph fs create --pg_num 32
  fi

  # Retried: the filesystem is reported before its MDS is serving, and an add
  # attempted in that window fails. Swallowing it silently is how the storage
  # ends up missing with the cluster otherwise healthy.
  local tries=15
  until pve "$PRIMARY" bash -c 'pvesm status 2>/dev/null | grep -q "^cephfs "'; do
    pve "$PRIMARY" pvesm add cephfs cephfs --content iso,backup,snippets,vztmpl >/dev/null 2>&1 || true
    tries=$((tries - 1))
    [ "$tries" -gt 0 ] || { warn "cephfs storage could not be registered"; break; }
    sleep 4
  done
}

# ------------------------------------------------------------ credentials ----

write_cluster_json() {
  local token_id="virtbase@pve!api" secret

  pve "$PRIMARY" bash -c 'pveum user list 2>/dev/null | grep -q "virtbase@pve" ||
    pveum user add virtbase@pve --comment "Local development (virtbase)"'
  pve "$PRIMARY" pveum acl modify / --users virtbase@pve --roles Administrator >/dev/null 2>&1 || true

  if [ -f "$HERE/cluster.json" ] && pve "$PRIMARY" pveum user token list virtbase@pve 2>/dev/null | grep -q ' api '; then
    log "reusing existing API token"
    secret=$(sed -n 's/.*"tokenSecret": *"\([^"]*\)".*/\1/p' "$HERE/cluster.json")
  else
    # A token's secret is shown once, so an existing token with no cluster.json
    # to match it is useless - drop it and mint a fresh one.
    pve "$PRIMARY" pveum user token remove virtbase@pve api >/dev/null 2>&1 || true
    log "creating API token"
    secret=$(pve "$PRIMARY" pveum user token add virtbase@pve api --privsep 0 --output-format json |
      sed -n 's/.*"value":"\([^"]*\)".*/\1/p')
  fi

  # `ProxmoxEngine` uses bare `fetch` with no way to skip verification, and
  # Proxmox serves 8006 with its own CA - so the CA has to be trusted explicitly.
  pve "$PRIMARY" cat /etc/pve/pve-root-ca.pem > "$HERE/pve-root-ca.pem"

  # Every node is addressed through the primary's published port. pveproxy
  # forwards `/nodes/<other>` to the right member, and the API client cannot take
  # a port in its host field - so one entry point is the only shape that works.
  {
    printf '{\n  "fqdn": "127.0.0.1",\n  "tokenId": "%s",\n  "tokenSecret": "%s",\n' "$token_id" "$secret"
    printf '  "caFile": "tooling/proxmox-cluster/pve-root-ca.pem",\n'
    printf '  "storage": { "vm": "vm-storage", "iso": "cephfs", "backup": "cephfs", "snippet": "cephfs" },\n'
    printf '  "nodes": [\n'
    for i in "${!NODES[@]}"; do
      printf '    { "hostname": "%s", "ip": "%s" }%s\n' \
        "${NODES[$i]}" "${NODE_IP[${NODES[$i]}]}" "$([ $i -lt $((${#NODES[@]} - 1)) ] && echo ,)"
    done
    printf '  ]\n}\n'
  } > "$HERE/cluster.json"
  chmod 600 "$HERE/cluster.json"
}

# ------------------------------------------------------------------ main ----

for node in "${NODES[@]}"; do
  log "waiting for $node"
  wait_for_api "$node"
done

distribute_ssh_trust
form_cluster
install_ceph

# The Ceph stages are retried once as a unit. On a genuinely cold cluster the
# first pass can trip over its own freshness - a mon that is not serving yet, a
# ceph.conf that is written but not readable - and the second pass sails
# through because everything it needs now exists. Retrying beats telling people
# to run the script twice.
for attempt in 1 2; do
  if init_ceph && create_osds && heal_osds && create_storages; then
    break
  fi
  [ "$attempt" -eq 1 ] || { warn "ceph did not come up"; exit 1; }
  warn "ceph stage failed on the first pass, retrying"
  sleep 10
done

write_cluster_json

log "cluster ready"
pve "$PRIMARY" ceph -s | grep -E 'health|mon:|mgr:|osd:'
pve "$PRIMARY" pvesm status | tail -n +1
printf '\n\033[1;32m✔\033[0m credentials in tooling/proxmox-cluster/cluster.json\n'
printf '  export NODE_EXTRA_CA_CERTS=%s/pve-root-ca.pem\n' "$HERE"
printf '  web UI: https://127.0.0.1:8006 (root / %s)\n' "${PVE_PASSWORD:-virtbase}"
