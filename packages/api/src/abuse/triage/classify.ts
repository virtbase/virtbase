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

import { generateObject } from "ai";
import * as z from "zod";
import { ABUSE_TRIAGE_MODEL, TRIAGE_TIMEOUT_MS } from "./model";
import { buildTriageSystemPrompt } from "./system-prompt";

/**
 * What the model is asked for.
 *
 * `is_abuse_report` comes first on purpose. An abuse mailbox receives sales
 * mail, bounces and conference invitations, and a classifier that has no way
 * to say "this is not a report" will categorise one anyway.
 */
export const AbuseClassificationSchema = z.object({
  is_abuse_report: z.boolean(),
  category: z.enum([
    "spam",
    "phishing",
    "malware",
    "port_scan",
    "ddos",
    "copyright",
    "compromised",
    "other",
  ]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  /**
   * The addresses the report says the abuse came *from*.
   *
   * Not the reporter's own, and not the target's. Every one is checked
   * against the raw message before it is used.
   */
  addresses: z.array(z.string()).max(10),
  /** Neutral prose an operator can paste to the customer. */
  summary: z.string().max(2000),
  confidence: z.number().int().min(0).max(100),
  reasoning: z.string().max(1000),
});

export type AbuseClassification = z.output<typeof AbuseClassificationSchema>;

export interface ClassifyAbuseReportInput {
  subject: string;
  body: string;
  /** The sender, for context only. Never used to decide anything. */
  from?: string;
}

/** Whether assisted triage can run at all. */
export const isTriageAvailable = (): boolean =>
  Boolean(process.env.AI_GATEWAY_API_KEY);

/**
 * Reads an abuse report and says what it is about.
 *
 * Advisory, always. Nothing here emits a signal, so nothing here can reach a
 * rule, and no configuration can make it enforce - which is a stronger
 * guarantee than capping its confidence would be. What it actually buys is
 * the tedious part: pulling the reported address out of a wall of log lines so
 * an operator does not have to.
 *
 * Returns `null` when the gateway is not configured or the model fails. A
 * failed classification leaves the case exactly as a human filed it.
 */
export const classifyAbuseReport = async ({
  subject,
  body,
  from,
}: ClassifyAbuseReportInput): Promise<AbuseClassification | null> => {
  if (!isTriageAvailable()) return null;

  try {
    const result = await generateObject({
      model: ABUSE_TRIAGE_MODEL,
      system: buildTriageSystemPrompt(),
      prompt: [from ? `From: ${from}` : null, `Subject: ${subject}`, "", body]
        .filter((line) => null !== line)
        .join("\n"),
      schema: AbuseClassificationSchema,
      schemaName: "abuse_classification",
      schemaDescription:
        "What an abuse report is about, and which addresses it names.",
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(TRIAGE_TIMEOUT_MS),
      providerOptions: { gateway: { caching: "auto" } },
    });

    return result.object;
  } catch {
    // Never throws at the caller. Triage is an assist, and an assist that can
    // fail the thing it assists is worse than no assist.
    return null;
  }
};
