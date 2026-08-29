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

import * as Sentry from "@sentry/nextjs";
import { receiveAbuseEmail } from "@virtbase/api/abuse";
import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { emails } from "@virtbase/db/schema";
import { resend } from "@virtbase/email/resend";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Every address the message actually arrived for.
 *
 * `received_for` is the envelope recipient, taken from the `for` clause of the
 * `Received` headers, and it is the only place the original address survives a
 * forward. `abuse@virtbase.com` is published in whois and forwarded into the
 * Resend domain, so a reply to a case address that goes the long way round
 * still carries its `abuse+<number>.<tag>` tag here even though `To:` has been
 * rewritten to the forwarding address.
 */
const recipientsOf = (email: {
  to: string[];
  received_for: string[];
}): string[] => [...new Set([...email.to, ...email.received_for])];

export async function POST(req: NextRequest) {
  try {
    if (!resend) {
      return new NextResponse(
        "Resend is not configured. Ensure RESEND_API_KEY is set in the environment variables.",
        {
          status: 500,
        },
      );
    }

    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) {
      return new NextResponse(
        "Missing RESEND_WEBHOOK_SECRET. Cannot verify webhook.",
        {
          status: 500,
        },
      );
    }

    const payload = await req.text();

    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      return new NextResponse("Missing SVIX headers. Cannot verify webhook.", {
        status: 400,
      });
    }

    const result = resend.webhooks.verify({
      payload,
      headers: {
        id: svixId,
        timestamp: svixTimestamp,
        signature: svixSignature,
      },
      webhookSecret: secret,
    });

    switch (result.type) {
      // Inbound mail is a different resource, not a different event on the
      // same one: `emails.get` addresses what we sent, `emails.receiving.get`
      // what arrived. The webhook itself carries only metadata - no body, no
      // headers, no attachments - so that a large message still fits inside a
      // serverless request body, which is why the content is fetched here and
      // not read off `result.data`. Headers in particular arrive nowhere else,
      // and both the `In-Reply-To` routing step and the automated-mail loop
      // guard are blind without them.
      case "email.received": {
        const externalId = result.data.email_id;
        const received = await resend.emails.receiving.get(externalId);

        if (received.error) {
          throw new Error(received.error.message);
        }

        const {
          from,
          to,
          bcc,
          cc,
          reply_to: replyTo,
          received_for: receivedFor,
          subject,
          html,
          text,
          headers,
          created_at: createdAt,
        } = received.data;

        await db.transaction(
          async (tx) => {
            await tx
              .insert(emails)
              .values({
                externalId,
                from,
                to,
                bcc,
                cc,
                replyTo,
                subject,
                html,
                text,
                lastEvent: "received",
                createdAt: new Date(createdAt),
              })
              .onConflictDoUpdate({
                target: [emails.externalId],
                set: { lastEvent: "received" },
              });
          },
          {
            accessMode: "read write",
            isolationLevel: "read committed",
          },
        );

        // Everything addressed to the abuse mailbox is filed against a case.
        // Deliberately after the row exists, so the case message can point at
        // it, and deliberately swallowed: a routing failure must not make
        // Resend retry a webhook whose only job was to store the message.
        await receiveAbuseEmail({
          db,
          email: {
            externalId,
            from,
            to: recipientsOf({ to, received_for: receivedFor }),
            subject,
            text,
            html,
            headers,
          },
        }).catch((error: unknown) => {
          console.error("[abuse] Failed to route received mail", error);
          Sentry.captureException(error, {
            tags: { "abuse.mailbox.route": "true" },
          });
        });

        break;
      }
      case "email.sent":
      case "email.scheduled": {
        const externalId = result.data.email_id;
        const email = await resend.emails.get(externalId);

        if (email.error) {
          throw new Error(email.error.message);
        }

        const {
          from,
          to,
          bcc,
          cc,
          subject,
          html,
          text,
          tags,
          last_event: lastEvent,
          scheduled_at: scheduledAt,
          created_at: createdAt,
        } = email.data;

        await db.transaction(
          async (tx) => {
            await tx
              .insert(emails)
              .values({
                externalId,
                from,
                to,
                bcc,
                cc,
                subject,
                html,
                text,
                tags,
                lastEvent,
                scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
                createdAt: new Date(createdAt),
              })
              .onConflictDoUpdate({
                target: [emails.externalId],
                set: { lastEvent },
              });
          },
          {
            accessMode: "read write",
            isolationLevel: "read committed",
          },
        );

        break;
      }
      case "email.bounced":
      case "email.clicked":
      case "email.complained":
      case "email.delivered":
      case "email.delivery_delayed":
      case "email.opened":
      case "email.failed":
      case "email.suppressed": {
        const externalId = result.data.email_id;
        const lastEvent = result.type.split(".").pop();

        await db.transaction(
          async (tx) => {
            await tx
              .update(emails)
              .set({ lastEvent })
              .where(eq(emails.externalId, externalId));
          },
          {
            accessMode: "read write",
            isolationLevel: "read committed",
          },
        );
        break;
      }
      default:
        // Unhandled event type
        break;
    }

    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    console.error(error);

    Sentry.captureException(error, {
      tags: {
        "resend.webhook.error": "true",
      },
    });

    return new NextResponse("Failed to process webhook", { status: 500 });
  }
}
