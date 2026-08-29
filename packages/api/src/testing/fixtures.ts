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

import type { Session } from "@virtbase/auth";
import type {
  datacenters,
  proxmoxNodeGroups,
  proxmoxNodes,
  proxmoxTemplateGroups,
  proxmoxTemplates,
  serverPlanPrices,
  serverPlans,
  servers,
} from "@virtbase/db/schema";
import * as schema from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";

export const mockSession = {
  session: {
    id: "sess_0000000000000000000000000",
    createdAt: new Date(),
    updatedAt: new Date(),
    userId: "usr_0000000000000000000000000",
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    token: "__mock_token__",
  },
  user: {
    id: "usr_0000000000000000000000000",
    email: "test@example.com",
    emailVerified: true,
    name: "Mock User",
    role: "CUSTOMER",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
} satisfies Session;

export const mockProxmoxNodeGroup = {
  id: "png_0000000000000000000000000",
  name: "My proxmox node group",
  strategy: "RANDOM",
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies typeof proxmoxNodeGroups.$inferInsert;

export const mockServerPlan = {
  id: "srv_0000000000000000000000000",
  proxmoxNodeGroupId: mockProxmoxNodeGroup.id,
  name: "My server plan",
  price: 100,
  cores: 1,
  memory: 1024,
  storage: 100,
  netrate: 1000,
  recommended: false,
  upsellTo: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies typeof serverPlans.$inferSelect;

export const mockServerPlanPrice = {
  id: "price_0000000000000000000000000",
  serverPlanId: mockServerPlan.id,
  purchasePrice: 2999,
  renewalPrice: 3499,
} satisfies typeof serverPlanPrices.$inferInsert;

export const mockDatacenter = {
  id: "dc_0000000000000000000000000",
  name: "My datacenter",
  country: "NL",
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies typeof datacenters.$inferInsert;

export const mockProxmoxNode = {
  id: "pxm_0000000000000000000000000",
  datacenterId: mockDatacenter.id,
  proxmoxNodeGroupId: mockProxmoxNodeGroup.id,
  hostname: "my-proxmox-node.example.com",
  fqdn: "my-proxmox-node.example.com",
  tokenID: "user@realm!tokenid",
  tokenSecret: "f7d62f02-eb10-413e-b8f1-6dd8a9902885",
  cpuDescription: "My CPU description",
  memoryDescription: "My memory description",
  storageDescription: "My storage description",
  netrate: 1000,
  guestLimit: 10,
  memoryLimit: 1024,
  storageLimit: 100,
  netrateLimit: 1000,
  coresLimit: 1,
  snippetStorage: "local-lvm",
  backupStorage: "local-lvm",
  isoDownloadStorage: "local-lvm",
  importStorage: "local",
  vmStorage: "local-lvm",
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies typeof proxmoxNodes.$inferSelect;

export const mockProxmoxTemplateGroup = {
  id: "ptg_0000000000000000000000001",
  name: "Debian",
  priority: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies typeof proxmoxTemplateGroups.$inferInsert;

export const mockProxmoxTemplate = {
  id: "temp_0000000000000000000000001",
  proxmoxTemplateGroupId: mockProxmoxTemplateGroup.id,
  name: "Debian 13 (Trixie)",
  icon: null,
  enabled: true,
  imageUrl:
    "https://cloud.debian.org/images/cloud/trixie/latest/debian-13-generic-amd64.qcow2",
  imageChecksum: null,
  imageChecksumAlgorithm: null,
  imageCompression: null,
  imageRefreshDays: null,
  architecture: "amd64",
  osFamily: "debian",
  osVersion: "13",
  packageManager: "apt",
  initSystem: "systemd",
  ostype: "l26",
  cpuType: "host",
  biosType: "seabios",
  machine: "q35",
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies typeof proxmoxTemplates.$inferInsert;

export const mockServer = {
  id: "kvm_0000000000000000000000000",
  userId: mockSession.user.id,
  serverPlanId: mockServerPlan.id,
  serverPlanPriceId: mockServerPlanPrice.id,
  proxmoxNodeId: mockProxmoxNode.id,
  proxmoxTemplateId: null,
  proxmoxIsoDownloadId: null,
  name: "My server",
  vmid: 100,
  installedAt: new Date(),
  terminatesAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
  renewalReminderSentAt: new Date(),
  suspendedAt: null,
  abuseLockedAt: null,
  abuseLockLevel: null,
  detectedOsId: null,
  detectedOsName: null,
  detectedOsVersion: null,
  detectedOsKernel: null,
  detectedOsAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies typeof servers.$inferSelect;

/**
 * An `ADMIN` counterpart to {@link mockSession}, for the admin surface. The IDs
 * differ in their last digit so a test that mixes both never silently passes
 * because the two users collided.
 */
export const mockAdminSession = {
  session: {
    ...mockSession.session,
    id: "sess_0000000000000000000000001",
    userId: "usr_0000000000000000000000001",
  },
  user: {
    ...mockSession.user,
    id: "usr_0000000000000000000000001",
    email: "admin@example.com",
    name: "Mock Admin",
    role: "ADMIN",
  },
} satisfies Session;

/**
 * Insert the object graph a server actually needs to exist.
 *
 * `servers` has foreign keys reaching all the way back to a datacenter, so a
 * test that wants one row ends up writing six. Every router test that touches
 * servers was assembling this chain by hand; the order below is the insert
 * order the constraints require.
 */
export async function seedServerGraph(db: TestDb) {
  await db.insert(schema.users).values(mockSession.user).onConflictDoNothing();
  await db
    .insert(schema.datacenters)
    .values(mockDatacenter)
    .onConflictDoNothing();
  await db
    .insert(schema.proxmoxNodeGroups)
    .values(mockProxmoxNodeGroup)
    .onConflictDoNothing();
  await db
    .insert(schema.proxmoxNodes)
    .values(mockProxmoxNode)
    .onConflictDoNothing();
  await db
    .insert(schema.serverPlans)
    .values(mockServerPlan)
    .onConflictDoNothing();
  await db
    .insert(schema.serverPlanPrices)
    .values(mockServerPlanPrice)
    .onConflictDoNothing();
  await db.insert(schema.servers).values(mockServer).onConflictDoNothing();

  return {
    user: mockSession.user,
    datacenter: mockDatacenter,
    proxmoxNodeGroup: mockProxmoxNodeGroup,
    proxmoxNode: mockProxmoxNode,
    serverPlan: mockServerPlan,
    serverPlanPrice: mockServerPlanPrice,
    server: mockServer,
  };
}
