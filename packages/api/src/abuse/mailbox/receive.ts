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

import * as Sentry from "@sentry/node";
import { and, desc, eq, inArray, sql } from "@virtbase/db";
import type { db as database } from "@virtbase/db/client";
import {
  abuseCaseContacts,
  abuseCaseMessages,
  abuseCases,
} from "@virtbase/db/schema";
import { dispatchNotification } from "../../notifications/dispatch";
import { once } from "../../upstash";
import { caseReference, recordCaseEvent } from "../case";
import { sanitizeAbuseBody, sanitizeAbuseText } from "../sanitize";
import {
  isBareAbuseAddress,
  parseCaseAddress,
  parseSubjectToken,
} from "./address";
import { acknowledgeReporters } from "./send";

type Database = typeof database;

/**
 * One received message, in the shape the mailbox needs.
 *
 * Normalised by the caller rather than taken from a provider payload, so the
 * routing works with whatever the inbound webhook actually gives us. Headers
 * in particular are optional: the chain degrades to the subject token when a
 * provider does not expose them.
 */
export interface InboundAbuseEmail {
  /** The row in `emails`, so the case message can point back at it. */
  emailId?: string | null;
  from: string;
  to: string[];
  subject: string;
  text?: string | null;
  html?: string | null;
  headers?: Record<string, string> | null;
}

export type AbuseEmailOutcome =
  | { routed: "case"; caseId: string; via: RoutingStep }
  | { routed: "new-case"; caseId: string }
  | { routed: "ignored"; reason: string };

export type RoutingStep =
  | "address-tag"
  | "in-reply-to"
  | "subject-token"
  | "known-sender";

/** Cases a message can still be filed against. */
const LIVE_STATUSES = [
  "triage",
  "open",
  "awaiting_customer",
  "awaiting_operator",
  "mitigated",
] as const;

/** How many new cases one sender may open in an hour. */
const NEW_CASE_WINDOW_SECONDS = 3600;

const header = (email: InboundAbuseEmail, name: string): string | undefined => {
  const headers = email.headers;
  if (!headers) return undefined;

  const found = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name,
  );
  return found?.[1];
};

/** Just the address out of `Name <addr@example.com>`. */
export const bareAddress = (value: string): string => {
  const match = /<([^>]+)>/.exec(value);
  return (match?.[1] ?? value).trim().toLowerCase();
};

/**
 * Whether this message is a machine talking, not a person.
 *
 * The first guard against a mail loop. An out-of-office reply that gets
 * acknowledged, whose acknowledgement gets replied to, is a loop that sends
 * until somebody blocks our domain.
 */
export const isAutomated = (email: InboundAbuseEmail): boolean => {
  const autoSubmitted = header(email, "auto-submitted");
  if (autoSubmitted && "no" !== autoSubmitted.toLowerCase()) return true;

  const precedence = header(email, "precedence")?.toLowerCase();
  if (precedence && ["bulk", "list", "junk"].includes(precedence)) return true;

  if (header(email, "x-auto-response-suppress")) return true;
  if (header(email, "list-id")) return true;

  return false;
};

const findByNumber = async (db: Database, caseNumber: number) =>
  db
    .select({ id: abuseCases.id, status: abuseCases.status })
    .from(abuseCases)
    .where(eq(abuseCases.number, caseNumber))
    .limit(1)
    .then(([first]) => first);

/**
 * Which case a message belongs to.
 *
 * Ordered strongest first. The plus tag is the only step we control end to
 * end, and the rest exist because some reporting systems rewrite or strip
 * plus-addressing. The weaker steps append to a case but are never allowed to
 * create one - a subject line is not proof of anything.
 */
