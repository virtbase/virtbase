# Changelog

## [1.1.0](https://github.com/virtbase/virtbase/compare/pve-patches-v1.0.0...pve-patches-v1.1.0) (2026-11-01)


### Features

* **pve-patches:** release the package and watch upstream Proxmox VE ([#98](https://github.com/virtbase/virtbase/issues/98)) ([#102](https://github.com/virtbase/virtbase/issues/102)) ([c877500](https://github.com/virtbase/virtbase/commit/c8775006f6bbbe1e683d5e04cc2d81d0ade0eb4a))

## 1.0.0 (2026-08-30)

### Features

- Ships the snippet-upload, snippet-mode and hookscript patches for Proxmox VE
  9, with a dpkg file trigger that reapplies them after any package writes to
  `/usr/share/perl5/PVE`, a daily systemd timer, and the patch state as
  node_exporter textfile metrics.
