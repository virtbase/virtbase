#!/usr/bin/env bash
#
# Tear the cluster down completely.
#
# `docker compose down -v` on its own is not enough. Loop devices and LVM volume
# groups live in the host kernel, shared by every container, so the OSD volume
# groups outlive the volumes that backed them - and the next bootstrap then finds
# OSDs belonging to a cluster that no longer exists. This wipes them while the
# containers are still around to do it.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE=(docker compose -f "$HERE/docker-compose.yml")
LVM_CONF='activation{udev_sync=0 udev_rules=0 verify_udev_operations=1}'

log() { printf '\033[1;36m❯\033[0m %s\n' "$*"; }

for node in pve1 pve2 pve3; do
  container="virtbase-$node"
  docker ps -a --format '{{.Names}}' | grep -qx "$container" || continue

  log "clearing ceph volume groups on $node"
  docker exec "$container" bash -c "
    for vg in \$(vgs --noheadings -o vg_name 2>/dev/null | tr -d ' ' | grep '^ceph-' || true); do
      vgremove --config '$LVM_CONF' -y \"\$vg\" >/dev/null 2>&1 || true
    done
    for dev in \$(losetup -j /osd/osd.img 2>/dev/null | cut -d: -f1); do
      losetup -d \"\$dev\" >/dev/null 2>&1 || true
    done
    # Loop devices are host state, so an earlier teardown that removed the volume
    # without detaching leaves an entry pointing at a deleted file - and those
    # eventually exhaust the pool ('cannot find an unused loop device').
    # Scoped to osd.img: the host has its own loop devices that must be left alone.
    losetup -a 2>/dev/null | grep 'osd\.img (deleted)' | cut -d: -f1 | while read -r stale; do
      losetup -d \"\$stale\" >/dev/null 2>&1 || true
    done
  " 2>/dev/null || true
done

log "removing containers and volumes"
"${COMPOSE[@]}" down -v

rm -f "$HERE/cluster.json" "$HERE/pve-root-ca.pem"
log "reset complete - run bootstrap.sh for a fresh cluster"
