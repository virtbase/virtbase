#!/usr/bin/env bash
#
# Checks the patches against the packages Proxmox currently publishes.
#
# Usage:
#   scripts/upstream.sh fetch SUITE DIR    download and extract the packages
#                                          that own the patched files
#   scripts/upstream.sh check [SUITE...]   report whether the patches still fit
#   scripts/upstream.sh refresh [SUITE]    rebase the patches onto SUITE
#
# SUITE is a component of the Proxmox VE repository, such as
# pve-no-subscription or pve-test.
#
# `check` exits 1 when a patch no longer applies or upstream already contains
# it, and writes a Markdown report to $REPORT (default: stdout). When it runs
# in GitHub Actions it also sets the outputs `broken`, and `stale` when the
# patches apply to $REFRESH_SUITE only at moved line numbers.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "${SCRIPT_DIR}")"
MIRROR="${PVE_MIRROR:-http://download.proxmox.com/debian/pve}"
DIST="${PVE_DIST:-trixie}"
ARCH="${PVE_ARCH:-amd64}"
OWNERS=(libpve-storage-perl qemu-server)
REFRESH_SUITE="${REFRESH_SUITE:-pve-no-subscription}"

TMP_DIRS=()
cleanup() {
  local dir
  for dir in "${TMP_DIRS[@]}"; do
    [[ -n "${dir}" && -d "${dir}" ]] && rm -rf -- "${dir}"
  done
}
trap cleanup EXIT

new_tmp() {
  local dir
  dir="$(mktemp -d)"
  TMP_DIRS+=("${dir}")
  echo "${dir}"
}

# Prints the patch files in the order patch.sh applies them.
patch_files() {
  PVE_BASE="$1" "${PACKAGE_DIR}/patch.sh" status --json |
    grep -o '"patch":"[^"]*"' | sed 's/"patch":"\(.*\)"/\1/' |
    while read -r name; do echo "${PACKAGE_DIR}/${name}"; done
}

