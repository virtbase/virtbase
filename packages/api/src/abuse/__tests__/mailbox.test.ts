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

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { eq } from "@virtbase/db";
import {
  abuseCaseContacts,
  abuseCaseMessages,
  abuseCases,
  users,
} from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";

mock.module("../../notifications/dispatch", () => ({
  dispatchNotification: async () => ({
    created: 0,
    deduplicated: 0,
    delivered: 0,
    skipped: 0,
    failed: 0,
  }),
}));

const sent: { to: string; subject: string; headers?: unknown }[] = [];
mock.module("@virtbase/email", () => ({
  sendEmail: async (options: {
    to: string;
    subject: string;
    headers?: unknown;
  }) => {
    sent.push(options);
  },
  sendBatchEmail: async () => undefined,
}));

// Every sender gets its own claim, so the per-sender rate limit does not make
// one test's mail suppress the next one's.
mock.module("../../upstash", () => ({ once: async () => true }));

// Without a signing secret no address can be minted and no tag verified, which
// is the documented behaviour rather than a test-only concern - see
// `signingSecret` in `mailbox/address.ts`.
process.env.ABUSE_MAILBOX_SECRET = "test-mailbox-secret";
process.env.NEXT_PUBLIC_APP_DOMAIN = "virtbase.com";

import { mockSession } from "../../testing";
import {
  isBareAbuseAddress,
  mintCaseAddress,
  parseCaseAddress,
  parseSubjectToken,
} from "../mailbox/address";
import type { InboundAbuseEmail } from "../mailbox/receive";
import {
  bareAddress,
  isAutomated,
  receiveAbuseEmail,
  routeInboundEmail,
} from "../mailbox/receive";
import { acknowledgeReporters, ensureCaseMailbox } from "../mailbox/send";

let testDb: TestDb;

const CASE_ID = "abus_0000000000000000000000001";
const REPORTER = "soc@example.org";

const email = (
  overrides: Partial<InboundAbuseEmail> = {},
): InboundAbuseEmail => ({
  from: `Example SOC <${REPORTER}>`,
  to: ["abuse@virtbase.com"],
  subject: "Port scanning from 45.83.100.10",
  text: "We saw sustained scanning from this address.",
  ...overrides,
});

const seedCase = async (values: Record<string, unknown> = {}) => {
  const [row] = await testDb
    .insert(abuseCases)
    .values({
      id: CASE_ID,
      userId: mockSession.user.id,
      category: "port_scan",
      severity: "medium",
      status: "open",
      title: "Port scanning",
      ...values,
    } as never)
    .returning({ id: abuseCases.id, number: abuseCases.number });

  return row as { id: string; number: number };
};

const messages = () =>
  testDb
    .select()
    .from(abuseCaseMessages)
    .where(eq(abuseCaseMessages.caseId, CASE_ID));

beforeEach(async () => {
  sent.length = 0;
  testDb = await createTestDb();
  await testDb.insert(users).values(mockSession.user);
});

afterEach(async () => {
  await testDb.$client.close();
});

describe("case addresses", () => {
  test("mints and verifies its own tag", () => {
    const address = mintCaseAddress(1042);

    expect(address).toMatch(/^abuse\+1042\.[0-9a-f]{6}@/);
    expect(parseCaseAddress(address as string)).toBe(1042);
  });

  test("a guessed address does not verify", () => {
    // Without the tag the address is `abuse+1043@`, and anyone who can count
    // could post into another customer's case.
    expect(parseCaseAddress("abuse+1042@virtbase.com")).toBeNull();
    expect(parseCaseAddress("abuse+1042.000000@virtbase.com")).toBeNull();
  });

  test("a tag from one case does not open another", () => {
    const address = mintCaseAddress(1042) as string;
    const forged = address.replace("1042.", "1043.");

    expect(parseCaseAddress(forged)).toBeNull();
  });

  test("the bare inbox is recognised but carries no case", () => {
    expect(isBareAbuseAddress("abuse@virtbase.com")).toBe(true);
    expect(parseCaseAddress("abuse@virtbase.com")).toBeNull();
    expect(isBareAbuseAddress("support@virtbase.com")).toBe(false);
  });

  test("reads the reference out of a subject line", () => {
    expect(parseSubjectToken("Re: [AB-1042] Port scanning")).toBe(1042);
    expect(parseSubjectToken("no reference here")).toBeNull();
  });

  test("pulls the address out of a display name", () => {
    expect(bareAddress("Example SOC <SOC@Example.org>")).toBe(
      "soc@example.org",
    );
    expect(bareAddress(" soc@example.org ")).toBe("soc@example.org");
  });
});

