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

import { APP_DOMAIN, SUPPORT_EMAIL } from "@virtbase/utils";
import { render } from "react-email";
import type { CreateEmailOptions } from "resend";
import { EmailDeliveryError } from "./errors";
import { getResendClient } from "./resend";
import { TRUSTPILOT_AFS_EMAIL, VARIANT_TO_FROM_MAP } from "./resend/constants";
import type {
  ResendBulkEmailOptions,
  ResendEmailOptions,
} from "./resend/types";

/**
 * Turns one send into a thrown error, so that no failure can be mistaken for
 * a delivery. Resend answers a revoked key, an unverified domain and a
 * network fault the same way - `{ data: null, error }` - and never throws.
 */
const throwOnProviderError = (
  result: { error?: { name?: string; message?: string } | null },
  subject: string | undefined,
): void => {
  if (!result.error) return;

  const { name, message } = result.error;
  throw new EmailDeliveryError(
    `Resend refused the email "${subject ?? "(no subject)"}": ${message ?? "unknown error"}${
      name ? ` (${name})` : ""
    }`,
    { cause: result.error },
  );
};

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
    // Held back because it selects the other half of `CreateEmailOptions`: a
    // templated send carries no html, text or react, so it cannot simply ride
    // along with them.
    template,
    // Everything else the provider understands travels through untouched -
    // `attachments` above all, which used to be dropped here, so every invoice
    // email went out announcing an invoice it did not carry. `cc` went the
    // same way. Only the fields destructured above are Virtbase's own or need
    // rewriting; the rest are Resend's and are none of this function's
    // business.
    ...passthrough
  } = opts;

  const isProdEnv = process.env.NEXT_PUBLIC_VERCEL_ENV === "production";
  const gitBranch = process.env.VERCEL_GIT_COMMIT_REF;

  // Build base options without rendered outputs (react/text)
  // CreateEmailOptions requires at least one of react or text
  const baseOptions = {
    ...passthrough,
    to: isProdEnv ? to : "delivered@resend.dev",
    from: from || VARIANT_TO_FROM_MAP[variant],
    subject: `${!isProdEnv && gitBranch ? `[${gitBranch}] ` : ""}${subject}`,
    bcc: trustpilotAfs ? [...(bcc || []), TRUSTPILOT_AFS_EMAIL] : bcc,
    // if replyTo is set to "noreply", don't set replyTo
    // else set it to the value of replyTo or fallback to SUPPORT_EMAIL
    ...(replyTo === "noreply" ? {} : { replyTo: replyTo || SUPPORT_EMAIL }),
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

  // A templated send is rendered by the provider, so it takes no body at all.
  if (template) {
    return { ...baseOptions, template };
  }
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
  const resend = getResendClient();
  if (!resend) {
    throw new EmailDeliveryError(
      "RESEND_API_KEY is not set, so no email could be sent through Resend.",
    );
  }

  const idempotencyKey = settings?.idempotencyKey || undefined;

  const result = await resend.emails.send(
    await resendEmailForOptions(opts),
    idempotencyKey ? { idempotencyKey } : undefined,
  );

  throwOnProviderError(result, opts.subject);

  return result;
};

export const sendBatchEmailViaResend = async (
  emails: ResendBulkEmailOptions,
  options?: { idempotencyKey?: string },
) => {
  const resend = getResendClient();
  if (!resend) {
    throw new EmailDeliveryError(
      "RESEND_API_KEY is not set, so no email could be sent through Resend.",
    );
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

  const result = await resend.batch.send(
    filteredBatch,
    idempotencyKey ? { idempotencyKey } : undefined,
  );

  throwOnProviderError(
    result,
    `${filteredBatch.length} message(s) starting "${emails[0]?.subject ?? ""}"`,
  );

  return result;
};