export const routeInboundEmail = async ({
  db,
  email,
}: {
  db: Database;
  email: InboundAbuseEmail;
}): Promise<{ caseId: string; via: RoutingStep } | null> => {
  // 1. The signed tag on the recipient.
  for (const recipient of email.to) {
    const caseNumber = parseCaseAddress(recipient);
    if (null === caseNumber) continue;

    const found = await findByNumber(db, caseNumber);
    if (found) return { caseId: found.id, via: "address-tag" };
  }

  // 2. A message we already have on a case, quoted by the reply.
  const references = [
    header(email, "in-reply-to"),
    ...(header(email, "references")?.split(/\s+/) ?? []),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim())
    .filter(Boolean);

  if (references.length > 0) {
    const found = await db
      .select({ caseId: abuseCaseMessages.caseId })
      .from(abuseCaseMessages)
      .where(inArray(abuseCaseMessages.messageId, references))
      .limit(1)
      .then(([first]) => first);

    if (found) return { caseId: found.caseId, via: "in-reply-to" };
  }

  // 3. The reference quoted in the subject.
  const fromSubject = parseSubjectToken(email.subject);
  if (null !== fromSubject) {
    const found = await findByNumber(db, fromSubject);
    if (found) return { caseId: found.id, via: "subject-token" };
  }

  // 4. A sender already corresponding on an open case.
  const sender = bareAddress(email.from);
  const known = await db
    .select({ caseId: abuseCaseContacts.caseId })
    .from(abuseCaseContacts)
    .innerJoin(abuseCases, eq(abuseCases.id, abuseCaseContacts.caseId))
    .where(
      and(
        eq(abuseCaseContacts.email, sender),
        inArray(abuseCases.status, [...LIVE_STATUSES]),
      ),
    )
    .orderBy(desc(abuseCases.createdAt))
    .limit(1)
    .then(([first]) => first);

  if (known) return { caseId: known.caseId, via: "known-sender" };

  return null;
};

/** Records a reporter on a case, and says whether they are new to it. */
export const upsertCaseContact = async ({
  db,
  caseId,
  email,
  name,
}: {
  db: Database;
  caseId: string;
  email: string;
  name?: string | null;
}): Promise<{ id: string; acknowledgedAt: Date | null; notify: boolean }> => {
  const [row] = await db
    .insert(abuseCaseContacts)
    .values({
      caseId,
      email,
      name: sanitizeAbuseText(name ?? null, { maxLength: 200 }),
    })
    .onConflictDoUpdate({
      target: [abuseCaseContacts.caseId, abuseCaseContacts.email],
      set: { lastSeenAt: sql`now()` },
    })
    .returning({
      id: abuseCaseContacts.id,
      acknowledgedAt: abuseCaseContacts.acknowledgedAt,
      notify: abuseCaseContacts.notify,
    });

  if (!row) throw new Error("Failed to record abuse case contact");
  return row;
};

/**
 * Files one received message.
 *
 * Called from the Resend webhook after it has stored the message, so the
 * signature has already been verified and this is never a public write path in
 * its own right.
 */
export const receiveAbuseEmail = async ({
  db,
  email,
}: {
  db: Database;
  email: InboundAbuseEmail;
}): Promise<AbuseEmailOutcome> => {
  const addressedToUs = email.to.some(
    (recipient) =>
      null !== parseCaseAddress(recipient) || isBareAbuseAddress(recipient),
  );

  if (!addressedToUs) {
    return { routed: "ignored", reason: "not addressed to the abuse mailbox" };
  }

  const sender = bareAddress(email.from);
  const body =
    sanitizeAbuseBody(email.text ?? null) ??
    sanitizeAbuseBody(email.html ?? null);

  if (!body) return { routed: "ignored", reason: "empty message" };

  const routed = await routeInboundEmail({ db, email });

  const automated = isAutomated(email);

  if (routed) {
    await appendReporterMessage({ db, caseId: routed.caseId, email, body });

    // A contact new to this case has not been told we have it. Idempotent:
    // the acknowledgement only goes to contacts with no `acknowledged_at`.
    if (!automated) {
      await acknowledgeReporters({ db, caseId: routed.caseId }).catch(
        () => undefined,
      );
    }

    return { routed: "case", caseId: routed.caseId, via: routed.via };
  }

  if (automated) {
    // A bounce or an out-of-office that matched nothing is not a report.
    return { routed: "ignored", reason: "automated message" };
  }

  // Anyone can email `abuse@`, so opening a case is rate limited per sender.
  // Without it one script could fill the queue faster than anyone can read it.
  if (!(await once(`abuse-mailbox:${sender}`, NEW_CASE_WINDOW_SECONDS))) {
    return { routed: "ignored", reason: "sender rate limited" };
  }

  const caseId = await openCaseFromEmail({ db, email, body, sender });

  await acknowledgeReporters({ db, caseId }).catch(() => undefined);

  return { routed: "new-case", caseId };
};