describe("isAutomated", () => {
  test("recognises the headers a mail loop starts with", () => {
    expect(
      isAutomated(email({ headers: { "Auto-Submitted": "auto-replied" } })),
    ).toBe(true);
    expect(isAutomated(email({ headers: { Precedence: "bulk" } }))).toBe(true);
    expect(
      isAutomated(email({ headers: { "List-Id": "<list.example.org>" } })),
    ).toBe(true);
  });

  test("a person writing is not automated", () => {
    expect(isAutomated(email())).toBe(false);
    expect(isAutomated(email({ headers: { "Auto-Submitted": "no" } }))).toBe(
      false,
    );
  });
});

describe("routeInboundEmail", () => {
  test("routes on the signed address tag", async () => {
    const abuseCase = await seedCase();
    const address = mintCaseAddress(abuseCase.number) as string;

    expect(
      await routeInboundEmail({
        db: testDb as never,
        email: email({ to: [address] }),
      }),
    ).toEqual({ caseId: CASE_ID, via: "address-tag" });
  });

  test("routes on a quoted message id when the tag is stripped", async () => {
    await seedCase();
    await testDb.insert(abuseCaseMessages).values({
      caseId: CASE_ID,
      authorKind: "reporter",
      authorEmail: REPORTER,
      audience: "reporter",
      body: "first report",
      messageId: "<first@example.org>",
    });

    expect(
      await routeInboundEmail({
        db: testDb as never,
        email: email({ headers: { "In-Reply-To": "<first@example.org>" } }),
      }),
    ).toEqual({ caseId: CASE_ID, via: "in-reply-to" });
  });

  test("routes on the subject reference as a last resort", async () => {
    const abuseCase = await seedCase();

    expect(
      await routeInboundEmail({
        db: testDb as never,
        email: email({ subject: `Re: [AB-${abuseCase.number}] scanning` }),
      }),
    ).toEqual({ caseId: CASE_ID, via: "subject-token" });
  });

  test("routes a known sender onto their open case", async () => {
    await seedCase();
    await testDb
      .insert(abuseCaseContacts)
      .values({ caseId: CASE_ID, email: REPORTER });

    expect(
      await routeInboundEmail({ db: testDb as never, email: email() }),
    ).toEqual({ caseId: CASE_ID, via: "known-sender" });
  });

  test("a closed case does not absorb a known sender's next report", async () => {
    await seedCase({ status: "resolved" });
    await testDb
      .insert(abuseCaseContacts)
      .values({ caseId: CASE_ID, email: REPORTER });

    expect(
      await routeInboundEmail({ db: testDb as never, email: email() }),
    ).toBeNull();
  });
});

