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

import { and, eq, inArray } from "@virtbase/db";
import type { db as database } from "@virtbase/db/client";
import {
  abuseCaseMessages,
  abuseCaseServers,
  abuseCases,
  accounts,
  apiKeys,
  emails,
  invoices,
  orderItems,
  orders,
  passkeys,
  payments,
  pointerRecords,
  proxmoxIsoDownloads,
  serverBackups,
  servers,
  sessions,
  sshKeys,
  subnetAllocations,
  subnets,
  users,
} from "@virtbase/db/schema";

/**
 * Bumped whenever the shape below changes in a way a reader would notice.
 *
 * Written into every file so somebody holding an export from two years ago can
 * tell what they are looking at.
 */
export const EXPORT_SCHEMA_VERSION = 1;

export type SubjectExport = Awaited<ReturnType<typeof collectSubjectData>>;

/**
 * Everything Virtbase holds about one person, as plain data.
 *
 * [!] Every query below names its columns. Not style - it is the mechanism
 * that keeps password hashes, OAuth tokens, two-factor secrets and Proxmox
 * node credentials out of a file we hand to a customer. A `select *` anywhere
 * in here would leak whichever of those the table happens to carry, and
 * `NEVER_EXPORTED_COLUMNS` exists to make that failure loud rather than
 * silent.
 *
 * Read-only and side-effect free: it is run both to build an export and, in
 * tests, to prove the erasure has nothing left to find.
 */