const appendReporterMessage = async ({
  db,
  caseId,
  email,
  body,
}: {
  db: Database;
  caseId: string;
  email: InboundAbuseEmail;
  body: string;
}): Promise<void> => {
  const sender = bareAddress(email.from);

  await db.insert(abuseCaseMessages).values({
    caseId,
    authorKind: "reporter",
    authorEmail: sender,
    // Not `customer`: this is a third party's wording and identity, and the
    // customer's view filters on the audience rather than on a component.
    audience: "reporter",
    body,
    messageId: header(email, "message-id") ?? null,
    inReplyTo: header(email, "in-reply-to") ?? null,
    emailId: email.emailId ?? null,
  });

  await upsertCaseContact({ db, caseId, email: sender });

  await recordCaseEvent({
    db,
    caseId,
    type: "reporter.replied",
    actorKind: "source",
    metadata: { from: sender },
  });

  const abuseCase = await db
    .select({ number: abuseCases.number })
    .from(abuseCases)
    .where(eq(abuseCases.id, caseId))
    .limit(1)
    .then(([first]) => first);

  await dispatchNotification({
    key: "abuse.report.received",
    audience: { kind: "operator" },
    severity: "warning",
    groupKey: `abuse:${caseId}`,
    url: `/abuse/${caseId}`,
    params: {
      reference: caseReference(abuseCase?.number ?? 0),
      from: sender,
      title: email.subject,
      body,
    },
  }).catch(() => undefined);
};

/**
 * Opens a case from a message that matched nothing.
 *
 * Always `triage`, never enforcing. An unauthenticated stranger's email is the
 * weakest evidence the pipeline accepts, and the whole defence against a
 * competitor filing plausible reports is that it waits for a human.
 */
const openCaseFromEmail = async ({
  db,
  email,
  body,
  sender,
}: {
  db: Database;
  email: InboundAbuseEmail;
  body: string;
  sender: string;
}): Promise<string> => {
  const title =
    sanitizeAbuseText(email.subject, { maxLength: 500 }) ??
    `Abuse report from ${sender}`;

  const [created] = await db
    .insert(abuseCases)
    .values({
      // No customer yet. Somebody has to read the message and say who it is
      // about, which is exactly what `triage` means.
      userId: null,
      category: "other",
      severity: "medium",
      status: "triage",
      title,
      summary: body,
    })
    .returning({ id: abuseCases.id, number: abuseCases.number })
    .catch((error: unknown) => {
      Sentry.captureException(error);
      throw error;
    });

  if (!created) throw new Error("Failed to open abuse case from email");

  await db.insert(abuseCaseMessages).values({
    caseId: created.id,
    authorKind: "reporter",
    authorEmail: sender,
    audience: "reporter",
    body,
    messageId: header(email, "message-id") ?? null,
    emailId: email.emailId ?? null,
  });

  await upsertCaseContact({ db, caseId: created.id, email: sender });

  await recordCaseEvent({
    db,
    caseId: created.id,
    type: "case.opened",
    actorKind: "source",
    toValue: "triage",
    metadata: { via: "mailbox", from: sender },
  });

  await dispatchNotification({
    key: "abuse.report.received",
    audience: { kind: "operator" },
    severity: "warning",
    groupKey: `abuse:${created.id}`,
    url: `/abuse/${created.id}`,
    params: {
      reference: caseReference(created.number),
      from: sender,
      title,
      body,
    },
  }).catch(() => undefined);

  return created.id;
};
