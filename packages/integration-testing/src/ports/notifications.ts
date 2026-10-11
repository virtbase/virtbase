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

import { expect } from "bun:test";
import type {
  Notification,
  NotificationAudience,
  NotificationChannel,
} from "@virtbase/ports";
import type { Check } from "../checks/run";
import { describeChecks, runChecks } from "../checks/run";
import { findSecretLeaks } from "../checks/secrets";

/** What the notifications contract suite needs from an integration's tests. */
export interface NotificationContractSetup {
  /** The adapter under test, talking to a fresh fake provider. */
  channel: NotificationChannel;
  /** Audiences the channel can deliver to; at least one. */
  supported: NotificationAudience[];
  /** Audiences it cannot deliver to; an empty list when it can reach every one. */
  unsupported: NotificationAudience[];
  /** The stored target configuration a send carries, if the channel needs one. */
  target?: Record<string, unknown>;
  /**
   * Secret values of the integration's own configuration. The values of the
   * target's `targetSecretKeys` are added to them.
   */
  secrets: string[];
  /** How many deliveries reached the fake provider. */
  deliveries(): number;
  /** Makes the fake provider fail the next delivery. */
  failNextDelivery(): void;
}

const notificationFor = (
  audience: NotificationAudience,
  target: Record<string, unknown> | undefined,
): Notification => ({
  id: "ntf_contract",
  key: "integration.contract",
  audience,
  severity: "info",
  params: { case: 42 },
  ...(target && { target }),
  occurredAt: new Date("2026-10-11T00:00:00Z"),
});

const firstSupported = ({ supported }: NotificationContractSetup) => {
  const [audience] = supported;
  if (!audience) throw new Error("supported lists no audience");
  return audience;
};

const secretsOf = ({ channel, target, secrets }: NotificationContractSetup) => [
  ...secrets,
  ...(channel.targetSecretKeys ?? []).flatMap((key) => {
    const value = target?.[key];
    return typeof value === "string" ? [value] : [];
  }),
];

const NOTIFICATION_CHECKS: Check<NotificationContractSetup>[] = [
  {
    title: "supports() is true for every audience it can deliver to",
    run: async ({ channel, supported }) => {
      if (supported.length === 0)
        throw new Error("supported lists no audience");
      for (const audience of supported) {
        expect(await channel.supports(audience)).toBe(true);
      }
    },
  },
  {
    title: "supports() is false for every audience it cannot deliver to",
    run: async ({ channel, unsupported }) => {
      for (const audience of unsupported) {
        expect(await channel.supports(audience)).toBe(false);
      }
    },
  },
  {
    title: "send() delivers once and resolves with a receipt",
    run: async (context) => {
      const receipt = await context.channel.send(
        notificationFor(firstSupported(context), context.target),
      );
      expect(receipt).toBeDefined();
      expect(context.deliveries()).toBe(1);
    },
  },
  {
    title:
      "send() rejects when delivery fails, with no secret in the error or its causes",
    run: async (context) => {
      context.failNextDelivery();
      const error = await context.channel
        .send(notificationFor(firstSupported(context), context.target))
        .then(
          () => null,
          (caught: unknown) => caught,
        );
      expect(error).toBeInstanceOf(Error);
      expect(
        findSecretLeaks({ outputs: { error }, secrets: secretsOf(context) }),
      ).toEqual([]);
    },
  },
];

/**
 * The `notifications` port contract (§4.8 of integration-first.md): every
 * channel runs it against its own fake provider. `setup` runs before each
 * check.
 *
 * It proves that `supports()` is honest for the audiences the integration
 * lists, that `send()` delivers once and resolves with a receipt, and that a
 * failed delivery rejects with no secret in the error or its cause chain.
 * §4.8 also asks that target secrets never reach the logs; the suite does not
 * see the channel's logger, so that part rests on `ctx.logger`'s redaction.
 */
export const describeNotificationChannel = (
  name: string,
  setup: () => Promise<NotificationContractSetup>,
): void =>
  describeChecks(`${name} provides notifications`, NOTIFICATION_CHECKS, setup);

/** Runs the `notifications` contract and returns one line per failed check, for the suite's own tests. */
export const runNotificationContract = (
  setup: () => Promise<NotificationContractSetup>,
): Promise<string[]> => runChecks(NOTIFICATION_CHECKS, setup);
