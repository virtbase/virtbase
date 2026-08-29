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

import * as z from "zod";

export const SignalSeveritySchema = z.enum(["info", "warning", "critical"]);
export const SignalStateSchema = z.enum(["firing", "resolved"]);

export const AbuseCategorySchema = z.enum([
  "spam",
  "phishing",
  "malware",
  "port_scan",
  "ddos",
  "copyright",
  "compromised",
  "other",
]);

export const AbuseCaseStatusSchema = z.enum([
  "triage",
  "open",
  "awaiting_customer",
  "awaiting_operator",
  "mitigated",
  "resolved",
  "rejected",
]);

export const AbuseCaseSeveritySchema = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);

export const AbuseCaseResolutionSchema = z.enum([
  "fixed_by_customer",
  "mitigated_by_operator",
  "false_positive",
  "not_our_range",
  "terminated",
  "no_response",
]);

export const AbuseEnforcementLevelSchema = z.enum([
  "none",
  "throttle",
  "isolate",
  "power_off",
  "terminate",
]);

/**
 * What the source says the signal is about.
 *
 * Addresses are validated here rather than at the query: `subject_value` is
 * interpolated into an `inet` comparison, and a malformed one would be a
 * database error on a public ingest path.
 */
export const SignalSubjectSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ip"),
    value: z.union([z.ipv4(), z.ipv6()]),
  }),
  z.object({
    kind: z.literal("cidr"),
    value: z.union([z.cidrv4(), z.cidrv6()]),
  }),
  z.object({ kind: z.literal("server"), value: z.string().min(1).max(64) }),
  z.object({
    kind: z.literal("vm"),
    /** The Proxmox VM id, as a string because every label is one. */
    value: z.string().regex(/^\d+$/).max(12),
    /** The node hostname the guest runs on. */
    node: z.string().min(1).max(255),
  }),
  z.object({ kind: z.literal("user"), value: z.string().min(1).max(64) }),
  z.object({ kind: z.literal("node"), value: z.string().min(1).max(255) }),
  z.object({ kind: z.literal("order"), value: z.string().min(1).max(64) }),
  z.object({ kind: z.literal("none") }),
]);

/**
 * The wire form of a signal.
 *
 * Published rather than internal: the `generic` payload format of the
 * alerting integration is exactly this, so anything that can POST JSON can
 * feed the pipeline without a bespoke adapter.
 */
export const InboundSignalSchema = z.object({
  source: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "Lowercase letters, digits and dashes."),
  externalId: z.string().min(1).max(255),
  type: z
    .string()
    .min(1)
    .max(120)
    .regex(
      /^[a-z0-9_]+(\.[a-z0-9_]+)*$/,
      "Dotted lowercase, e.g. `abuse.port_scan`.",
    ),
  state: SignalStateSchema.default("firing"),
  severity: SignalSeveritySchema,
  subject: SignalSubjectSchema,
  title: z.string().min(1).max(500),
  body: z.string().max(50_000).optional(),
  labels: z.record(z.string().max(64), z.string().max(500)).optional(),
  confidence: z.number().int().min(0).max(100).optional(),
  reporter: z
    .object({
      name: z.string().max(200).optional(),
      email: z.email().max(320).optional(),
      organization: z.string().max(200).optional(),
    })
    .optional(),
  occurredAt: z.coerce.date(),
  raw: z.unknown().optional(),
});

export type InboundSignalInput = z.input<typeof InboundSignalSchema>;

/** The prefix that routes a signal into the abuse case pipeline. */
export const ABUSE_SIGNAL_PREFIX = "abuse.";

/**
 * What a customer is shown about a case.
 *
 * A projection rather than the row: the reporter's identity, internal notes
 * and everything about another customer are absent by construction here,
 * which is the only place that filtering cannot be undone by a UI change.
 */
/**
 * A signal type glob, as a rule matches on it.
 *
 * Dotted segments with an optional trailing `*`, the same shape a notification
 * key glob has, so `abuse.*` reads the same in both places. A bare `*` matches
 * every signal that reaches the matcher.
 */
export const SignalTypeGlobSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(
    /^(\*|[a-z0-9_]+(\.[a-z0-9_]+)*(\.\*)?)$/,
    "Use dotted lowercase segments, optionally ending in `*`.",
  );

/**
 * A rule, as the editor submits it.
 *
 * Every bound is deliberate. `actionGraceMinutes` caps at a week because a
 * grace window longer than that is a case nobody is going to enforce anyway,
 * and `actionResponseHours` at 720 matches the case form.
 */
export const AbuseRuleInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable(),
  enabled: z.boolean(),
  priority: z.number().int().min(0).max(10_000),

  matchType: SignalTypeGlobSchema,
  matchSource: z.string().max(100).nullable(),
  matchSeverityMin: SignalSeveritySchema.nullable(),
  matchConfidenceMin: z.number().int().min(0).max(100).nullable(),
  matchLabels: z.record(z.string().min(1).max(100), z.string().max(500)),
  matchRepeatCountMin: z.number().int().min(0).max(1000).nullable(),

  trustedSource: z.boolean(),

  actionCategory: AbuseCategorySchema.nullable(),
  actionCaseSeverity: AbuseCaseSeveritySchema.nullable(),
  /**
   * No `terminate`.
   *
   * Deleting a customer's server is the one level that cannot be undone, and
   * the README is explicit that it is operator-only. Leaving it out of the
   * rule schema is what makes that true rather than a convention.
   */
  actionEnforcement: z.enum(["none", "throttle", "isolate", "power_off"]),
  actionGraceMinutes: z.number().int().min(0).max(10_080),
  actionBlockOrders: z.boolean(),
  actionNotifyUser: z.boolean(),
  actionResponseHours: z.number().int().min(1).max(720),
});

export type AbuseRuleInput = z.infer<typeof AbuseRuleInputSchema>;

export const AbuseCaseSummarySchema = z.object({
  id: z.string(),
  /** The human reference, e.g. `AB-1042`. */
  reference: z.string(),
  category: AbuseCategorySchema,
  severity: AbuseCaseSeveritySchema,
  status: AbuseCaseStatusSchema,
  title: z.string(),
  respond_by: z.date().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});

export const ListAbuseCasesInputSchema = z.object({}).optional();

export const ListAbuseCasesOutputSchema = z.object({
  cases: z.array(AbuseCaseSummarySchema),
});

export const GetAbuseCaseInputSchema = z.object({ id: z.string().min(1) });

export const AbuseCaseMessageSchema = z.object({
  id: z.string(),
  /**
   * `reporter` is deliberately absent. What the customer is accused of is the
   * case summary; the report itself carries a third party's identity and
   * wording, and neither is ours to forward.
   */
  author: z.enum(["customer", "operator", "system"]),
  body: z.string(),
  created_at: z.date(),
});

export const AbuseCaseServerSchema = z.object({
  server_id: z.string(),
  server_name: z.string(),
  lock_level: AbuseEnforcementLevelSchema,
  locked_at: z.date().nullable(),
  released_at: z.date().nullable(),
});

export const GetAbuseCaseOutputSchema = z.object({
  case: AbuseCaseSummarySchema.extend({
    summary: z.string().nullable(),
    servers: z.array(AbuseCaseServerSchema),
    messages: z.array(AbuseCaseMessageSchema),
  }),
});

export const ReplyToAbuseCaseInputSchema = z.object({
  id: z.string().min(1),
  body: z.string().min(1).max(10_000),
});

export const MarkAbuseCaseMitigatedInputSchema = z.object({
  id: z.string().min(1),
  note: z.string().max(10_000).optional(),
});
