#!/usr/bin/env bash
#
# Builds virtbase-pve-patches_<version>_all.deb in a Debian trixie container,
# the base of Proxmox VE 9, and checks it with lintian.
#
# Usage: ./build.sh [output-dir]    (default: ./dist)
#
# The version comes from version.txt and debian/changelog is generated from it.
# The changelog date, which dpkg uses as SOURCE_DATE_EPOCH, is the last commit
# that touched this directory, so a commit always builds the same package.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE="${BUILD_IMAGE:-debian:trixie}"
VERSION="$(tr -d '[:space:]' <"${SCRIPT_DIR}/version.txt")"
EPOCH="${SOURCE_DATE_EPOCH:-$(git -C "${SCRIPT_DIR}" log -1 --format=%ct -- . 2>/dev/null || true)}"
EPOCH="${EPOCH:-$(date +%s)}"

OUT_DIR="${1:-${SCRIPT_DIR}/dist}"
mkdir -p "${OUT_DIR}"
OUT_DIR="$(cd "${OUT_DIR}" && pwd)"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required to build the package" >&2
  exit 1
fi

echo "Building virtbase-pve-patches ${VERSION} in ${IMAGE} ..."
docker run --rm \
  -v "${SCRIPT_DIR}:/src:ro" \
  -v "${OUT_DIR}:/out" \
  -e VERSION="${VERSION}" \
  -e EPOCH="${EPOCH}" \
  -e OWNER="$(id -u):$(id -g)" \
  "${IMAGE}" bash -euo pipefail -c '
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends dpkg-dev lintian >/dev/null

mkdir -p /build/virtbase-pve-patches
tar -C /src --exclude=./dist -cf - . | tar -C /build/virtbase-pve-patches -xf -
cd /build/virtbase-pve-patches

cat >debian/changelog <<EOF
virtbase-pve-patches (${VERSION}) trixie; urgency=medium

  * Release ${VERSION}. The changes are listed in CHANGELOG.md.

 -- $(sed -n "s/^Maintainer: //p" debian/control)  $(date -u -R -d "@${EPOCH}")
EOF

apt-get build-dep -y -qq --no-install-recommends ./ >/dev/null
dpkg-buildpackage --build=all -us -uc
lintian --fail-on error,warning --info ../virtbase-pve-patches_*.changes

install -m 0644 ../virtbase-pve-patches_*.deb /out/
chown "${OWNER}" /out/virtbase-pve-patches_*.deb
'

ls -1 "${OUT_DIR}"/virtbase-pve-patches_*.deb
