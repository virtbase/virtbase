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

import { resend } from "./resend";
import type {
  ResendBulkEmailOptions,
  ResendEmailOptions,
} from "./resend/types";

export const sendEmail = async (
  opts: ResendEmailOptions,
  settings?: { idempotencyKey?: string },
) => {
  if (resend) {
    // Lazily imported so consumers (e.g. workflow steps) don't pull the email
    // rendering stack (react-email) into their static module graph, which
    // breaks bundling/build-time page-data collection.
    const { sendEmailViaResend } = await import("./send-via-resend");
    return await sendEmailViaResend(opts, settings);
  }

  // Fallback to SMTP if Resend is not configured
  const smtpConfigured = Boolean(
    process.env.SMTP_HOST && process.env.SMTP_PORT,
  );

  if (smtpConfigured) {
    const { to, subject, text, react, bcc, trustpilotAfs } = opts;
    const { sendViaNodeMailer } = await import("./send-via-nodemailer");
    return await sendViaNodeMailer({
      to,
      subject,
      text,
      react,
      bcc,
      trustpilotAfs,
    });
  }

  console.info(
    "Email sending failed: Neither SMTP nor Resend is configured. Please set up at least one email service to send emails.",
  );
};

export const sendBatchEmail = async (
  emails: ResendBulkEmailOptions,
  options?: { idempotencyKey?: string },
) => {
  if (resend) {
    const { sendBatchEmailViaResend } = await import("./send-via-resend");
    return await sendBatchEmailViaResend(emails, options);
  }

  // Fallback to SMTP if Resend is not configured
  const smtpConfigured = Boolean(
    process.env.SMTP_HOST && process.env.SMTP_PORT,
  );

  if (smtpConfigured) {
    const { sendViaNodeMailer } = await import("./send-via-nodemailer");
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

  console.info(
    "Email sending failed: Neither SMTP nor Resend is configured. Please set up at least one email service to send emails.",
  );

  return {
    data: null,
    error: null,
  };
};
