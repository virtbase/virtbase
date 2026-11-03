/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { getProxmoxInstance, runGuestCommand } from "@virtbase/api/proxmox";
import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import {
  abuseCaseMessages,
  abuseCaseServers,
  abuseCases,
  dataExports,
  paymentMethods,
  proxmoxNodes,
  serverPlanPrices,
  serverPlans,
  servers,
  subnetAllocations,
  subnets,
  subscriptionRenewals,
  subscriptions,
  users,
} from "@virtbase/db/schema";
import type { Locale } from "next-intl";
import { DEMO_SERVER_ID } from "../../video/lib/scene.ts";

/**
 * The state the help screenshots are taken in, on top of the demo server that
 * `bun script video/prepare` builds.
 *
 * That server was made for the videos, not ordered, so it has no addresses, no
 * term and no subscription; a screenshot of it would show empty cards. These
 * fixtures give it what an order leaves behind, with documentation addresses
 * (RFC 5737 / 3849) so no real or private address ever appears in a picture.
 * Everything is keyed by fixed ids and safe to apply again.
 */

const id = (prefix: string, n: number) =>
  `${prefix}${String(n).padStart(25, "0")}`;

export const ACCOUNT_EMAIL = "dev@example.com";
export const ACCOUNT_PASSWORD = "Devpassword123";
export const SERVER_ID = DEMO_SERVER_ID;
export const SERVER_NAME = "web-01";

/** The plan the server is on: the smallest seeded one but one, so it can grow. */
export const PLAN_ID = id("pck_", 2);
const PRICE_ID = id("price_", 2);
/** The E2E fixture plan; its name would show up in the plan lists. */
const FIXTURE_PLAN_ID = id("pck_", 0);
const FIXTURE_PRICE_ID = id("price_", 0);

const IPV4 = {
  id: id("ipsub_", 901),
  cidr: "203.0.113.10/32",
  gateway: "203.0.113.1",
};
const IPV6 = {
  id: id("ipsub_", 902),
  cidr: "2001:db8:1234:5678::/64",
  gateway: "fe80::1",
};

const SUBSCRIPTION_ID = id("sub_", 901);
const RENEWAL_ID = id("sre_", 901);
const PAYMENT_METHOD_ID = id("pm_", 901);
export const CASE_ID = id("abus_", 901);

const DAY = 24 * 60 * 60 * 1000;

export async function getAccount() {
  const [account] = await db
    .select()
    .from(users)
    .where(eq(users.email, ACCOUNT_EMAIL));
  if (!account) {
    throw new Error(`no ${ACCOUNT_EMAIL} - run \`bun script dev/login\``);
  }
  return account;
}

/** The portal reads the stored language before the cookie. */
export async function setAccountLocale(userId: string, locale: Locale) {
  await db.update(users).set({ locale }).where(eq(users.id, userId));
}

/** A server that looks ordered: its plan, a term, two addresses. */
export async function prepareServer(userId: string) {
  const termEnd = new Date(Date.now() + 20 * DAY);

  await db
    .update(servers)
    .set({
      userId,
      name: SERVER_NAME,
      serverPlanId: PLAN_ID,
      serverPlanPriceId: PRICE_ID,
      terminatesAt: termEnd,
      suspendedAt: null,
    })
    .where(eq(servers.id, SERVER_ID));

  // Nothing else uses the E2E fixture plan in a development database; the
  // E2E seed creates it again when it needs it.
  const [inUse] = await db
    .select({ id: servers.id })
    .from(servers)
    .where(eq(servers.serverPlanId, FIXTURE_PLAN_ID));
  if (!inUse) {
    await db
      .delete(serverPlanPrices)
      .where(eq(serverPlanPrices.id, FIXTURE_PRICE_ID));
    await db.delete(serverPlans).where(eq(serverPlans.id, FIXTURE_PLAN_ID));
  }

  for (const [n, subnet] of [IPV4, IPV6].entries()) {
    await db
      .insert(subnets)
      .values(subnet)
      .onConflictDoUpdate({ target: subnets.id, set: subnet });
    await db
      .insert(subnetAllocations)
      .values({
        id: id("ipalloc_", 901 + n),
        subnetId: subnet.id,
        serverId: SERVER_ID,
      })
      .onConflictDoUpdate({
        target: subnetAllocations.id,
        set: { serverId: SERVER_ID, deallocatedAt: null },
      });
  }

  return termEnd;
}