describe("receiveAbuseEmail", () => {
  test("files a reply against the case its address names", async () => {
    const abuseCase = await seedCase();
    const address = mintCaseAddress(abuseCase.number) as string;

    const outcome = await receiveAbuseEmail({
      db: testDb as never,
      email: email({
        to: [address],
        text: "Still scanning as of this morning.",
        headers: { "Message-Id": "<second@example.org>" },
      }),
    });

    expect(outcome).toMatchObject({ routed: "case", via: "address-tag" });

    const [message] = await messages();
    expect(message).toMatchObject({
      authorKind: "reporter",
      // Never `customer`: this is a third party's wording and identity.
      audience: "reporter",
      authorEmail: REPORTER,
      messageId: "<second@example.org>",
    });

    const [contact] = await testDb.select().from(abuseCaseContacts);
    expect(contact?.email).toBe(REPORTER);
  });

  test("opens a triage case for a report that matches nothing", async () => {
    const outcome = await receiveAbuseEmail({
      db: testDb as never,
      email: email(),
    });

    expect(outcome.routed).toBe("new-case");

    const [abuseCase] = await testDb.select().from(abuseCases);
    // The weakest evidence the pipeline accepts: an unauthenticated stranger.
    expect(abuseCase?.status).toBe("triage");
    expect(abuseCase?.enforcement).toBe("none");
    // Nobody has said whose it is yet, and inventing a customer would be worse.
    expect(abuseCase?.userId).toBeNull();
  });

  test("acknowledges the reporter once, and only once", async () => {
    await receiveAbuseEmail({ db: testDb as never, email: email() });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(REPORTER);
    expect(sent[0]?.subject).toContain("[AB-");

    const [contact] = await testDb.select().from(abuseCaseContacts);
    expect(contact?.acknowledgedAt).not.toBeNull();

    const address = mintCaseAddress(
      (
        await testDb
          .select()
          .from(abuseCases)
          .then(([row]) => row)
      )?.number as number,
    ) as string;

    await receiveAbuseEmail({
      db: testDb as never,
      email: email({ to: [address], text: "Anything yet?" }),
    });

    // A second message from the same reporter does not acknowledge again.
    expect(sent).toHaveLength(1);
  });

  test("marks its own mail automatic, so the far side does not answer it", async () => {
    await receiveAbuseEmail({ db: testDb as never, email: email() });

    const headers = sent[0]?.headers as Record<string, string> | undefined;
    expect(headers?.["Auto-Submitted"]).toBe("auto-replied");
  });

  test("never acknowledges an automated message", async () => {
    // An out-of-office that gets acknowledged, whose acknowledgement is
    // answered, is a loop that sends until somebody blocks our domain.
    const outcome = await receiveAbuseEmail({
      db: testDb as never,
      email: email({ headers: { "Auto-Submitted": "auto-replied" } }),
    });

    expect(outcome).toMatchObject({ routed: "ignored" });
    expect(sent).toHaveLength(0);
    expect(await testDb.select().from(abuseCases)).toHaveLength(0);
  });

  test("ignores mail addressed somewhere else entirely", async () => {
    expect(
      await receiveAbuseEmail({
        db: testDb as never,
        email: email({ to: ["support@virtbase.com"] }),
      }),
    ).toMatchObject({ routed: "ignored" });
  });

  test("ignores an empty message", async () => {
    expect(
      await receiveAbuseEmail({
        db: testDb as never,
        email: email({ text: "   ", html: null }),
      }),
    ).toMatchObject({ routed: "ignored", reason: "empty message" });
  });
});

describe("ensureCaseMailbox", () => {
  test("mints once and keeps the same address", async () => {
    const abuseCase = await seedCase();

    const first = await ensureCaseMailbox({
      db: testDb as never,
      caseId: CASE_ID,
    });
    const second = await ensureCaseMailbox({
      db: testDb as never,
      caseId: CASE_ID,
    });

    expect(first).toBe(second as string);
    expect(parseCaseAddress(first as string)).toBe(abuseCase.number);
  });
});

describe("acknowledgeReporters", () => {
  test("respects a reporter who asked not to be mailed", async () => {
    await seedCase();
    await testDb.insert(abuseCaseContacts).values({
      caseId: CASE_ID,
      email: REPORTER,
      notify: false,
    });

    const result = await acknowledgeReporters({
      db: testDb as never,
      caseId: CASE_ID,
    });

    expect(result.sent).toEqual([]);
    expect(result.skipped).toEqual([REPORTER]);
    expect(sent).toHaveLength(0);
  });

  test("never writes back to one of our own addresses", async () => {
    // A bounce from our own sender reaching `abuse@` is the cheapest mail loop
    // there is to build.
    await seedCase();
    await testDb.insert(abuseCaseContacts).values({
      caseId: CASE_ID,
      email: `noreply@${process.env.NEXT_PUBLIC_APP_DOMAIN ?? "virtbase.com"}`,
    });

    const result = await acknowledgeReporters({
      db: testDb as never,
      caseId: CASE_ID,
    });

    expect(result.sent).toEqual([]);
    expect(sent).toHaveLength(0);
  });
});