# Prints "version filename" of the newest PACKAGE in a gzipped Packages index.
newest() {
  local index="$1" package="$2" best_version="" best_file="" version file
  while read -r version file; do
    if [[ -z "${best_version}" ]] || dpkg --compare-versions "${version}" gt "${best_version}"; then
      best_version="${version}" best_file="${file}"
    fi
  done < <(gzip -dc "${index}" | awk -v p="${package}" '
    BEGIN { RS = "" }
    $0 ~ "(^|\n)Package: " p "\n" {
      version = ""; file = ""
      n = split($0, lines, "\n")
      for (i = 1; i <= n; i++) {
        if (lines[i] ~ /^Version: /) version = substr(lines[i], 10)
        if (lines[i] ~ /^Filename: /) file = substr(lines[i], 11)
      }
      print version, file
    }')
  [[ -n "${best_version}" ]] || {
    echo "${package} is not in ${MIRROR} ${DIST}/${index##*/}" >&2
    return 1
  }
  echo "${best_version} ${best_file}"
}

fetch() {
  local suite="$1" dir="$2" package entry version file
  mkdir -p "${dir}/debs" "${dir}/root"
  curl -fsSL "${MIRROR}/dists/${DIST}/${suite}/binary-${ARCH}/Packages.gz" \
    -o "${dir}/Packages.gz"
  : >"${dir}/versions"
  for package in "${OWNERS[@]}"; do
    entry="$(newest "${dir}/Packages.gz" "${package}")"
    version="${entry%% *}" file="${entry#* }"
    curl -fsSL "${MIRROR}/${file}" -o "${dir}/debs/${file##*/}"
    dpkg-deb -x "${dir}/debs/${file##*/}" "${dir}/root"
    echo "${package}=${version}" >>"${dir}/versions"
  done
}

# Applies every patch, in order, to a copy of the tree and prints one
# "name<TAB>result" line per patch: fits, moved (fits at other line numbers),
# upstream (already contained) or broken.
classify() {
  local tree="$1" work file output
  work="$(new_tmp)"
  cp -a "${tree}/." "${work}/"
  while read -r file; do
    if output="$(patch --batch --forward --fuzz=0 -d "${work}" -p1 <"${file}" 2>&1)"; then
      if grep -q 'offset' <<<"${output}"; then
        printf '%s\tmoved\n' "${file##*/}"
      else
        printf '%s\tfits\n' "${file##*/}"
      fi
    elif patch --batch --forward --fuzz=0 --dry-run -R -d "${work}" -p1 <"${file}" >/dev/null 2>&1; then
      printf '%s\tupstream\n' "${file##*/}"
    else
      printf '%s\tbroken\n' "${file##*/}"
    fi
  done < <(patch_files "${tree}")
}

check() {
  local suites=("$@") suite dir tree result name state report broken=0 stale=0
  [[ "${#suites[@]}" -gt 0 ]] || suites=(pve-no-subscription pve-test)
  report="$(new_tmp)/report.md"

  {
    echo "| Suite | libpve-storage-perl | qemu-server | Patch | Result |"
    echo "| --- | --- | --- | --- | --- |"
  } >"${report}"

  for suite in "${suites[@]}"; do
    dir="$(new_tmp)"
    fetch "${suite}" "${dir}"
    tree="${dir}/root/usr/share/perl5/PVE"
    local storage qemu
    storage="$(sed -n 's/^libpve-storage-perl=//p' "${dir}/versions")"
    qemu="$(sed -n 's/^qemu-server=//p' "${dir}/versions")"
    while IFS=$'\t' read -r name state; do
      case "${state}" in
        fits) result="applies" ;;
        moved)
          result="applies at moved line numbers"
          [[ "${suite}" != "${REFRESH_SUITE}" ]] || stale=1
          ;;
        upstream) result="**already upstream**" broken=1 ;;
        broken) result="**does not apply**" broken=1 ;;
      esac
      echo "| ${suite} | ${storage} | ${qemu} | ${name} | ${result} |" >>"${report}"
    done < <(classify "${tree}")
  done

  if [[ -n "${REPORT:-}" ]]; then cp "${report}" "${REPORT}"; else cat "${report}"; fi
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    echo "broken=$([[ "${broken}" -eq 1 ]] && echo true || echo false)" >>"${GITHUB_OUTPUT}"
    echo "stale=$([[ "${stale}" -eq 1 ]] && echo true || echo false)" >>"${GITHUB_OUTPUT}"
  fi
  return "${broken}"
}

# Regenerates each patch as the diff between two consecutive trees, so every
# patch keeps its changes and gets exact line numbers for SUITE.
refresh() {
  local suite="${1:-${REFRESH_SUITE}}" dir work previous current file target i=0
  dir="$(new_tmp)"
  fetch "${suite}" "${dir}"
  work="$(new_tmp)"
  cp -a "${dir}/root/usr/share/perl5/PVE" "${work}/0"

  while read -r file; do
    previous="${work}/${i}" current="${work}/$((i + 1))"
    cp -a "${previous}" "${current}"
    patch --batch --forward --fuzz=0 --silent -d "${current}" -p1 <"${file}"
    : >"${file}.new"
    while read -r target; do
      diff -u --label "a/${target}" --label "b/${target}" \
        "${previous}/${target}" "${current}/${target}" >>"${file}.new" || true
    done < <(sed -n 's|^+++ b/\([^[:space:]]*\).*|\1|p' "${file}")
    mv "${file}.new" "${file}"
    i=$((i + 1))
  done < <(patch_files "${dir}/root/usr/share/perl5/PVE")

  echo "Rebased the patches onto ${suite}:"
  cat "${dir}/versions"
}

main() {
  local command="${1:-}"
  shift || true
  case "${command}" in
    fetch)
      [[ "$#" -eq 2 ]] || {
        echo "Usage: $0 fetch SUITE DIR" >&2
        exit 64
      }
      fetch "$@"
      ;;
    check) check "$@" ;;
    refresh) refresh "$@" ;;
    *)
      sed -n '3,17p' "$0" | sed 's/^# \{0,1\}//'
      exit 64
      ;;
  esac
}

main "$@"
