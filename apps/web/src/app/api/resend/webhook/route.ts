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
import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { emails } from "@virtbase/db/schema";
import { resend } from "@virtbase/email/resend";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

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
      case "email.sent":
      case "email.scheduled":
      case "email.received": {
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