export async function collectSubjectData({
  db,
  userId,
  now = new Date(),
}: {
  db: typeof database;
  userId: string;
  now?: Date;
}) {
  return db.transaction(
    async (tx) => {
      const account = await tx
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          email_verified: users.emailVerified,
          image: users.image,
          locale: users.locale,
          role: users.role,
          two_factor_enabled: users.twoFactorEnabled,
          created_at: users.createdAt,
          updated_at: users.updatedAt,
          last_seen_at: users.lastSeenAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .then(([row]) => row);

      if (!account) {
        throw new Error(`Cannot export data for unknown user ${userId}.`);
      }

      const ownedServers = await tx
        .select({
          id: servers.id,
          name: servers.name,
          vmid: servers.vmid,
          operating_system: servers.detectedOsName,
          operating_system_version: servers.detectedOsVersion,
          kernel: servers.detectedOsKernel,
          installed_at: servers.installedAt,
          terminates_at: servers.terminatesAt,
          suspended_at: servers.suspendedAt,
          created_at: servers.createdAt,
        })
        .from(servers)
        .where(eq(servers.userId, userId));

      const serverIds = ownedServers.map((server) => server.id);

      const ownedOrders = await tx
        .select({
          id: orders.id,
          type: orders.type,
          status: orders.status,
          total_amount: orders.totalAmount,
          currency: orders.currency,
          billing_address: orders.billingAddress,
          configuration: orders.configuration,
          paid_at: orders.paidAt,
          fulfilled_at: orders.fulfilledAt,
          created_at: orders.createdAt,
        })
        .from(orders)
        .where(eq(orders.userId, userId));

      const orderIds = ownedOrders.map((order) => order.id);

      // `inArray` with an empty list is valid SQL but always false, so these
      // stay correct for a customer who never bought anything.
      const items = orderIds.length
        ? await tx
            .select({
              order_id: orderItems.orderId,
              name: orderItems.name,
              description: orderItems.description,
              quantity: orderItems.quantity,
              unit_amount: orderItems.unitAmount,
              tax_rate_percentage: orderItems.taxRatePercentage,
            })
            .from(orderItems)
            .where(inArray(orderItems.orderId, orderIds))
        : [];

      const ownedCases = await tx
        .select({
          id: abuseCases.id,
          reference: abuseCases.number,
          category: abuseCases.category,
          severity: abuseCases.severity,
          status: abuseCases.status,
          title: abuseCases.title,
          summary: abuseCases.summary,
          enforcement: abuseCases.enforcement,
          enforced_at: abuseCases.enforcedAt,
          released_at: abuseCases.releasedAt,
          respond_by: abuseCases.respondBy,
          resolution: abuseCases.resolution,
          closed_at: abuseCases.closedAt,
          created_at: abuseCases.createdAt,
        })
        .from(abuseCases)
        .where(eq(abuseCases.userId, userId));

      const caseIds = ownedCases.map((abuseCase) => abuseCase.id);

      // [!] `audience` and `author_email` are the redaction. An internal
      // note is an operator talking to another operator, and the reporter's
      // address is a third party's data - neither belongs in a file we hand
      // to the person the case is about.
      const caseMessages = caseIds.length
        ? await tx
            .select({
              case_id: abuseCaseMessages.caseId,
              author: abuseCaseMessages.authorKind,
              body: abuseCaseMessages.body,
              created_at: abuseCaseMessages.createdAt,
            })
            .from(abuseCaseMessages)
            .where(
              and(
                inArray(abuseCaseMessages.caseId, caseIds),
                eq(abuseCaseMessages.audience, "customer"),
              ),
            )
        : [];

      const caseServers = caseIds.length
        ? await tx
            .select({
              case_id: abuseCaseServers.caseId,
              server_id: abuseCaseServers.serverId,
              lock_level: abuseCaseServers.lockLevel,
              locked_at: abuseCaseServers.lockedAt,
              released_at: abuseCaseServers.releasedAt,
            })
            .from(abuseCaseServers)
            .where(inArray(abuseCaseServers.caseId, caseIds))
        : [];

      const allocations = serverIds.length
        ? await tx
            .select({
              id: subnetAllocations.id,
              server_id: subnetAllocations.serverId,
              subnet: subnets.cidr,
              gateway: subnets.gateway,
              description: subnetAllocations.description,
              allocated_at: subnetAllocations.allocatedAt,
              deallocated_at: subnetAllocations.deallocatedAt,
            })
            .from(subnetAllocations)
            .innerJoin(subnets, eq(subnetAllocations.subnetId, subnets.id))
            .where(inArray(subnetAllocations.serverId, serverIds))
        : [];

      const [
        activeSessions,
        linkedAccounts,
        registeredPasskeys,
        keys,
        publicKeys,
        backups,
        reverseDns,
        customImages,
        settledPayments,
        issuedInvoices,
        sentEmails,
      ] = await Promise.all([
        tx
          .select({
            id: sessions.id,
            ip_address: sessions.ipAddress,
            user_agent: sessions.userAgent,
            created_at: sessions.createdAt,
            expires_at: sessions.expiresAt,
          })
          .from(sessions)
          .where(eq(sessions.userId, userId)),
        tx
          .select({
            id: accounts.id,
            provider: accounts.providerId,
            // The provider's own id for the account. Theirs to know, and the
            // customer's to take elsewhere - unlike the tokens beside it.
            account_id: accounts.accountId,
            scope: accounts.scope,
            created_at: accounts.createdAt,
          })
          .from(accounts)
          .where(eq(accounts.userId, userId)),
        tx
          .select({
            id: passkeys.id,
            device_type: passkeys.deviceType,
            backed_up: passkeys.backedUp,
            created_at: passkeys.createdAt,
          })
          .from(passkeys)
          .where(eq(passkeys.userId, userId)),
        tx
          .select({
            id: apiKeys.id,
            name: apiKeys.name,
            // The visible prefix only. The key itself is credential material.
            starts_with: apiKeys.start,
            enabled: apiKeys.enabled,
            request_count: apiKeys.requestCount,
            last_request: apiKeys.lastRequest,
            expires_at: apiKeys.expiresAt,
            created_at: apiKeys.createdAt,
          })
          .from(apiKeys)
          .where(eq(apiKeys.referenceId, userId)),
        tx
          .select({
            id: sshKeys.id,
            name: sshKeys.name,
            fingerprint: sshKeys.fingerprint,
            public_key: sshKeys.publicKey,
            created_at: sshKeys.createdAt,
          })
          .from(sshKeys)
          .where(eq(sshKeys.userId, userId)),
        serverIds.length
          ? tx
              .select({
                id: serverBackups.id,
                server_id: serverBackups.serverId,
                name: serverBackups.name,
                size: serverBackups.size,
                started_at: serverBackups.startedAt,
                finished_at: serverBackups.finishedAt,
                failed_at: serverBackups.failedAt,
              })
              .from(serverBackups)
              .where(inArray(serverBackups.serverId, serverIds))
          : [],
        serverIds.length
          ? tx
              .select({
                ip: pointerRecords.ip,
                hostname: pointerRecords.hostname,
                created_at: pointerRecords.createdAt,
              })
              .from(pointerRecords)
              .innerJoin(
                subnetAllocations,
                eq(pointerRecords.subnetAllocationId, subnetAllocations.id),
              )
              .where(inArray(subnetAllocations.serverId, serverIds))
          : [],
        tx
          .select({
            id: proxmoxIsoDownloads.id,
            name: proxmoxIsoDownloads.name,
            url: proxmoxIsoDownloads.url,
            expires_at: proxmoxIsoDownloads.expiresAt,
            created_at: proxmoxIsoDownloads.createdAt,
          })
          .from(proxmoxIsoDownloads)
          .where(eq(proxmoxIsoDownloads.userId, userId)),
        tx
          .select({
            id: payments.id,
            order_id: payments.orderId,
            provider: payments.provider,
            status: payments.status,
            amount: payments.amount,
            captured_amount: payments.capturedAmount,
            refunded_amount: payments.refundedAmount,
            currency: payments.currency,
            method: payments.method,
            created_at: payments.createdAt,
          })
          .from(payments)
          .where(eq(payments.userId, userId)),
        tx
          .select({
            id: invoices.id,
            number: invoices.number,
            total: invoices.total,
            tax_amount: invoices.taxAmount,
            reverse_charge: invoices.reverseCharge,
            paid_at: invoices.paidAt,
            cancelled_at: invoices.cancelledAt,
            created_at: invoices.createdAt,
          })
          .from(invoices)
          .where(eq(invoices.userId, userId)),
        // Keyed by address rather than by id: this table records what we sent,
        // and it predates the account having an id in it.
        tx
          .select({
            id: emails.id,
            subject: emails.subject,
            last_event: emails.lastEvent,
            created_at: emails.createdAt,
          })
          .from(emails)
          .where(eq(emails.to, [account.email])),
      ]);

      return {
        schema_version: EXPORT_SCHEMA_VERSION,
        generated_at: now.toISOString(),
        account,
        sessions: activeSessions,
        linked_accounts: linkedAccounts,
        passkeys: registeredPasskeys,
        api_keys: keys,
        ssh_keys: publicKeys,
        servers: ownedServers,
        backups,
        ip_addresses: allocations,
        reverse_dns: reverseDns,
        custom_images: customImages,
        orders: ownedOrders.map((order) => ({
          ...order,
          items: items.filter((item) => item.order_id === order.id),
        })),
        payments: settledPayments,
        invoices: issuedInvoices,
        emails: sentEmails,
        abuse_cases: ownedCases.map((abuseCase) => ({
          ...abuseCase,
          servers: caseServers.filter(
            (entry) => entry.case_id === abuseCase.id,
          ),
          messages: caseMessages.filter(
            (message) => message.case_id === abuseCase.id,
          ),
        })),
      };
    },
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );
}
