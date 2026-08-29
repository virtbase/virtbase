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
import { and, desc, eq, isNull, sql } from "@virtbase/db";
import type { db as database } from "@virtbase/db/client";
import {
  abuseCaseContacts,
  abuseCaseMessages,
  abuseCases,
} from "@virtbase/db/schema";
import { sendEmail } from "@virtbase/email";
import AbuseReportReply from "@virtbase/email/templates/abuse-report-reply";
import { caseReference, recordCaseEvent } from "../case";
import { bareAbuseAddress, mintCaseAddress, subjectToken } from "./address";

type Database = typeof database;

/**
 * The name on everything the desk sends.
 *
 * Not "Virtbase": the recipient is another provider's abuse team or a CERT,
 * and what they need from the sender line is which desk is writing, not which
 * company. It is also what they will search their own ticket system for.
 */
const ABUSE_DESK_NAME = "Virtbase Abuse Desk";

/**
 * Our own domains, so an acknowledgement never answers ourselves.
 *
 * The cheapest mail loop to build: a bounce from our own sender reaches
 * `abuse@`, is acknowledged, bounces again.
 */
const isOurOwnAddress = (address: string): boolean => {
  const domain = address.split("@")[1]?.toLowerCase();
  if (!domain) return true;

  const ours = [
    process.env.NEXT_PUBLIC_APP_DOMAIN,
    process.env.ABUSE_MAILBOX_DOMAIN,
  ].filter((value): value is string => Boolean(value));

  return ours.some(
    (own) =>
      domain === own.toLowerCase() || domain.endsWith(`.${own.toLowerCase()}`),
  );
};

const loadCase = async (db: Database, caseId: string) =>
  db
    .select({
      id: abuseCases.id,
      number: abuseCases.number,
      title: abuseCases.title,
      status: abuseCases.status,
      mailboxAddress: abuseCases.mailboxAddress,
    })
    .from(abuseCases)
    .where(eq(abuseCases.id, caseId))
    .limit(1)
    .then(([first]) => first);

/**
 * Makes sure the case has an address reporters can reply to.
 *
 * Minted lazily rather than at insert, because the human number is generated
 * by the database and is not known until the row exists.
 */
export const ensureCaseMailbox = async ({
  db,
  caseId,
}: {
  db: Database;
  caseId: string;
}): Promise<string | null> => {
  const abuseCase = await loadCase(db, caseId);
  if (!abuseCase) return null;
  if (abuseCase.mailboxAddress) return abuseCase.mailboxAddress;

  const address = mintCaseAddress(abuseCase.number);
  if (!address) return null;

  await db
    .update(abuseCases)
    .set({ mailboxAddress: address })
    .where(eq(abuseCases.id, caseId));

  return address;
};

/** The `Message-ID` of the last thing this contact sent, for threading. */
const lastMessageIdFrom = async (
  db: Database,
  caseId: string,
  contactEmail: string,
): Promise<string | null> => {
  const row = await db
    .select({ messageId: abuseCaseMessages.messageId })
    .from(abuseCaseMessages)
    .where(
      and(
        eq(abuseCaseMessages.caseId, caseId),
        eq(abuseCaseMessages.authorEmail, contactEmail),
      ),
    )
    .orderBy(desc(abuseCaseMessages.createdAt))
    .limit(1)
    .then(([first]) => first);

  return row?.messageId ?? null;
};

export interface SendToReporterInput {
  db: Database;
  caseId: string;
  /** Defaults to every contact on the case that may be written to. */
  contactEmail?: string;
  body: string;
  actorUserId?: string | null;
  /** Marks the contact acknowledged, so the automatic one never repeats. */
  isAcknowledgement?: boolean;
}

export interface SendToReporterResult {
  sent: string[];
  skipped: string[];
}

/**
 * Writes to whoever reported the case.
 *
 * [!] The body is published to a third party. It must never carry the
 * customer's identity - that is a policy an operator applies when writing,
 * not something this function can enforce, and the composer says so.
 */
