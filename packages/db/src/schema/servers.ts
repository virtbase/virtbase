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
import { users } from "./auth";
import { proxmoxIsoDownloads } from "./proxmox-iso-downloads";
import { proxmoxNodes } from "./proxmox-nodes";
import { proxmoxTemplates } from "./proxmox-templates";
import { serverPlanPrices } from "./server-plan-prices";
import { serverPlans } from "./server-plans";

export const servers = d.snakeCase.table(
  "servers",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "kvm_" })),
    userId: d
      .text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    serverPlanId: d
      .text()
      .notNull()
      .references(() => serverPlans.id, {
        // Don't allow deletion of the server plan if it still has servers
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    serverPlanPriceId: d
      .text()
      .notNull()
      .references(() => serverPlanPrices.id, {
        // Don't allow deletion of the server plan price if it still has servers
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    proxmoxNodeId: d
      .text()
      .notNull()
      .references(() => proxmoxNodes.id, {
        // Don't allow deletion of the Proxmox VE node if it still has servers
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    proxmoxTemplateId: d.text().references(() => proxmoxTemplates.id, {
      // Don't allow deletion of the Proxmox VE template if it still has servers
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    proxmoxIsoDownloadId: d.text().references(() => proxmoxIsoDownloads.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /**
     * The user-defined display name of the server.
     *
     * @example "My server"
     */
    name: d.text().notNull(),
    /**
     * The Proxmox VM ID.
     *
     * @example 100
     */
    vmid: d.integer().notNull(),
    /**
     * The timestamp when the server was installed.
     * If the server is not installed, this is null.
     *
     * @default null
     */
    installedAt: d.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * The timestamp when the server will be terminated, if termination is requested or service is not renewed.
     *
     * @default null
     */
    terminatesAt: d.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * The timestamp when the last renewal reminder was sent.
     * Used to avoid sending duplicate reminders for the same expiration period.
     *
     * @default null
     */
    renewalReminderSentAt: d.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * The timestamp when the server was suspended. Notice sent out to the customer.
     * After a certain amount of time, the server will be deleted automatically.
     *
     * @default null
     */
    suspendedAt: d.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * What the `qemu-guest-agent` last reported as the guest's `os-release`
     * `ID` - `debian`, `ubuntu`, `mswindows`.
     *
     * This is the operating system actually running inside the server, which
     * is not necessarily the one its template installed: a customer is free to
     * install something else over it, or to boot a custom ISO. Every OS name
     * and logo Virtbase shows prefers this over the template.
     *
     * @default null
     */
    detectedOsId: d.text(),
    /**
     * The guest's `os-release` `PRETTY_NAME`.
     *
     * [!] Guest-controlled. `/etc/os-release` is a file inside the customer's
     * own server, so this is untrusted text and is stored only after
     * `sanitizeGuestOsName` has stripped formatting characters and capped it.
     * Escape it again at any sink that interprets markup.
     *
     * @example "Debian GNU/Linux 13 (trixie)"
     * @default null
     */
    detectedOsName: d.text(),
    /**
     * The guest's `os-release` `VERSION`. Same trust level as
     * {@link detectedOsName}.
     *
     * @example "13 (trixie)"
     * @default null
     */
    detectedOsVersion: d.text(),
    /**
     * The running kernel, as `uname -r` would report it. Same trust level as
     * {@link detectedOsName}.
     *
     * @example "6.12.48+deb13-amd64"
     * @default null
     */
    detectedOsKernel: d.text(),
    /**
     * When the operating system was last *successfully* observed.
     *
     * Only ever written by a probe that got an answer. A failed probe - a
     * stopped server, an uninstalled agent, a guest still booting - leaves
     * both this and the columns above untouched, so the last known operating
     * system stays on screen instead of the row blanking out. It is the
     * rebuild workflows that clear all five, because there the old value is
     * known to be wrong.
     *
     * Compared against the guest's boot time (`now - uptime`) to decide
     * whether a running server has restarted since we last looked.
     *
     * @default null
     */
    detectedOsAt: d.timestamp({ withTimezone: true, mode: "date" }),
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
  (t) => [
    d.index().on(t.userId),
    d.index().on(t.serverPlanId),
    d.index().on(t.proxmoxNodeId),
    d.index().on(t.proxmoxTemplateId),
    d.index().on(t.proxmoxIsoDownloadId),
    // The detection cron scans stale-and-null-first across every server.
    d.index().on(t.detectedOsAt),
    d.unique().on(t.proxmoxNodeId, t.vmid),
  ],
);

export type DatabaseServer = typeof servers.$inferSelect;
