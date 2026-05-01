CREATE TABLE "proxmox_iso_downloads" (
	"id" text PRIMARY KEY,
	"proxmox_node_id" text NOT NULL,
	"user_id" text NOT NULL,
	"upid" text NOT NULL,
	"url" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_mounts" (
	"id" text PRIMARY KEY,
	"server_id" text NOT NULL,
	"iso_download_id" text NOT NULL,
	"drive" text NOT NULL,
	CONSTRAINT "valid_mount_drive" CHECK ("drive" ~ '^ide[0-3]$')
);
--> statement-breakpoint
ALTER TABLE "proxmox_nodes" ADD COLUMN "iso_download_storage" text NOT NULL DEFAULT 'cephfs';--> statement-breakpoint
ALTER TABLE "proxmox_nodes" ALTER COLUMN "iso_download_storage" DROP DEFAULT;
CREATE INDEX "proxmox_iso_downloads_user_id_index" ON "proxmox_iso_downloads" ("user_id");--> statement-breakpoint
CREATE INDEX "proxmox_iso_downloads_proxmox_node_id_index" ON "proxmox_iso_downloads" ("proxmox_node_id");--> statement-breakpoint
CREATE INDEX "server_mounts_server_id_index" ON "server_mounts" ("server_id");--> statement-breakpoint
CREATE INDEX "server_mounts_iso_download_id_index" ON "server_mounts" ("iso_download_id");--> statement-breakpoint
ALTER TABLE "proxmox_iso_downloads" ADD CONSTRAINT "proxmox_iso_downloads_proxmox_node_id_proxmox_nodes_id_fkey" FOREIGN KEY ("proxmox_node_id") REFERENCES "proxmox_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "proxmox_iso_downloads" ADD CONSTRAINT "proxmox_iso_downloads_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "server_mounts" ADD CONSTRAINT "server_mounts_server_id_servers_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "server_mounts" ADD CONSTRAINT "server_mounts_iso_download_id_proxmox_iso_downloads_id_fkey" FOREIGN KEY ("iso_download_id") REFERENCES "proxmox_iso_downloads"("id") ON DELETE CASCADE ON UPDATE CASCADE;