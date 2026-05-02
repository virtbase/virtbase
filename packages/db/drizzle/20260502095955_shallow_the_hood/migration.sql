DROP TABLE "server_mounts";--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "proxmox_iso_download_id" text;--> statement-breakpoint
CREATE INDEX "servers_proxmox_iso_download_id_index" ON "servers" ("proxmox_iso_download_id");--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_proxmox_iso_download_id_proxmox_iso_downloads_id_fkey" FOREIGN KEY ("proxmox_iso_download_id") REFERENCES "proxmox_iso_downloads"("id") ON DELETE SET NULL ON UPDATE CASCADE;