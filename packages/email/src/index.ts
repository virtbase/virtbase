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

import { EmailDeliveryError } from "./errors";
import { getResendClient } from "./resend";
import type {
  ResendBulkEmailOptions,
  ResendEmailOptions,
} from "./resend/types";
import { sendViaNodeMailer } from "./send-via-nodemailer";
import { sendBatchEmailViaResend, sendEmailViaResend } from "./send-via-resend";

export { EmailDeliveryError } from "./errors";

const NO_PROVIDER_MESSAGE =
  "No email provider is configured. Set RESEND_API_KEY, or all of SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASSWORD.";

/**
 * All four, not just host and port.
 *
 * The transport itself needs credentials, and treating a half-configured SMTP
 * as "configured" routed the send into a transport that logged and returned -
 * a silent discard wearing the same shape as a success.
 */
const isSmtpConfigured = (): boolean =>
  Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASSWORD,
  );

/**
 * What happens when there is nothing to send with.
 *
 * Outside development this is a delivery failure like any other, because the
 * caller has to be able to tell. `deliverNotification` turns a throw into a
 * failed row that the retry cron picks up, and the abuse desk reads that same
 * log to decide whether a customer was told before it escalates enforcement -
 * so a deployment that quietly logs is one that powers off servers over a
 * notice nobody sent.
 *
 * `development` is the single exemption, and it is the guard the auth package
 * already uses for the same reason: a fresh checkout has no mail credentials
 * and must still be able to sign in and run a workflow end to end. In
 * development a notification is therefore still recorded as delivered - the
 * deliberate cost of not making a local run crash.
 */
const reportMissingProvider = (): void => {
  if (process.env.NODE_ENV === "development") {
    console.info(
      `${NO_PROVIDER_MESSAGE} Skipped, because this is development.`,
    );
    return;
  }

  throw new EmailDeliveryError(NO_PROVIDER_MESSAGE);
};

export const sendEmail = async (
  opts: ResendEmailOptions,
  settings?: { idempotencyKey?: string },
) => {
  if (getResendClient()) {
    return await sendEmailViaResend(opts, settings);
  }

  // Fallback to SMTP if Resend is not configured
  if (isSmtpConfigured()) {
    const { to, subject, text, react, bcc, trustpilotAfs } = opts;
    return await sendViaNodeMailer({
      to,
      subject,
      text,
      react,
      bcc,
      trustpilotAfs,
    });
  }

  reportMissingProvider();
};

export const sendBatchEmail = async (
  emails: ResendBulkEmailOptions,
  options?: { idempotencyKey?: string },
) => {
  if (getResendClient()) {
    return await sendBatchEmailViaResend(emails, options);
  }

  // Fallback to SMTP if Resend is not configured
  if (isSmtpConfigured()) {
    await Promise.all(
      emails.map((p) =>
        sendViaNodeMailer({
          to: p.to,
          subject: p.subject,
          text: p.text,
          react: p.react,
          bcc: p.bcc,
          trustpilotAfs: p.trustpilotAfs,
        }),
      ),
    );

    return {
      data: null,
      error: null,
    };
  }

  reportMissingProvider();

  return {
    data: null,
    error: null,
  };
};