/**
 * The billing state a shot needs:
 * - `manual`: paid one term at a time, no card - the Plan tab with "Extend".
 * - `card`: a saved card, renewal not yet on - the agreement dialog.
 * - `past-due`: renewing automatically, and the last charge failed.
 */
export async function setBilling(
  userId: string,
  state: "manual" | "card" | "past-due",
) {
  const now = Date.now();
  const withCard = state !== "manual";

  await db
    .delete(subscriptionRenewals)
    .where(eq(subscriptionRenewals.id, RENEWAL_ID));
  await db.delete(subscriptions).where(eq(subscriptions.id, SUBSCRIPTION_ID));
  await db
    .delete(paymentMethods)
    .where(eq(paymentMethods.id, PAYMENT_METHOD_ID));

  if (withCard) {
    await db.insert(paymentMethods).values({
      id: PAYMENT_METHOD_ID,
      userId,
      provider: "stripe",
      externalId: "pm_help_screenshots",
      type: "card",
      brand: "visa",
      last4: "4242",
      expMonth: 12,
      expYear: 2030,
      isDefault: true,
    });
  }

  const pastDue = state === "past-due";
  // A failed renewal's notice dates the suspension by the period end. In a
  // real dunning run that date has already passed; the picture shows the
  // last day the article describes instead.
  const periodEnd = new Date(pastDue ? now + 6 * DAY : now + 20 * DAY);

  await db
    .update(servers)
    .set({ terminatesAt: periodEnd })
    .where(eq(servers.id, SERVER_ID));

  await db.insert(subscriptions).values({
    id: SUBSCRIPTION_ID,
    userId,
    subjectType: "server",
    subjectId: SERVER_ID,
    status: pastDue ? "past_due" : "active",
    serverPlanPriceId: PRICE_ID,
    currentPeriodStart: new Date(periodEnd.getTime() - 30 * DAY),
    currentPeriodEnd: periodEnd,
    autoRenew: pastDue,
    paymentMethodId: withCard ? PAYMENT_METHOD_ID : null,
    ...(pastDue && {
      mandateAcceptedAt: new Date(now - 40 * DAY),
      mandateTextVersion: "2026-08-30",
    }),
  });

  if (pastDue) {
    await db.insert(subscriptionRenewals).values({
      id: RENEWAL_ID,
      subscriptionId: SUBSCRIPTION_ID,
      periodStart: periodEnd,
      periodEnd: new Date(periodEnd.getTime() + 30 * DAY),
      amount: 349,
      status: "failed",
      attempt: 1,
      nextAttemptAt: new Date(now + DAY),
      failureCode: "card_declined",
    });
  }
}

const CASE_TEXT: Record<
  Locale,
  { title: string; summary: string; message: string }
> = {
  en: {
    title: "Port scanning from 203.0.113.10",
    summary:
      "A network operator reported repeated connection attempts to SSH and RDP ports on their hosts, coming from your server.",
    message:
      "Hello, we received the report below about your server web-01. Please check the server and tell us what you found and what you changed.",
  },
  de: {
    title: "Portscans von 203.0.113.10",
    summary:
      "Ein Netzbetreiber hat wiederholte Verbindungsversuche zu SSH- und RDP-Ports seiner Hosts gemeldet, die von deinem Server ausgehen.",
    message:
      "Hallo, wir haben die folgende Meldung zu deinem Server web-01 erhalten. Bitte prüfe den Server und schreib uns, was du gefunden und geändert hast.",
  },
  fr: {
    title: "Analyse de ports depuis 203.0.113.10",
    summary:
      "Un opérateur réseau a signalé des tentatives de connexion répétées vers les ports SSH et RDP de ses hôtes, en provenance de votre serveur.",
    message:
      "Bonjour, nous avons reçu le signalement ci-dessous concernant votre serveur web-01. Merci de vérifier le serveur et de nous indiquer ce que vous avez trouvé et modifié.",
  },
  nl: {
    title: "Poortscans vanaf 203.0.113.10",
    summary:
      "Een netwerkbeheerder meldde herhaalde verbindingspogingen naar SSH- en RDP-poorten van zijn hosts, afkomstig van je server.",
    message:
      "Hallo, we hebben de onderstaande melding over je server web-01 ontvangen. Controleer de server en laat ons weten wat je hebt gevonden en aangepast.",
  },
};

