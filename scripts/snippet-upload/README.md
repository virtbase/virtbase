For snippet upload to work on Proxmox VE, a patch needs to be applied.
Otherwise we can not create and upload custom cloud-init files for our VMs.

See: https://bugzilla.proxmox.com/show_bug.cgi?id=2208

The snapshot of changes was taken on Proxmox VE version 9.1.5 and tested to be working.

The following files need to be replaced:

patches/snippet-upload/Status.pm => /usr/share/perl5/PVE/API2/Storage/Status.pm
patches/snippet-upload/Storage.pm => /usr/share/perl5/PVE/Storage.pm

The patches need to be applied on all nodes to work correctly.

After that restart the pvedaemon and pveproxy

sudo pvedaemon restart && sudo pveproxy restart