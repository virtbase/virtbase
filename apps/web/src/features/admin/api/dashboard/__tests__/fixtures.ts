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

import type {
  datacenters,
  invoices,
  proxmoxNodeGroups,
  proxmoxNodes,
  proxmoxTemplateGroups,
  proxmoxTemplates,
  serverPlans,
  servers,
  users,
} from "@virtbase/db/schema";

export const mockUser = {
  id: "usr_0000000000000000000000001",
  name: "Test Customer",
  email: "customer@example.com",
  emailVerified: true,
  role: "CUSTOMER",
  banned: false,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies typeof users.$inferInsert;

export const mockProxmoxNodeGroup = {
  id: "png_0000000000000000000000001",
  name: "Test Node Group",
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies typeof proxmoxNodeGroups.$inferInsert;

export const mockDatacenter = {
  id: "dc_0000000000000000000000001",
  name: "Test Datacenter",
  country: "NL",
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies typeof datacenters.$inferInsert;

export const mockProxmoxNode = {
  id: "pn_0000000000000000000000001",
  datacenterId: mockDatacenter.id,
  proxmoxNodeGroupId: mockProxmoxNodeGroup.id,
  hostname: "test-node",
  fqdn: "test-node.example.com",
  tokenID: "api@pam!test",
  tokenSecret: "00000000-0000-0000-0000-000000000001",
  snippetStorage: "local",
  backupStorage: "local",
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies typeof proxmoxNodes.$inferInsert;

export const mockServerPlan = {
  id: "pck_0000000000000000000000001",
  proxmoxNodeGroupId: mockProxmoxNodeGroup.id,
  name: "Starter",
  price: 500,
  cores: 2,
  memory: 2048,
  storage: 20,
  netrate: 125,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies typeof serverPlans.$inferInsert;

export const mockProxmoxTemplateGroup = {
  id: "ptg_0000000000000000000000001",
  name: "Debian",
  priority: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies typeof proxmoxTemplateGroups.$inferInsert;

export const mockProxmoxTemplate = {
  id: "temp_000000000000000000000001",
  proxmoxTemplateGroupId: mockProxmoxTemplateGroup.id,
  name: "Debian 12",
  icon: "https://example.com/debian.png",
  requiredCores: 1,
  requiredMemory: 512,
  requiredStorage: 5,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies typeof proxmoxTemplates.$inferInsert;

export const mockServer = {
  id: "kvm_0000000000000000000000001",
  userId: mockUser.id,
  serverPlanId: mockServerPlan.id,
  proxmoxNodeId: mockProxmoxNode.id,
  proxmoxTemplateId: null,
  name: "Test Server",
  vmid: 100,
  installedAt: new Date(),
  terminatesAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  renewalReminderSentAt: null,
  suspendedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies typeof servers.$inferInsert;

export const mockInvoice = {
  userId: mockUser.id,
  number: "RE-2026-0001",
  total: 1000,
  taxAmount: 190,
  reverseCharge: false,
  lexwareInvoiceId: "00000000-0000-0000-0000-000000000001",
  paidAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies typeof invoices.$inferInsert;
