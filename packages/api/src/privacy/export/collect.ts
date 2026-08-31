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
  paymentMethods,
  payments,
  pointerRecords,
  proxmoxIsoDownloads,
  serverBackups,
  servers,
  sessions,
  sshKeys,
  subnetAllocations,
  subnets,
  subscriptionRenewals,
  subscriptions,
  users,
} from "@virtbase/db/schema";

/**
 * Bumped whenever the shape below changes in a way a reader would notice.
 *
 * Written into every file so somebody holding an export from two years ago can
 * tell what they are looking at.
 *
 * 2 - saved payment methods and subscriptions, the latter carrying its own
 * renewal attempts, the way an order carries its items.
 */
export const EXPORT_SCHEMA_VERSION = 2;

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

      const ownedSubscriptions = await tx
        .select({
          id: subscriptions.id,
          // The thing being paid for. Deliberately not a foreign key on the
          // table, so a subscription outlives the server it renewed - which
          // means an export can name a machine that no longer exists.
          subject_type: subscriptions.subjectType,
          subject_id: subscriptions.subjectId,
          status: subscriptions.status,
          interval_months: subscriptions.intervalMonths,
          currency: subscriptions.currency,
          current_period_start: subscriptions.currentPeriodStart,
          current_period_end: subscriptions.currentPeriodEnd,
          auto_renew: subscriptions.autoRenew,
          // Resolves against the `payment_methods` section below. Null means
          // "whatever is default when the renewal runs".
          payment_method_id: subscriptions.paymentMethodId,
          // The consent artefact: when they agreed we may charge them while
          // they are not present, and against which wording.
          mandate_accepted_at: subscriptions.mandateAcceptedAt,
          mandate_text_version: subscriptions.mandateTextVersion,
          cancelled_at: subscriptions.cancelledAt,
          cancel_reason: subscriptions.cancelReason,
          ended_at: subscriptions.endedAt,
          created_at: subscriptions.createdAt,
        })
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId));

      const subscriptionIds = ownedSubscriptions.map(
        (subscription) => subscription.id,
      );

      // Nested into their subscription below, the way order items are nested
      // into their order: a collection attempt read on its own says nothing
      // about what was being renewed.
      const renewals = subscriptionIds.length
        ? await tx
            .select({
              subscription_id: subscriptionRenewals.subscriptionId,
              period_start: subscriptionRenewals.periodStart,
              period_end: subscriptionRenewals.periodEnd,
              amount: subscriptionRenewals.amount,
              currency: subscriptionRenewals.currency,
              status: subscriptionRenewals.status,
              attempt: subscriptionRenewals.attempt,
              next_attempt_at: subscriptionRenewals.nextAttemptAt,
              // Why a period went uncollected, in the provider's own words.
              // The customer's side of a failed renewal, and the only record
              // of it there is.
              failure_code: subscriptionRenewals.failureCode,
              failure_message: subscriptionRenewals.failureMessage,
              order_id: subscriptionRenewals.orderId,
              settled_at: subscriptionRenewals.settledAt,
              created_at: subscriptionRenewals.createdAt,
            })
            .from(subscriptionRenewals)
            .where(
              inArray(subscriptionRenewals.subscriptionId, subscriptionIds),
            )
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
        savedPaymentMethods,
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
        // [!] `provider` and `external_id` are the redaction, and they are
        // the reason this names columns rather than reusing the row. The
        // external id is the token an off-session charge is made against: a
        // credential, in a file the customer is expected to download, keep and
        // forward. Everything here is display material - what a dunning email
        // needs to name the card, and no more. `payment-methods/list.ts`
        // withholds the same two columns from the browser for the same reason;
        // its projection is not reused here only because the wire format is
        // snake_case and this section carries `created_at` and `detached_at`,
        // which the billing page has no use for.
        tx
          .select({
            id: paymentMethods.id,
            type: paymentMethods.type,
            brand: paymentMethods.brand,
            last4: paymentMethods.last4,
            exp_month: paymentMethods.expMonth,
            exp_year: paymentMethods.expYear,
            is_default: paymentMethods.isDefault,
            invalid_at: paymentMethods.invalidAt,
            created_at: paymentMethods.createdAt,
            // Detached rows are included: a credential the customer removed is
            // still something we hold, and the date they removed it is part of
            // the answer to what we hold.
            detached_at: paymentMethods.detachedAt,
          })
          .from(paymentMethods)
          .where(eq(paymentMethods.userId, userId)),
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
        payment_methods: savedPaymentMethods,
        subscriptions: ownedSubscriptions.map((subscription) => ({
          ...subscription,
          renewals: renewals.filter(
            (renewal) => renewal.subscription_id === subscription.id,
          ),
        })),
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