/** An open case that waits for the customer's answer, in their language. */
export async function prepareAbuseCase(userId: string, locale: Locale) {
  const text = CASE_TEXT[locale];

  await db
    .delete(abuseCaseMessages)
    .where(eq(abuseCaseMessages.caseId, CASE_ID));
  await db.delete(abuseCaseServers).where(eq(abuseCaseServers.caseId, CASE_ID));
  await db.delete(abuseCases).where(eq(abuseCases.id, CASE_ID));

  await db.insert(abuseCases).values({
    id: CASE_ID,
    userId,
    category: "port_scan",
    severity: "medium",
    status: "awaiting_customer",
    title: text.title,
    summary: text.summary,
    respondBy: new Date(Date.now() + 20 * 60 * 60 * 1000),
  });
  await db.insert(abuseCaseServers).values({
    id: id("absrv_", 901),
    caseId: CASE_ID,
    serverId: SERVER_ID,
  });
  await db.insert(abuseCaseMessages).values({
    id: id("abmsg_", 901),
    caseId: CASE_ID,
    authorKind: "operator",
    body: text.message,
    audience: "customer",
  });

  return CASE_ID;
}

/** An export can be requested once a day; each language takes one. */
export async function clearExports(userId: string) {
  await db.delete(dataExports).where(eq(dataExports.userId, userId));
}

async function demoVm() {
  const [server] = await db
    .select({ vmid: servers.vmid, node: proxmoxNodes })
    .from(servers)
    .innerJoin(proxmoxNodes, eq(proxmoxNodes.id, servers.proxmoxNodeId))
    .where(eq(servers.id, SERVER_ID));
  if (!server)
    throw new Error("no demo server - run `bun script video/prepare`");
  return getProxmoxInstance(server.node).node.qemu.$(server.vmid);
}

type Rule = {
  type: "in";
  action: "ACCEPT" | "DROP";
  proto?: string;
  dport?: string;
  source?: string;
  comment: string;
};

const RULES: Record<"basic" | "order", { policy: string; rules: Rule[] }> = {
  // How a server is protected: the three services open, everything else dropped.
  basic: {
    policy: "DROP",
    rules: [
      {
        type: "in",
        action: "ACCEPT",
        proto: "tcp",
        dport: "22",
        comment: "SSH",
      },
      {
        type: "in",
        action: "ACCEPT",
        proto: "tcp",
        dport: "80",
        comment: "HTTP",
      },
      {
        type: "in",
        action: "ACCEPT",
        proto: "tcp",
        dport: "443",
        comment: "HTTPS",
      },
    ],
  },
  // The recommended order: specific blocks, allowed services, a general block.
  order: {
    policy: "ACCEPT",
    rules: [
      {
        type: "in",
        action: "DROP",
        source: "198.51.100.0/24",
        comment: "Blocked network",
      },
      {
        type: "in",
        action: "ACCEPT",
        proto: "tcp",
        dport: "22",
        comment: "SSH",
      },
      {
        type: "in",
        action: "ACCEPT",
        proto: "tcp",
        dport: "80",
        comment: "HTTP",
      },
      {
        type: "in",
        action: "ACCEPT",
        proto: "tcp",
        dport: "443",
        comment: "HTTPS",
      },
      { type: "in", action: "DROP", comment: "Everything else" },
    ],
  },
};

export async function setFirewall(variant: keyof typeof RULES) {
  const vm = await demoVm();
  const { policy, rules } = RULES[variant];

  for (const rule of (await vm.firewall.rules.$get()).sort(
    (a, b) => b.pos - a.pos,
  )) {
    await vm.firewall.rules.$(rule.pos).$delete({});
  }
  await vm.firewall.options.$put({
    enable: 1,
    policy_in: policy,
    policy_out: "ACCEPT",
  } as never);
  // Proxmox prepends, so the list is created bottom up.
  for (const rule of [...rules].reverse()) {
    await vm.firewall.rules.$post({ ...rule, enable: 1 } as never);
  }
}

/**
 * The guest as a customer's fresh server: its own hostname, and no firewall of
 * its own, which the video scene enables and which would add a second rule
 * list to every firewall screenshot.
 */
export async function prepareGuest() {
  const vm = await demoVm();
  const result = await runGuestCommand(
    vm,
    [
      "/bin/sh",
      "-c",
      `hostnamectl set-hostname ${SERVER_NAME}; (ufw disable || true) >/dev/null 2>&1; systemctl restart getty@tty1 || true`,
    ],
    { timeoutMs: 60_000, pollIntervalMs: 2_000 },
  );
  if (result.status !== "ok") {
    throw new Error(`could not prepare the guest: ${JSON.stringify(result)}`);
  }
}
