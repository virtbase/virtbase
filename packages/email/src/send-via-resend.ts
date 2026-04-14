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

import { render } from "@react-email/render";
import { APP_DOMAIN } from "@virtbase/utils";
import type { CreateEmailOptions } from "resend";
import { resend } from "./resend";
import { TRUSTPILOT_AFS_EMAIL, VARIANT_TO_FROM_MAP } from "./resend/constants";
import type {
  ResendBulkEmailOptions,
  ResendEmailOptions,
} from "./resend/types";

const resendEmailForOptions = async (
  opts: ResendEmailOptions,
): Promise<CreateEmailOptions> => {
  const {
    to,
    from,
    variant = "primary",
    bcc,
    replyTo,
    subject,
    html,
    text,
    react,
    scheduledAt,
    headers,
    tags,
    unsubscribeUrl,
    trustpilotAfs = false,
  } = opts;

  const isProdEnv = process.env.NEXT_PUBLIC_VERCEL_ENV === "production";
  const gitBranch = process.env.VERCEL_GIT_COMMIT_REF;

  // Build base options without rendered outputs (react/text)
  // CreateEmailOptions requires at least one of react or text
  const baseOptions = {
    to: isProdEnv ? to : "delivered@resend.dev",
    from: from || VARIANT_TO_FROM_MAP[variant],
    subject: `${!isProdEnv && gitBranch ? `[${gitBranch}] ` : ""}${subject}`,
    bcc: trustpilotAfs ? [...(bcc || []), TRUSTPILOT_AFS_EMAIL] : bcc,
    // if replyTo is set to "noreply", don't set replyTo
    // else set it to the value of replyTo or fallback to support@virtbase.com
    ...(replyTo === "noreply"
      ? {}
      : { replyTo: replyTo || "support@virtbase.com" }),
    scheduledAt,
    tags,
    ...(variant === "marketing"
      ? {
          headers: {
            ...(headers || {}),
            "List-Unsubscribe":
              unsubscribeUrl || `${APP_DOMAIN}/account/settings`,
          },
        }
      : headers && { headers }),
  };

  // Add render options (html, react, or text) - at least one must be present
  if (html) {
    return { ...baseOptions, html };
  }
  if (react) {
    const renderedHtml = await render(react);

    // Helpful runtime signal when a template leaves unresolved placeholders.
    const unresolvedTokens = renderedHtml.match(/\{[a-zA-Z0-9_]+\}/g) || [];
    if (unresolvedTokens.length > 0) {
      console.warn(
        `Email HTML contains unresolved placeholders for subject "${subject}": ${[...new Set(unresolvedTokens)].join(", ")}`,
      );
    }

    return { ...baseOptions, html: renderedHtml };
  }
  if (text) {
    return { ...baseOptions, text };
  }
  // If none of react or text is provided, we need to ensure at least one is present
  // This shouldn't happen in practice, but we'll default to an empty text
  return { ...baseOptions, text: "" };
};

// Send email using Resend (Recommended for production)
export const sendEmailViaResend = async (
  opts: ResendEmailOptions,
  settings?: { idempotencyKey?: string },
) => {
  if (!resend) {
    console.info(
      "RESEND_API_KEY is not set in the .env. Skipping sending email.",
    );
    return;
  }

  const idempotencyKey = settings?.idempotencyKey || undefined;

  return await resend.emails.send(
    await resendEmailForOptions(opts),
    idempotencyKey ? { idempotencyKey } : undefined,
  );
};

export const sendBatchEmailViaResend = async (
  emails: ResendBulkEmailOptions,
  options?: { idempotencyKey?: string },
) => {
  if (!resend) {
    console.info(
      "RESEND_API_KEY is not set in the .env. Skipping sending email.",
    );

    return {
      data: null,
      error: null,
    };
  }

  if (emails.length === 0) {
    return {
      data: null,
      error: null,
    };
  }

  // Filter out emails without to address and format payload for Resend.
  const filteredBatch: CreateEmailOptions[] = [];
  for (const email of emails) {
    if (!email?.to) {
      continue;
    }

    filteredBatch.push(await resendEmailForOptions(email));
  }

  if (filteredBatch.length === 0) {
    return {
      data: null,
      error: null,
    };
  }

  const idempotencyKey = options?.idempotencyKey || undefined;

  return await resend.batch.send(
    filteredBatch,
    idempotencyKey ? { idempotencyKey } : undefined,
  );
};
