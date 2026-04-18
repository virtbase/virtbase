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

import nodemailer from "nodemailer";
import { pretty, render } from "react-email";
import type { CreateEmailOptions } from "resend";
import { TRUSTPILOT_AFS_EMAIL } from "./resend/constants";

// Send email using NodeMailer (Recommended for local development)
export const sendViaNodeMailer = async ({
  to,
  subject,
  text,
  react,
  bcc,
  trustpilotAfs = false,
}: Pick<CreateEmailOptions, "subject" | "text" | "react" | "bcc"> & {
  to: string;
  trustpilotAfs?: boolean;
}) => {
  if (
    !process.env.SMTP_HOST ||
    !process.env.SMTP_PORT ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASSWORD
  ) {
    console.info(
      "SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASSWORD must be set in the environment variables to use nodemailer. No email was sent.",
    );
    return;
  }

  const transporter = nodemailer.createTransport({
    // @ts-expect-error host is not a valid property of the TransportOptions interface
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
    secure: false,
    tls: {
      rejectUnauthorized: false,
    },
  });

  return await transporter.sendMail({
    from: "noreply@example.com",
    to,
    bcc: trustpilotAfs ? [...(bcc || []), TRUSTPILOT_AFS_EMAIL] : bcc,
    subject,
    text,
    html: await pretty(await render(react)),
  });
};
