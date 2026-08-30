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

import * as Sentry from "@sentry/node";
import { and, asc, eq, isNull, sql } from "@virtbase/db";
import type { db as database } from "@virtbase/db/client";
import type { AbuseCase } from "@virtbase/db/schema";
import { abuseCaseMessages, abuseCases } from "@virtbase/db/schema";
import { dispatchNotification } from "../../notifications/dispatch";
import { caseReference, linkCaseServer, recordCaseEvent } from "../case";
import { resolveSignalSubject } from "../resolve-subject";
import { verifiedAddresses } from "./addresses";
import type { AbuseClassification } from "./classify";
import { classifyAbuseReport, isTriageAvailable } from "./classify";
import { MAX_TRIAGE_BODY_CHARS, TRIAGE_BATCH_SIZE } from "./model";

type Database = typeof database;

export interface ClassifyCaseResult {
  classified: boolean;
  attributedTo: string | null;
  addresses: string[];
  reason: string | null;
}

/**
 * Reads the report on a case and writes down what it says.
 *
 * Everything it changes is advisory: the category and severity an operator
 * would otherwise set by hand, and the customer the address resolves to. It
 * never moves the case out of `triage`, never sets an enforcement, and never
 * writes to the customer - a case still has to be confirmed by a person before
 * any of that happens.
 */
export const classifyAbuseCase = async ({
  db,
  caseId,
}: {
  db: Database;
  caseId: string;
}): Promise<ClassifyCaseResult> => {
  const empty: ClassifyCaseResult = {
    classified: false,
    attributedTo: null,
    addresses: [],
    reason: null,
  };

  const abuseCase = await db
    .select({
      id: abuseCases.id,
      number: abuseCases.number,
      title: abuseCases.title,
      status: abuseCases.status,
      userId: abuseCases.userId,
      category: abuseCases.category,
      severity: abuseCases.severity,
    })
    .from(abuseCases)
    .where(eq(abuseCases.id, caseId))
    .limit(1)
    .then(([first]) => first);

  if (!abuseCase) return { ...empty, reason: "unknown case" };

  // The report as it arrived. The first reporter message is the accusation;
  // anything after it is a follow-up and classifying on the whole thread would
  // let a later "any update?" outweigh the original.
  const report = await db
    .select({
      body: abuseCaseMessages.body,
      createdAt: abuseCaseMessages.createdAt,
    })
    .from(abuseCaseMessages)
    .where(
      and(
        eq(abuseCaseMessages.caseId, caseId),
        eq(abuseCaseMessages.authorKind, "reporter"),
      ),
    )
    .orderBy(asc(abuseCaseMessages.createdAt))
    .limit(1)
    .then(([first]) => first);

  if (!report) {
    await markClassified(db, caseId);
    return { ...empty, reason: "no report to read" };
  }

  const classification = await classifyAbuseReport({
    subject: abuseCase.title,
    body: report.body.slice(0, MAX_TRIAGE_BODY_CHARS),
  });

  if (!classification) {
    // Not marked classified: a gateway outage should be retried, not treated
    // as a case nobody could make sense of.
    return { ...empty, reason: "classifier unavailable" };
  }

  if (!classification.is_abuse_report) {
    await db
      .update(abuseCases)
      .set({ classifiedAt: sql`now()` })
      .where(eq(abuseCases.id, caseId));

    await note({
      db,
      caseId,
      classification,
      addresses: [],
      extra:
        "The classifier does not think this is an abuse report. It has been left in triage for somebody to confirm or reject.",
    });

    await recordCaseEvent({
      db,
      caseId,
      type: "triage.classified",
      actorKind: "system",
      metadata: {
        isAbuseReport: false,
        confidence: classification.confidence,
      },
    });

    return { ...empty, classified: true, reason: "not an abuse report" };
  }

  // The model can only point at an address the reporter actually wrote.
  const addresses = verifiedAddresses(classification, report.body);

  const holders = new Map<string, { serverId: string; stale: boolean }>();
  for (const address of addresses) {
    const subject = await resolveSignalSubject({
      db,
      subject: { kind: "ip", value: address },
      // The report's own date, so an address reallocated since lands on
      // whoever held it then. The same rule the rest of the pipeline follows.
      occurredAt: report.createdAt,
    });

    if (subject.userId && subject.serverId) {
      holders.set(subject.userId, {
        serverId: subject.serverId,
        // A `stale` resolution names a customer as well, and carrying that
        // through is the whole point: whoever holds the address today is
        // somebody else, and the case must not enforce on its own.
        stale: "stale" === subject.attribution,
      });
    }
  }

  const [only] = [...holders.entries()];
  const single = 1 === holders.size && only;
  const stale = Boolean(single && only[1].stale);

  await db
    .update(abuseCases)
    .set({
      classifiedAt: sql`now()`,
      // Only fills the gaps a human has not already filled. An operator who
      // has categorised the case has outranked the model.
      ...("other" === abuseCase.category
        ? { category: classification.category }
        : {}),
      ...("medium" === abuseCase.severity
        ? { severity: classification.severity }
        : {}),
      // Attribution is the useful part, and it is deterministic: the address
      // came from the reporter and the lookup is the allocation table.
      //
      // The staleness comes with it. `enforceCase` refuses to act on a stale
      // attribution, and that guard reads this column - so attributing a case
      // without it would leave a case the model filled in from a reallocated
      // address looking exactly like one nobody had any doubt about, ready for
      // a missed deadline to escalate onto the wrong customer's server.
      ...(single && !abuseCase.userId
        ? { userId: only[0], staleAttribution: stale }
        : {}),
    })
    .where(eq(abuseCases.id, caseId));

  if (single && !abuseCase.userId) {
    await linkCaseServer({ db, caseId, serverId: only[1].serverId });
  }

  await note({
    db,
    caseId,
    classification,
    addresses,
    extra: single
      ? stale
        ? "The address was reallocated after the moment this report describes, so it is filed against whoever held it then. Nothing will be enforced automatically; somebody has to decide."
        : null
      : holders.size > 1
        ? "The addresses in this report belong to more than one customer. Somebody has to decide which case this is."
        : addresses.length > 0
          ? "None of the addresses in this report resolved to a customer at the time it describes."
          : "The report names no address we could verify against its own text.",
  });

  await recordCaseEvent({
    db,
    caseId,
    type: "triage.classified",
    actorKind: "system",
    toValue: classification.category,
    metadata: {
      confidence: classification.confidence,
      severity: classification.severity,
      addresses,
      attributed: Boolean(single && !abuseCase.userId),
      ...(stale ? { staleAttribution: true } : {}),
    },
  });

  if (single && !abuseCase.userId) {
    await dispatchNotification({
      key: "abuse.case.triaged",
      audience: { kind: "operator" },
      severity: "warning",
      groupKey: `abuse:${caseId}`,
      url: `/abuse/${caseId}`,
      params: {
        reference: caseReference(abuseCase.number),
        category: classification.category,
        confidence: classification.confidence,
        addresses: addresses.join(", "),
      },
    }).catch(() => undefined);
  }

  return {
    classified: true,
    // What this call did, not what it resolved: a case that already had a
    // customer was not attributed by us, and the sweep counts attributions.
    attributedTo: single && !abuseCase.userId ? only[0] : null,
    addresses,
    reason: null,
  };
};

