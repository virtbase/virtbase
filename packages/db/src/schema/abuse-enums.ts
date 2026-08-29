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

import * as d from "drizzle-orm/pg-core";

/**
 * Enums shared by the abuse tables and by `servers`.
 *
 * They live on their own because `servers` carries the denormalised lock
 * columns and `abuse_case_servers` points back at `servers`. Declaring the
 * enums next to either table would make the two modules import each other.
 */

export const signalStateEnum = d.pgEnum("signal_states", [
  "firing",
  "resolved",
]);

export const signalSeverityEnum = d.pgEnum("signal_severities", [
  "info",
  "warning",
  "critical",
]);

export const signalSubjectKindEnum = d.pgEnum("signal_subject_kinds", [
  "ip",
  "cidr",
  "server",
  "vm",
  "user",
  "node",
  "order",
  "none",
]);

/**
 * How well a signal could be tied to a customer.
 *
 * `stale` is the one that matters: the address resolved, but to whoever held
 * it when the abuse happened rather than whoever holds it now. Enforcement is
 * never automatic in that state - the server on that address today belongs to
 * somebody who did nothing.
 */
export const signalAttributionEnum = d.pgEnum("signal_attributions", [
  "unattributed",
  "attributed",
  "stale",
  "ambiguous",
]);

export const abuseCategoryEnum = d.pgEnum("abuse_categories", [
  "spam",
  "phishing",
  "malware",
  "port_scan",
  "ddos",
  "copyright",
  "compromised",
  "other",
]);

export const abuseCaseSeverityEnum = d.pgEnum("abuse_case_severities", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const abuseCaseStatusEnum = d.pgEnum("abuse_case_statuses", [
  "triage",
  "open",
  "awaiting_customer",
  "awaiting_operator",
  "mitigated",
  "resolved",
  "rejected",
]);

export const abuseCaseResolutionEnum = d.pgEnum("abuse_case_resolutions", [
  "fixed_by_customer",
  "mitigated_by_operator",
  "false_positive",
  "not_our_range",
  "terminated",
  "no_response",
]);

/**
 * What was done to the servers a case implicates, ordered by severity.
 *
 * Everything below `terminate` is reversible and is released when the case
 * settles. `terminate` is reachable only by an operator, and hands the server
 * to the existing `terminates_at` lifecycle rather than deleting anything
 * itself.
 */
export const abuseEnforcementLevelEnum = d.pgEnum("abuse_enforcement_levels", [
  "none",
  "throttle",
  "isolate",
  "power_off",
  "terminate",
]);

export const abuseMessageAuthorEnum = d.pgEnum("abuse_message_authors", [
  "customer",
  "operator",
  "system",
  "reporter",
]);

/**
 * Who a message on a case is addressed to.
 *
 * Three, not two. `internal` is operators talking to each other and `customer`
 * is the account the case is about, but a reply to whoever filed the report is
 * neither - and a reporter who never hears back chases us, or escalates to the
 * upstream provider, and both are worse than an acknowledgement.
 *
 * `author_kind` carries the direction, so one enum covers "they wrote in" and
 * "we wrote back".
 */
export const abuseMessageAudienceEnum = d.pgEnum("abuse_message_audiences", [
  "customer",
  "internal",
  "reporter",
]);

/** Who filed a report, and what standing they have. */
export const abuseContactKindEnum = d.pgEnum("abuse_contact_kinds", [
  "reporter",
  "authority",
  "upstream",
]);

export const abuseEventActorEnum = d.pgEnum("abuse_event_actors", [
  "customer",
  "operator",
  "system",
  "source",
]);
