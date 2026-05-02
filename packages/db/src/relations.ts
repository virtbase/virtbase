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

import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

export const relations = defineRelations(schema, (r) => ({
  accounts: {
    user: r.one.users({
      from: r.accounts.userId,
      to: r.users.id,
    }),
  },
  users: {
    accounts: r.many.accounts(),
    invoices: r.many.invoices(),
    passkeys: r.many.passkeys(),
    servers: r.many.servers(),
    sessions: r.many.sessions({ alias: "session_user" }),
    impersonatedSessions: r.many.sessions({ alias: "session_impersonator" }),
    sshKeys: r.many.sshKeys(),
    transactions: r.many.transactions(),
    proxmoxIsoDownloads: r.many.proxmoxIsoDownloads(),
  },
  sessions: {
    user: r.one.users({
      from: r.sessions.userId,
      to: r.users.id,
      alias: "session_user",
    }),
    impersonator: r.one.users({
      from: r.sessions.impersonatedBy,
      to: r.users.id,
      optional: true,
      alias: "session_impersonator",
    }),
  },
  transactions: {
    user: r.one.users({
      from: r.transactions.userId,
      to: r.users.id,
    }),
  },
  invoices: {
    user: r.one.users({
      from: r.invoices.userId,
      to: r.users.id,
    }),
  },
  passkeys: {
    user: r.one.users({
      from: r.passkeys.userId,
      to: r.users.id,
    }),
  },
  pointerRecords: {
    allocation: r.one.subnetAllocations({
      from: r.pointerRecords.subnetAllocationId,
      to: r.subnetAllocations.id,
    }),
  },
  datacenters: {
    proxmoxNodes: r.many.proxmoxNodes({
      from: r.datacenters.id,
      to: r.proxmoxNodes.datacenterId,
    }),
    proxmoxNodeGroups: r.many.proxmoxNodeGroups({
      from: r.datacenters.id.through(r.proxmoxNodes.datacenterId),
      to: r.proxmoxNodeGroups.id.through(r.proxmoxNodes.proxmoxNodeGroupId),
    }),
  },
  proxmoxIsoDownloads: {
    servers: r.many.servers(),
    proxmoxNode: r.one.proxmoxNodes({
      from: r.proxmoxIsoDownloads.proxmoxNodeId,
      to: r.proxmoxNodes.id,
      optional: false,
    }),
    user: r.one.users({
      from: r.proxmoxIsoDownloads.userId,
      to: r.users.id,
      optional: false,
    }),
  },
  proxmoxNodeGroups: {
    datacenters: r.many.datacenters({
      from: r.proxmoxNodeGroups.id.through(r.proxmoxNodes.proxmoxNodeGroupId),
      to: r.datacenters.id.through(r.proxmoxNodes.datacenterId),
    }),
    proxmoxNodes: r.many.proxmoxNodes({
      from: r.proxmoxNodeGroups.id,
      to: r.proxmoxNodes.proxmoxNodeGroupId,
    }),
    serverPlans: r.many.serverPlans(),
  },
  proxmoxTemplates: {
    proxmoxTemplateGroup: r.one.proxmoxTemplateGroups({
      from: r.proxmoxTemplates.proxmoxTemplateGroupId,
      to: r.proxmoxTemplateGroups.id,
    }),
    proxmoxNodes: r.many.proxmoxNodes({
      from: r.proxmoxTemplates.id.through(
        r.proxmoxTemplatesToProxmoxNodes.proxmoxTemplateId,
      ),
      to: r.proxmoxNodes.id.through(
        r.proxmoxTemplatesToProxmoxNodes.proxmoxNodeId,
      ),
    }),
    servers: r.many.servers(),
    serverBackups: r.many.serverBackups(),
  },
  proxmoxTemplateGroups: {
    proxmoxTemplates: r.many.proxmoxTemplates(),
  },
  proxmoxNodes: {
    datacenter: r.one.datacenters({
      from: r.proxmoxNodes.datacenterId,
      to: r.datacenters.id,
    }),
    proxmoxIsoDownloads: r.many.proxmoxIsoDownloads(),
    proxmoxNodeGroup: r.one.proxmoxNodeGroups({
      from: r.proxmoxNodes.proxmoxNodeGroupId,
      to: r.proxmoxNodeGroups.id,
    }),
    proxmoxTemplates: r.many.proxmoxTemplates({
      from: r.proxmoxNodes.id.through(
        r.proxmoxTemplatesToProxmoxNodes.proxmoxNodeId,
      ),
      to: r.proxmoxTemplates.id.through(
        r.proxmoxTemplatesToProxmoxNodes.proxmoxTemplateId,
      ),
    }),
    servers: r.many.servers(),
    subnets: r.many.subnets({
      from: r.proxmoxNodes.id.through(r.subnetsToProxmoxNodes.proxmoxNodeId),
      to: r.subnets.id.through(r.subnetsToProxmoxNodes.subnetId),
    }),
  },
  serverBackups: {
    server: r.one.servers({
      from: r.serverBackups.serverId,
      to: r.servers.id,
    }),
    proxmoxTemplate: r.one.proxmoxTemplates({
      from: r.serverBackups.proxmoxTemplateId,
      to: r.proxmoxTemplates.id,
      optional: true,
    }),
  },
  servers: {
    user: r.one.users({
      from: r.servers.userId,
      to: r.users.id,
    }),
    serverPlan: r.one.serverPlans({
      from: r.servers.serverPlanId,
      to: r.serverPlans.id,
    }),
    proxmoxNode: r.one.proxmoxNodes({
      from: r.servers.proxmoxNodeId,
      to: r.proxmoxNodes.id,
      optional: false,
    }),
    proxmoxTemplate: r.one.proxmoxTemplates({
      from: r.servers.proxmoxTemplateId,
      to: r.proxmoxTemplates.id,
      optional: true,
    }),
    proxmoxIsoDownload: r.one.proxmoxIsoDownloads({
      from: r.servers.proxmoxIsoDownloadId,
      to: r.proxmoxIsoDownloads.id,
      optional: true,
    }),
    serverBackups: r.many.serverBackups(),
    subnetAllocations: r.many.subnetAllocations(),
    subnets: r.many.subnets({
      from: r.servers.id.through(r.subnetAllocations.serverId),
      to: r.subnets.id.through(r.subnetAllocations.subnetId),
    }),
  },
  serverPlans: {
    proxmoxNodeGroup: r.one.proxmoxNodeGroups({
      from: r.serverPlans.proxmoxNodeGroupId,
      to: r.proxmoxNodeGroups.id,
    }),
    servers: r.many.servers(),
  },
  sshKeys: {
    user: r.one.users({
      from: r.sshKeys.userId,
      to: r.users.id,
    }),
  },
  subnetAllocations: {
    subnet: r.one.subnets({
      from: r.subnetAllocations.subnetId,
      to: r.subnets.id,
    }),
    server: r.one.servers({
      from: r.subnetAllocations.serverId,
      to: r.servers.id,
      optional: true,
    }),
    pointerRecords: r.many.pointerRecords(),
  },
  subnets: {
    parent: r.one.subnets({
      from: r.subnets.parentId,
      to: r.subnets.id,
      optional: true,
      alias: "subnet_parent_child",
    }),
    children: r.many.subnets({
      from: r.subnets.id,
      to: r.subnets.parentId,
      alias: "subnet_parent_child",
    }),
    allocations: r.many.subnetAllocations(),
    proxmoxNodes: r.many.proxmoxNodes({
      from: r.subnets.id.through(r.subnetsToProxmoxNodes.subnetId),
      to: r.proxmoxNodes.id.through(r.subnetsToProxmoxNodes.proxmoxNodeId),
    }),
    servers: r.many.servers({
      from: r.subnets.id.through(r.subnetAllocations.subnetId),
      to: r.servers.id.through(r.subnetAllocations.serverId),
    }),
  },
}));
