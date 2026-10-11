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

import { describe, expect, test } from "bun:test";
import type {
  NotificationAudience,
  NotificationChannel,
} from "@virtbase/ports";
import type { NotificationContractSetup } from "../notifications";
import {
  describeNotificationChannel,
  runNotificationContract,
} from "../notifications";

const SIGNING_KEY = "whsec-reference-signing-key";

/**
 * A reference channel: what the contract expects of any channel.
 * `leakTarget` breaks it by putting the target's signing key into the error.
 */
const referenceChannel = async ({
  leakTarget = false,
} = {}): Promise<NotificationContractSetup> => {
  let delivered = 0;
  let failNext = false;
  const channel: NotificationChannel = {
    id: "reference",
    supports: async (audience: NotificationAudience) =>
      audience.kind === "operator",
    send: async (notification) => {
      if (failNext) {
        failNext = false;
        const detail = leakTarget
          ? `signed with ${String(notification.target?.signingKey)}`
          : "the endpoint answered 500";
        throw new Error("delivery failed", { cause: new Error(detail) });
      }
      delivered++;
      return { externalId: `msg-${delivered}` };
    },
    targetSecretKeys: ["signingKey"],
  };
  return {
    channel,
    supported: [{ kind: "operator" }],
    unsupported: [{ kind: "user", userId: "usr_reference" }],
    target: { url: "https://hooks.example/in", signingKey: SIGNING_KEY },
    secrets: [],
    deliveries: () => delivered,
    failNextDelivery: () => {
      failNext = true;
    },
  };
};

describeNotificationChannel("the reference channel", () => referenceChannel());

describe("runNotificationContract", () => {
  test("fails a channel whose error cause carries a target secret", async () => {
    expect(
      (
        await runNotificationContract(() =>
          referenceChannel({ leakTarget: true }),
        )
      ).map((failure) => failure.slice(0, failure.indexOf(":"))),
    ).toEqual([
      "send() rejects when delivery fails, with no secret in the error or its causes",
    ]);
  });
});
