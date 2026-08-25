--> The template <-> node link table recorded which vmid a template VM had on
--> each node. Templates are declared against an image now and have no vmid, so
--> the table has nothing left to say. `proxmox_template_images` replaces it.
DROP TABLE "proxmox_templates_to_proxmox_nodes";--> statement-breakpoint

--> Every template must now name an image. Making the column NOT NULL outright
--> would fail on any half-declared row, so the rows are dealt with first.
--> A template with no image cannot be provisioned either way; the only question
--> is whether it can be deleted.
--> 1. Withdraw anything unusable, so it cannot be offered while being fixed.
UPDATE "proxmox_templates" SET "enabled" = false WHERE "image_url" IS NULL;--> statement-breakpoint

--> 2. Delete the ones nothing references. `servers.proxmox_template_id` is
-->    ON DELETE RESTRICT, so this deliberately skips any template a server was
-->    built from - that reference is the record of which OS a customer chose.
DELETE FROM "proxmox_templates" AS t
WHERE t."image_url" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "servers" s WHERE s."proxmox_template_id" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "server_backups" b WHERE b."proxmox_template_id" = t."id");--> statement-breakpoint

--> 3. What survives is referenced by a server and cannot be removed. Give it a
-->    placeholder that fails closed: `.invalid` is reserved and can never
-->    resolve, so a download would be refused by the SSRF check before it was
-->    ever attempted. The row stays disabled from step 1 until an operator
-->    declares a real image.
UPDATE "proxmox_templates"
SET "image_url" = 'https://needs-configuration.invalid/set-a-real-image-url.qcow2'
WHERE "image_url" IS NULL;--> statement-breakpoint

ALTER TABLE "proxmox_templates" ALTER COLUMN "image_url" SET NOT NULL;