export const sendToReporters = async ({
  db,
  caseId,
  contactEmail,
  body,
  actorUserId = null,
  isAcknowledgement = false,
}: SendToReporterInput): Promise<SendToReporterResult> => {
  const abuseCase = await loadCase(db, caseId);
  if (!abuseCase) throw new Error(`Unknown abuse case "${caseId}"`);

  const caseAddress = await ensureCaseMailbox({ db, caseId });
  const reference = caseReference(abuseCase.number);

  // The case address is the sender, not just somewhere to reply to. A reporter
  // is often a ticket system rather than a person, and enough of them answer
  // the `From` header while ignoring `Reply-To` that threading cannot rest on
  // the weaker one. Falls back to the bare desk address when the case has no
  // tag, which routes by the subject reference instead.
  const sender = caseAddress ?? bareAbuseAddress();

  const contacts = await db
    .select({
      id: abuseCaseContacts.id,
      email: abuseCaseContacts.email,
      notify: abuseCaseContacts.notify,
      acknowledgedAt: abuseCaseContacts.acknowledgedAt,
    })
    .from(abuseCaseContacts)
    .where(
      and(
        eq(abuseCaseContacts.caseId, caseId),
        contactEmail ? eq(abuseCaseContacts.email, contactEmail) : undefined,
        // An acknowledgement goes out once per contact per case; a reply an
        // operator wrote goes out whenever they send it.
        isAcknowledgement
          ? isNull(abuseCaseContacts.acknowledgedAt)
          : undefined,
      ),
    );

  const result: SendToReporterResult = { sent: [], skipped: [] };

  for (const contact of contacts) {
    if (!contact.notify) {
      result.skipped.push(contact.email);
      continue;
    }

    if (isOurOwnAddress(contact.email)) {
      result.skipped.push(contact.email);
      continue;
    }

    const inReplyTo = await lastMessageIdFrom(db, caseId, contact.email);

    try {
      await sendEmail({
        to: contact.email,
        subject: `${subjectToken(abuseCase.number)} ${abuseCase.title}`,
        // Both, and both the abuse domain: a reply threads back through the
        // routing chain without the reporter having to do anything, whichever
        // header their mail client honours. `replyTo` is never left unset -
        // the default is the support address, which is a different inbox on a
        // different provider and would strand the answer.
        from: `${ABUSE_DESK_NAME} <${sender}>`,
        replyTo: sender,
        headers: {
          // Marks our own mail as automatic, so a well-behaved autoresponder
          // on the other side does not answer it. The other half of the loop
          // guard; ours is `isAutomated` on the way in.
          "Auto-Submitted": isAcknowledgement
            ? "auto-replied"
            : "auto-generated",
          ...(inReplyTo
            ? { "In-Reply-To": inReplyTo, References: inReplyTo }
            : {}),
        },
        react: await AbuseReportReply({
          email: contact.email,
          reference,
          body,
          // Deliberately the case address rather than the sender: the footer
          // promises a reply lands on this case, and only the tagged address
          // makes that true on its own. Without one it tells them to keep the
          // reference in the subject, which is what the routing then needs.
          ...(caseAddress ? { replyTo: caseAddress } : {}),
        }),
      });

      await db.insert(abuseCaseMessages).values({
        caseId,
        authorKind: isAcknowledgement ? "system" : "operator",
        authorUserId: actorUserId,
        audience: "reporter",
        body,
      });

      if (isAcknowledgement) {
        await db
          .update(abuseCaseContacts)
          .set({ acknowledgedAt: sql`now()` })
          .where(eq(abuseCaseContacts.id, contact.id));
      }

      result.sent.push(contact.email);
    } catch (error) {
      result.skipped.push(contact.email);
      Sentry.captureException(error, {
        tags: { "abuse.mailbox": "send", "abuse.case": caseId },
      });
    }
  }

  if (result.sent.length > 0) {
    await recordCaseEvent({
      db,
      caseId,
      type: isAcknowledgement ? "reporter.acknowledged" : "reporter.replied",
      actorKind: isAcknowledgement ? "system" : "operator",
      actorUserId,
      metadata: { to: result.sent },
    });
  }

  return result;
};

/**
 * Tells whoever reported it that we have it.
 *
 * A reporter who never hears back chases us, or escalates to the upstream
 * provider, and both cost more than a sentence. Once per contact per case,
 * never to an automated sender, never to ourselves.
 */
export const acknowledgeReporters = async ({
  db,
  caseId,
}: {
  db: Database;
  caseId: string;
}): Promise<SendToReporterResult> =>
  sendToReporters({
    db,
    caseId,
    isAcknowledgement: true,
    body: [
      "Thank you for the report. It has been logged and our abuse team is looking into it.",
      "",
      "We will contact the customer responsible and act on it. You will hear from us again when the case is closed. Replying to this message adds to the same case.",
    ].join("\n"),
  });

/** Tells the reporters a case they filed has been settled. */
export const notifyReportersResolved = async ({
  db,
  caseId,
}: {
  db: Database;
  caseId: string;
}): Promise<SendToReporterResult> =>
  sendToReporters({
    db,
    caseId,
    body: [
      "The case you reported has been closed.",
      "",
      "The customer responsible was contacted and the issue has been dealt with. Thank you for taking the time to tell us.",
    ].join("\n"),
  });