/**
 * Writes the classification down where an operator reads it.
 *
 * An internal note rather than the case summary: the summary is what the
 * customer is shown, and a machine's reading of an accusation is not something
 * to put in front of the accused.
 */
const note = async ({
  db,
  caseId,
  classification,
  addresses,
  extra,
}: {
  db: Database;
  caseId: string;
  classification: AbuseClassification;
  addresses: string[];
  extra: string | null;
}): Promise<void> => {
  await db.insert(abuseCaseMessages).values({
    caseId,
    authorKind: "system",
    audience: "internal",
    body: [
      `Assisted triage — ${classification.confidence}% confidence`,
      "",
      classification.is_abuse_report
        ? `Category: ${classification.category.replace(/_/g, " ")} · severity: ${classification.severity}`
        : "Not an abuse report.",
      addresses.length > 0 ? `Addresses named: ${addresses.join(", ")}` : null,
      "",
      classification.reasoning,
      extra ? `\n${extra}` : null,
      "",
      "Advisory only. Nothing here has changed the case beyond its category, its severity and who it is filed against.",
    ]
      .filter((line) => null !== line)
      .join("\n"),
  });
};

const markClassified = (db: Database, caseId: string) =>
  db
    .update(abuseCases)
    .set({ classifiedAt: sql`now()` })
    .where(eq(abuseCases.id, caseId));

export interface TriageSweepResult {
  looked: number;
  classified: number;
  attributed: number;
}

/**
 * Classifies the cases nobody has looked at yet.
 *
 * A sweep rather than a step in the webhook: a model call is slow and costs
 * money, and the inbound webhook's job is to store the message before Resend
 * gives up on it. Batched so the spend per run is a number somebody chose.
 */
export const sweepUntriagedCases = async ({
  db,
  limit = TRIAGE_BATCH_SIZE,
}: {
  db: Database;
  limit?: number;
}): Promise<TriageSweepResult> => {
  const result: TriageSweepResult = {
    looked: 0,
    classified: 0,
    attributed: 0,
  };

  if (!isTriageAvailable()) return result;

  const candidates = await db
    .select({ id: abuseCases.id })
    .from(abuseCases)
    .where(
      and(eq(abuseCases.status, "triage"), isNull(abuseCases.classifiedAt)),
    )
    .orderBy(asc(abuseCases.createdAt))
    .limit(limit);

  result.looked = candidates.length;

  for (const candidate of candidates) {
    try {
      const outcome = await classifyAbuseCase({ db, caseId: candidate.id });
      if (outcome.classified) result.classified += 1;
      if (outcome.attributedTo) result.attributed += 1;
    } catch (error) {
      Sentry.captureException(error, {
        tags: { "abuse.triage": candidate.id },
      });
    }
  }

  return result;
};

export type { AbuseCase };
