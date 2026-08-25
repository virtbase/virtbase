# Proxmox with the Ceph server packages and the Virtbase patches already applied.
#
# Two reasons this is a build rather than plain `dockurr/proxmox`:
#
#   - `pveceph install` pulls ~106 MB and takes minutes, and installs into
#     `/usr`, which is container filesystem rather than a volume. Every
#     recreated container would pay that again.
#   - The snippet-upload and hookscript patches live in `/usr/share/perl5/PVE`,
#     so they are lost on recreation too. Without them cloud-init snippets
#     cannot be uploaded and `hookscript` is rejected on VM config updates -
#     which is to say provisioning does not work.
#
# Build context is the repository root so `scripts/patches` is reachable.
FROM dockurr/proxmox

ARG CEPH_RELEASE=squid

RUN echo "deb http://download.proxmox.com/debian/ceph-${CEPH_RELEASE} trixie no-subscription" \
      > /etc/apt/sources.list.d/ceph.list \
    && apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
         ceph-mon ceph-mgr ceph-osd ceph-mds ceph-volume gdisk patch \
    && rm -rf /var/lib/apt/lists/*

# Kept in the image so `patch.sh status` / `unapply` still work on a running node.
COPY scripts/patches /opt/patches

# Fails the build if a patch stops applying - which is what should happen when
# the upstream image moves to a Proxmox version these no longer fit.
RUN SKIP_RESTART=1 /opt/patches/patch.sh apply
