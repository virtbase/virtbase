CREATE TYPE "cloud_init_snippet_kind" AS ENUM('cloud-config', 'shell');--> statement-breakpoint
CREATE TYPE "cloud_init_snippet_scope" AS ENUM('base', 'optional');--> statement-breakpoint
CREATE TYPE "proxmox_image_checksum_algorithm" AS ENUM('md5', 'sha1', 'sha224', 'sha256', 'sha384', 'sha512');--> statement-breakpoint
CREATE TYPE "proxmox_template_architecture" AS ENUM('amd64', 'arm64');--> statement-breakpoint
CREATE TYPE "proxmox_template_init_system" AS ENUM('systemd', 'openrc', 'bsd-rc');--> statement-breakpoint
CREATE TYPE "proxmox_template_os_family" AS ENUM('debian', 'ubuntu', 'rhel', 'fedora', 'alpine', 'freebsd', 'windows');--> statement-breakpoint
CREATE TYPE "proxmox_template_package_manager" AS ENUM('apt', 'dnf', 'yum', 'apk', 'pkg');--> statement-breakpoint
CREATE TABLE "cloud_init_snippets" (
	"id" text PRIMARY KEY,
	"slug" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"description" text,
	"kind" "cloud_init_snippet_kind" DEFAULT 'cloud-config'::"cloud_init_snippet_kind" NOT NULL,
	"scope" "cloud_init_snippet_scope" DEFAULT 'base'::"cloud_init_snippet_scope" NOT NULL,
	"content" text NOT NULL,
	"targets" jsonb DEFAULT '{}' NOT NULL,
	"priority" smallint DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proxmox_template_images" (
	"proxmox_template_id" text,
	"proxmox_node_id" text,
	"storage" text,
	"volid" text NOT NULL,
	"upid" text,
	"checksum" text,
	"size_bytes" bigint,
	"downloaded_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pti_composite_pk" PRIMARY KEY("proxmox_template_id","proxmox_node_id","storage")
);
--> statement-breakpoint
CREATE TABLE "template_snippets" (
	"proxmox_template_id" text,
	"cloud_init_snippet_id" text,
	"attached" boolean DEFAULT true NOT NULL,
	"priority" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ts_composite_pk" PRIMARY KEY("proxmox_template_id","cloud_init_snippet_id")
);
--> statement-breakpoint
--> Backfill rather than a plain `ADD COLUMN ... NOT NULL`, which fails on any
--> table that already has rows. A snippet storage is necessarily file-based,
--> which is exactly the class of storage that can carry `import` content, so it
--> is the one existing value that is a plausible default. It still has to
--> declare the `import` content type before a download will work; node
--> validation reports that.
ALTER TABLE "proxmox_nodes" ADD COLUMN "import_storage" text;--> statement-breakpoint
UPDATE "proxmox_nodes" SET "import_storage" = "snippet_storage" WHERE "import_storage" IS NULL;--> statement-breakpoint
ALTER TABLE "proxmox_nodes" ALTER COLUMN "import_storage" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "proxmox_templates" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "proxmox_templates" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "proxmox_templates" ADD COLUMN "image_checksum" text;--> statement-breakpoint
ALTER TABLE "proxmox_templates" ADD COLUMN "image_checksum_algorithm" "proxmox_image_checksum_algorithm";--> statement-breakpoint
ALTER TABLE "proxmox_templates" ADD COLUMN "image_compression" text;--> statement-breakpoint
ALTER TABLE "proxmox_templates" ADD COLUMN "image_refresh_days" smallint;--> statement-breakpoint
ALTER TABLE "proxmox_templates" ADD COLUMN "architecture" "proxmox_template_architecture" DEFAULT 'amd64'::"proxmox_template_architecture" NOT NULL;--> statement-breakpoint
ALTER TABLE "proxmox_templates" ADD COLUMN "os_family" "proxmox_template_os_family";--> statement-breakpoint
ALTER TABLE "proxmox_templates" ADD COLUMN "os_version" text;--> statement-breakpoint
ALTER TABLE "proxmox_templates" ADD COLUMN "package_manager" "proxmox_template_package_manager";--> statement-breakpoint
ALTER TABLE "proxmox_templates" ADD COLUMN "init_system" "proxmox_template_init_system";--> statement-breakpoint
ALTER TABLE "proxmox_templates" ADD COLUMN "ostype" text DEFAULT 'l26' NOT NULL;--> statement-breakpoint
ALTER TABLE "proxmox_templates" ADD COLUMN "cpu_type" text DEFAULT 'host' NOT NULL;--> statement-breakpoint
ALTER TABLE "proxmox_templates" ADD COLUMN "bios_type" text DEFAULT 'seabios' NOT NULL;--> statement-breakpoint
ALTER TABLE "proxmox_templates" ADD COLUMN "machine" text DEFAULT 'q35' NOT NULL;--> statement-breakpoint
CREATE INDEX "cloud_init_snippets_scope_index" ON "cloud_init_snippets" ("scope");--> statement-breakpoint
CREATE INDEX "cloud_init_snippets_priority_index" ON "cloud_init_snippets" ("priority");--> statement-breakpoint
CREATE INDEX "proxmox_template_images_upid_index" ON "proxmox_template_images" ("upid");--> statement-breakpoint
CREATE INDEX "proxmox_template_images_proxmox_node_id_index" ON "proxmox_template_images" ("proxmox_node_id");--> statement-breakpoint
CREATE INDEX "template_snippets_cloud_init_snippet_id_index" ON "template_snippets" ("cloud_init_snippet_id");--> statement-breakpoint
ALTER TABLE "proxmox_template_images" ADD CONSTRAINT "proxmox_template_images_rSxNPOWeDlgc_fkey" FOREIGN KEY ("proxmox_template_id") REFERENCES "proxmox_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "proxmox_template_images" ADD CONSTRAINT "proxmox_template_images_proxmox_node_id_proxmox_nodes_id_fkey" FOREIGN KEY ("proxmox_node_id") REFERENCES "proxmox_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "template_snippets" ADD CONSTRAINT "template_snippets_proxmox_template_id_proxmox_templates_id_fkey" FOREIGN KEY ("proxmox_template_id") REFERENCES "proxmox_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "template_snippets" ADD CONSTRAINT "template_snippets_hw987bJzoreU_fkey" FOREIGN KEY ("cloud_init_snippet_id") REFERENCES "cloud_init_snippets"("id") ON DELETE CASCADE ON UPDATE CASCADE;