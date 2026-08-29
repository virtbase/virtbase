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

import {
  getEmailMessages,
  resolveEmailLocale,
} from "@virtbase/email/translations";
import { createTranslator } from "use-intl/core";

export interface NotificationText {
  /** One line. Becomes the email subject and the Discord embed title. */
  title: string;
  /** A short paragraph. Plain text - every channel escapes it for its own sink. */
  body: string;
}

export type NotificationParams = Record<
  string,
  string | number | boolean | null
>;

export type NotificationRenderer = (
  params: NotificationParams,
  locale: string,
) => NotificationText;

const str = (value: string | number | boolean | null | undefined): string =>
  null === value || undefined === value ? "" : String(value);

/**
 * What each notification key says, per key.
 *
 * Rendering happens here rather than in the channels. A channel owns its
 * markup - an HTML email, a Discord embed, a JSON body - but not its words,
 * or a new notification key would mean writing the same sentence three times
 * and letting the three drift.
 *
 * The renderer takes a locale because the recipient's language is decided per
 * delivery: one case can notify a German customer and an English operator
 * webhook from the same dispatch.
 */
export const NOTIFICATION_TEXT: Record<string, NotificationRenderer> = {
  /**
   * The customer's notice. The only abuse key that reaches a customer, and
   * therefore the only one translated - the rest go to operators, whose
   * language is the one the runbooks are written in.
   */
  "abuse.case.notice": (params, locale) => {
    const t = createTranslator({
      messages: getEmailMessages(locale),
      locale: resolveEmailLocale(locale),
      namespace: "abuse-case-notice",
    });

    return {
      title: t("title", { reference: str(params.reference) }),
      body: t("body", {
        reference: str(params.reference),
        category: str(params.category).replace(/_/g, " "),
        deadlineHours: str(params.deadlineHours),
      }),
    };
  },

  "abuse.case.restricted": (params, locale) => {
    const t = createTranslator({
      messages: getEmailMessages(locale),
      locale: resolveEmailLocale(locale),
      namespace: "abuse-case-restricted",
    });

    return {
      title: t("title", { reference: str(params.reference) }),
      body: t(`body_${str(params.level)}` as "body_isolate", {
        reference: str(params.reference),
      }),
    };
  },

  "abuse.case.enforced": (params) => ({
    title: `Abuse case ${str(params.reference)}: ${str(params.level).replace(/_/g, " ")} applied to ${str(params.servers)} server(s)`,
    body:
      Number(params.failed) > 0
        ? `${str(params.failed)} server(s) could not be reached and will be retried by the lock reconciliation.`
        : "Every implicated server is locked.",
  }),

  "abuse.case.escalated": (params) => ({
    title: `Abuse case ${str(params.reference)} escalated to ${str(params.level).replace(/_/g, " ")}`,
    body: `The customer did not answer in time (${str(params.reason)}). Enforcement has been tightened one level.`,
  }),

  /**
   * The customer removed the lock. Loud on purpose: once is a coincidence,
   * twice is a decision, and the count is what an operator escalates on.
   */
  "abuse.lock.drift_detected": (params) => ({
    title: `Abuse lock removed on ${str(params.serverId)} (${str(params.reference)})`,
    body: `The ${str(params.level).replace(/_/g, " ")} lock was no longer in force and has been re-applied. This is drift number ${str(params.driftCount)} on this server.`,
  }),

  "abuse.case.triaged": (params) => ({
    title: `${str(params.reference)} attributed to a customer by assisted triage`,
    body: `Read as ${str(params.category).replace(/_/g, " ")} at ${str(params.confidence)}% confidence, from ${str(params.addresses)}. The case is still in triage and nothing has been enforced.`,
  }),

  "abuse.report.received": (params) => ({
    title: `${str(params.reference)}: report from ${str(params.from)}`,
    body: [str(params.title), "", str(params.body)].filter(Boolean).join("\n"),
  }),

  "abuse.source.poll_incomplete": (params) => ({
    title: `${str(params.source)} swept ${str(params.covered)} of ${str(params.offered)} ranges`,
    body: `The sweep stopped early, most likely on the provider's daily quota${
      null === params.quotaRemaining
        ? ""
        : ` (${str(params.quotaRemaining)} calls left)`
    }. The ranges it did not reach keep their watermark and go first next run.`,
  }),

  "abuse.source.poll_failed": (params) => ({
    title: `${str(params.source)} sweep failed`,
    body: str(params.error),
  }),

  "abuse.case.opened": (params) => ({
    title: `New abuse case ${str(params.reference)}: ${str(params.title)}`,
    body: [
      str(params.body),
      `Category: ${str(params.category).replace(/_/g, " ")}`,
      `Status: ${str(params.status)}`,
      `Attribution: ${str(params.attribution)}`,
      `Source: ${str(params.source)}`,
    ]
      .filter(Boolean)
      .join("\n"),
  }),

  "abuse.case.updated": (params) => ({
    title: `Abuse case ${str(params.reference)} has a new report: ${str(params.title)}`,
    body: [
      str(params.body),
      `Status: ${str(params.status)}`,
      `Source: ${str(params.source)}`,
    ]
      .filter(Boolean)
      .join("\n"),
  }),

  "abuse.case.resolved": (params, locale) => {
    const t = createTranslator({
      messages: getEmailMessages(locale),
      locale: resolveEmailLocale(locale),
      namespace: "abuse-case-resolved",
    });

    return {
      title: t("title", { reference: str(params.reference) }),
      body: t("body", { reference: str(params.reference) }),
    };
  },

  "abuse.case.customer_replied": (params) => ({
    title: str(params.title),
    body: str(params.body) || "(no message)",
  }),

  /**
   * The reports nobody can be held responsible for.
   *
   * Deliberately not quiet. An address that resolves to no customer is either
   * an allocation we have lost track of or a report about somebody else's
   * range, and both are worth a person's attention.
   */
  "abuse.signal.unattributed": (params) => ({
    title: `Unattributed abuse report: ${str(params.title)}`,
    body: [
      str(params.body),
      `Subject: ${str(params.subject) || "none given"}`,
      `Attribution: ${str(params.attribution)}`,
      `Source: ${str(params.source)}`,
    ]
      .filter(Boolean)
      .join("\n"),
  }),

  "notifications.test": (params) => ({
    title: "Test notification",
    body: `This is a test from the Virtbase notification settings${
      params.target ? `, sent to "${str(params.target)}"` : ""
    }. If you are reading it, routing and credentials for this target work.`,
  }),
};

/**
 * Falls back rather than throwing: an unregistered key means somebody added a
 * dispatch call without its text, and losing the notification entirely is a
 * worse answer than an ugly one.
 */
export const renderNotification = (
  key: string,
  params: NotificationParams,
  locale: string,
): NotificationText => {
  const renderer = NOTIFICATION_TEXT[key];
  if (renderer) return renderer(params, locale);

  // Falls back to whatever the caller passed rather than the bare key: a
  // signal type from an integration nobody has written text for still arrives
  // carrying its own title and body, and those are better than a dotted slug.
  console.warn(`[notifications] No text registered for key "${key}"`);
  return { title: str(params.title) || key, body: str(params.body) };
};
