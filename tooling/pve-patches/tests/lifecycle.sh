#!/usr/bin/env bash
#
# Installs, retriggers and removes the package in a throwaway Debian container,
# against the files of the real upstream packages.
#
# Usage: tests/lifecycle.sh DEB [SUITE]
#
# DEB is a built virtbase-pve-patches_*.deb. SUITE is the Proxmox VE repository
# component to take libpve-storage-perl and qemu-server from (default:
# pve-no-subscription). Needs Docker and network access.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "${SCRIPT_DIR}")"
IMAGE="${BUILD_IMAGE:-debian:trixie}"
DEB="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
SUITE="${2:-pve-no-subscription}"

UPSTREAM="$(mktemp -d)"
trap 'rm -rf -- "${UPSTREAM}"' EXIT
"${PACKAGE_DIR}/scripts/upstream.sh" fetch "${SUITE}" "${UPSTREAM}"

docker run --rm \
  -v "${DEB}:/test/package.deb:ro" \
  -v "${UPSTREAM}/debs:/test/upstream:ro" \
  "${IMAGE}" bash -euo pipefail -c '
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends patch >/dev/null

PATCH_SH=/usr/share/virtbase-pve-patches/patch.sh
METRICS=/var/lib/prometheus/node-exporter/virtbase_pve_patches.prom

step() { printf "\n== %s\n" "$*"; }
fail() { echo "FAIL: $*" >&2; exit 1; }

# Every patch in state $1, according to the patch.sh at $2.
expect() {
  local json
  json="$("${2:-${PATCH_SH}}" status --json)"
  echo "${json}"
  grep -o "\"state\":\"[a-z]*\"" <<<"${json}" | grep -qv "\"state\":\"$1\"" &&
    fail "expected every patch to be $1"
  return 0
}

# The owning packages are installed without their own dependencies, which a
# container cannot satisfy. Their postinsts do not need them.
step "Install the packages that own the patched files"
mkdir -p "$(dirname "${METRICS}")"
dpkg -i --force-depends /test/upstream/*.deb >/dev/null 2>&1

step "Install: the postinst applies every patch"
dpkg -i --force-depends /test/package.deb
expect applied
grep -q "virtbase_pve_patch_state{patch=\"proxmox-hookscript.patch\"} 1" "${METRICS}" ||
  fail "the metrics file does not report the patches as applied"
virtbase-pve-repatch status

step "Reinstall an owning package: the file trigger reapplies the patches"
output="$(dpkg -i --force-depends /test/upstream/libpve-storage-perl_*.deb 2>&1)"
echo "${output}" | grep -E "Processing triggers|\[(apply|skip)"
grep -q "Processing triggers for virtbase-pve-patches" <<<"${output}" ||
  fail "reinstalling libpve-storage-perl did not run the file trigger"
grep -q "\[apply \] proxmox-snippet-upload.patch" <<<"${output}" ||
  fail "the trigger did not reapply the reverted patch"
expect applied

step "Remove: the prerm reverts every patch and the postrm drops the metrics"
cp -a /usr/share/virtbase-pve-patches /test/patches
dpkg -r --force-depends virtbase-pve-patches
expect pending /test/patches/patch.sh
[[ ! -e "${METRICS}" ]] || fail "the metrics file survived the removal"

step "Purge"
dpkg -i --force-depends /test/package.deb >/dev/null
dpkg --purge --force-depends virtbase-pve-patches
expect pending /test/patches/patch.sh

printf "\nAll lifecycle checks passed.\n"
'
