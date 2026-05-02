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
  serverPlans,
  servers,
} from "@virtbase/db/schema";

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
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies typeof proxmoxNodes.$inferSelect;

export const mockServer = {
  id: "kvm_0000000000000000000000000",
  userId: mockSession.user.id,
  serverPlanId: mockServerPlan.id,
  proxmoxNodeId: mockProxmoxNode.id,
  proxmoxTemplateId: null,
  proxmoxIsoDownloadId: null,
  name: "My server",
  vmid: 100,
  installedAt: new Date(),
  terminatesAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
  renewalReminderSentAt: new Date(),
  suspendedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies typeof servers.$inferSelect;
