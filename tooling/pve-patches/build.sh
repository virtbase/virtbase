#!/usr/bin/env bash
#
# Build virtbase-pve-patches_<version>_all.deb.
#
# Runs the build inside a Debian trixie container, which is what Proxmox VE 9
# is built on, so the result does not depend on what happens to be installed on
# the machine doing the building.
#
# Usage:
#   ./build.sh [output-dir]     # default: ./dist

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE="${BUILD_IMAGE:-debian:trixie}"

# Resolve to an absolute path, because it is handed to `docker -v`.
OUT_DIR="${1:-${SCRIPT_DIR}/dist}"
mkdir -p "${OUT_DIR}"
OUT_DIR="$(cd "${OUT_DIR}" && pwd)"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required to build the package" >&2
  exit 1
fi

echo "Building in ${IMAGE} ..."
docker run --rm \
  -v "${SCRIPT_DIR}:/src:ro" \
  -v "${OUT_DIR}:/out" \
  "${IMAGE}" bash -c '
set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null
apt-get install -y -qq --no-install-recommends debhelper build-essential >/dev/null
mkdir -p /build && cp -r /src/. /build/ && cd /build
rm -rf dist debian/virtbase-pve-patches debian/.debhelper
dpkg-buildpackage -us -uc -b
cp ../virtbase-pve-patches_*.deb /out/
chmod 0644 /out/virtbase-pve-patches_*.deb
'

echo ""
echo "Built:"
ls -1 "${OUT_DIR}"/virtbase-pve-patches_*.deb
echo ""
echo "Install on each node with:"
echo "  apt install ./virtbase-pve-patches_<version>_all.deb"
