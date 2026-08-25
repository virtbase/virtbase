--> Backfilled rather than added NOT NULL outright, which fails on a table with
--> rows. The right source is `proxmox_templates_to_proxmox_nodes.storage`: that
--> is where this node's template disks actually lived, so it is where a clone
--> would have put a new guest's disk. A node with no templates has nothing to
--> infer from and gets `local-lvm`, Proxmox's own default - node validation
--> reports it if that is wrong.
ALTER TABLE "proxmox_nodes" ADD COLUMN "vm_storage" text;--> statement-breakpoint
UPDATE "proxmox_nodes" AS n SET "vm_storage" = COALESCE(
  (
    SELECT t."storage"
    FROM "proxmox_templates_to_proxmox_nodes" AS t
    WHERE t."proxmox_node_id" = n."id"
    GROUP BY t."storage"
    ORDER BY COUNT(*) DESC, t."storage" ASC
    LIMIT 1
  ),
  'local-lvm'
) WHERE n."vm_storage" IS NULL;--> statement-breakpoint
ALTER TABLE "proxmox_nodes" ALTER COLUMN "vm_storage" SET NOT NULL;