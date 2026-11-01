# Changelog

## 1.0.0 (2026-08-30)

### Features

- Ships the snippet-upload, snippet-mode and hookscript patches for Proxmox VE
  9, with a dpkg file trigger that reapplies them after any package writes to
  `/usr/share/perl5/PVE`, a daily systemd timer, and the patch state as
  node_exporter textfile metrics.
