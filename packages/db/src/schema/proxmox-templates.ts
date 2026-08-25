/*
 *   Copyright (c) 2026 Janic Bellmann
 *
 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU General Public License for more details.
 *
 *   You should have received a copy of the GNU General Public License
 *   along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { sql } from "drizzle-orm";
import * as d from "drizzle-orm/pg-core";
import { createId } from "../utils/create-id";
import { proxmoxTemplateGroups } from "./proxmox-template-groups";

/**
 * The checksum algorithms Proxmox VE accepts on
 * `POST /nodes/{node}/storage/{storage}/download-url`.
 *
 * Kept identical to the API's own enum so a stored value can be handed
 * straight to Proxmox without a translation table.
 */
export const proxmoxImageChecksumAlgorithmEnum = d.pgEnum(
  "proxmox_image_checksum_algorithm",
  ["md5", "sha1", "sha224", "sha256", "sha384", "sha512"],
);

export const proxmoxTemplateArchitectureEnum = d.pgEnum(
  "proxmox_template_architecture",
  ["amd64", "arm64"],
);

export const proxmoxTemplateOsFamilyEnum = d.pgEnum(
  "proxmox_template_os_family",
  ["debian", "ubuntu", "rhel", "fedora", "alpine", "freebsd", "windows"],
);

export const proxmoxTemplatePackageManagerEnum = d.pgEnum(
  "proxmox_template_package_manager",
  ["apt", "dnf", "yum", "apk", "pkg"],
);

export const proxmoxTemplateInitSystemEnum = d.pgEnum(
  "proxmox_template_init_system",
  ["systemd", "openrc", "bsd-rc"],
);

/**
 * A Proxmox VE template represents a template that can be used to create new guests.
 *
 * A template is a *declaration*, not a VM: the image to build a guest from, the
 * metadata needed to configure that guest, and (through `templateSnippets`) the
 * cloud-init vendor data applied on first boot. Proxmox materialises the disk
 * at provision time via `import-from`, so a template has no vmid and does not
 * have to exist per node.
 */
export const proxmoxTemplates = d.snakeCase.table(
  "proxmox_templates",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "temp_" })),
    /**
     * The ID of the Proxmox VE template group this Proxmox VE template belongs to.
     */
    proxmoxTemplateGroupId: d
      .text()
      .notNull()
      .references(() => proxmoxTemplateGroups.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /**
     * The name of the Proxmox VE template.
     *
     * @example "Debian 12 (Bookworm)"
     */
    name: d.text().notNull(),
    /**
     * The icon image url of the Proxmox VE template.
     * (must be allowed by CSP)
     */
    icon: d.text(),
    /**
     * Whether this template may be offered to customers.
     *
     * Availability additionally requires an image URL and a settled, fresh
     * `proxmoxTemplateImages` row on every node of the group - this flag only
     * lets an operator withdraw a template without deleting it.
     *
     * @default true
     */
    enabled: d.boolean().notNull().default(true),
    /**
     * Direct https URL to the cloud image, downloaded to each node's import
     * storage and used as the `import-from` source.
     *
     * Proxmox only accepts `.ova`, `.ovf`, `.qcow2`, `.raw` and `.vmdk` as
     * import content, so an image published as `.img` (Ubuntu) is stored under
     * a `.qcow2` name - the extension here is the *source* URL's, not the
     * stored file's.
     *
     */
    imageUrl: d.text().notNull(),
    /**
     * The expected checksum of the image, handed to Proxmox so it verifies the
     * download and aborts on a mismatch.
     *
     * Null for `-latest-` style URLs, which the vendor repoints on every point
     * release - pinning a hash there turns into a failing download the day they
     * ship an update.
     */
    imageChecksum: d.text(),
    /**
     * The algorithm `imageChecksum` was produced with. Required by Proxmox
     * whenever a checksum is given.
     */
    imageChecksumAlgorithm: proxmoxImageChecksumAlgorithmEnum(),
    /**
     * Decompression to apply to the downloaded file, passed straight through to
     * `download-url`. Lets us consume the `.zst` images some vendors publish.
     *
     * @example "zst", "gz"
     */
    imageCompression: d.text(),
    /**
     * How many days a downloaded image may be kept before it is re-downloaded.
     * Null falls back to the global default.
     */
    imageRefreshDays: d.smallint(),
    /**
     * CPU architecture of the image. Also used to target snippets.
     *
     * @default "amd64"
     */
    architecture: proxmoxTemplateArchitectureEnum().notNull().default("amd64"),
    /**
     * OS family, used to decide which cloud-init snippets apply.
     */
    osFamily: proxmoxTemplateOsFamilyEnum(),
    /**
     * OS version as the vendor names it, compared as a range when a snippet
     * targets one.
     *
     * @example "13", "24.04"
     */
    osVersion: d.text(),
    /**
     * Package manager of the guest. Derivable from `osFamily` today, but
     * explicit so a snippet can target the manager rather than the distro and
     * survive the exceptions.
     */
    packageManager: proxmoxTemplatePackageManagerEnum(),
    /**
     * Init system of the guest, for the same reason as `packageManager`.
     */
    initSystem: proxmoxTemplateInitSystemEnum(),
    /**
     * Proxmox `ostype` for the created guest. Also decides which cloud-init
     * format Proxmox generates: anything non-Windows gets NoCloud, which writes
     * vendor data verbatim to `/vendor-data`.
     *
     * @default "l26"
     */
    ostype: d.text().notNull().default("l26"),
    /**
     * Proxmox `cpu` for the created guest.
     *
     * @default "host"
     */
    cpuType: d.text().notNull().default("host"),
    /**
     * Proxmox `bios` for the created guest. `ovmf` is required by arm64 and by
     * images that only ship a UEFI boot path.
     *
     * @default "seabios"
     */
    biosType: d.text().notNull().default("seabios"),
    /**
     * Proxmox `machine` type for the created guest.
     *
     * @default "q35"
     */
    machine: d.text().notNull().default("q35"),
    /**
     * The required number of cores for the Proxmox VE template.
     *
     * @default null
     */
    requiredCores: d.smallint(),
    /**
     * The recommended number of cores for the Proxmox VE template.
     *
     * @default null
     */
    recommendedCores: d.smallint(),
    /**
     * The required memory for the Proxmox VE template in MiB.
     *
     * @default null
     */
    requiredMemory: d.integer(),
    /**
     * The recommended memory for the Proxmox VE template in MiB.
     *
     * @default null
     */
    recommendedMemory: d.integer(),
    /**
     * The required storage for the Proxmox VE template in GiB.
     *
     * @default null
     */
    requiredStorage: d.integer(),
    /**
     * The recommended storage for the Proxmox VE template in GiB.
     *
     * @default null
     */
    recommendedStorage: d.integer(),
    createdAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => sql`now()`),
  },
  (t) => [d.index().on(t.proxmoxTemplateGroupId)],
);

export type DatabaseProxmoxTemplates = typeof proxmoxTemplates.$inferSelect;
