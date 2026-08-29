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

import type { AbuseClassification } from "../classify";

export interface TriageEvalCase {
  name: string;
  subject: string;
  body: string;
  /** The report is about one of ours, or it is not a report at all. */
  expectReport: boolean;
  expectCategory?: AbuseClassification["category"];
  /** Every one of these must be returned. */
  expectAddresses?: string[];
  /** None of these may be returned - usually the reporter or the victim. */
  rejectAddresses?: string[];
  /** Inclusive bounds, because severity is a judgement and not a fact. */
  expectSeverity?: AbuseClassification["severity"][];
}

/**
 * Reports the classifier has to get right.
 *
 * Written from the shapes an abuse desk actually receives: a templated
 * complaint from another provider, a CERT notice with a log excerpt, a DMCA
 * notice, a defanged indicator list, and the mail that is not a report at all.
 *
 * The addresses are documentation ranges throughout, so running the eval never
 * points a real investigation at somebody.
 */
export const TRIAGE_EVAL_CASES: TriageEvalCase[] = [
  {
    name: "spam complaint with a sample",
    subject: "Spam originating from 45.83.100.10",
    body: `Hello,

Our mail infrastructure received 4,182 messages from 45.83.100.10 between
09:12 and 09:24 UTC today. All were rejected. A sample header follows.

Received: from mail.example-customer.net (45.83.100.10)
  by mx1.example.org with ESMTP id 8812af

Please take action.
--
Postmaster, example.org`,
    expectReport: true,
    expectCategory: "spam",
    expectAddresses: ["45.83.100.10"],
    expectSeverity: ["medium", "high"],
  },
  {
    name: "SSH brute force, reporter names their own honeypot",
    subject: "SSH brute force from your network",
    body: `Our honeypot at 198.51.100.20 recorded 12,431 SSH authentication
attempts from 45.83.100.11 between 02:00 and 04:00 UTC.

2026-08-28T02:14:11Z sshd[441]: Failed password for root from 45.83.100.11
2026-08-28T02:14:13Z sshd[442]: Failed password for admin from 45.83.100.11`,
    expectReport: true,
    expectAddresses: ["45.83.100.11"],
    // The honeypot is the target. Filing the case against the reporter is the
    // most expensive mistake this classifier can make.
    rejectAddresses: ["198.51.100.20"],
  },
  {
    name: "port scan report",
    subject: "Portscan detected",
    body: `Automated notice.

Source: 45.83.100.12
Destination: our /24 at 198.51.100.0/24
Ports touched: 22, 23, 80, 443, 3389, 5900 and 1,204 others
Window: 2026-08-28 05:00-05:06 UTC`,
    expectReport: true,
    expectCategory: "port_scan",
    expectAddresses: ["45.83.100.12"],
    expectSeverity: ["low", "medium"],
  },
  {
    name: "DMCA notice",
    subject: "DMCA Takedown Notice - Ref 2026-88213",
    body: `I am the authorised agent for the rights holder.

The work "Example Feature Film (2025)" is being made available without
licence at http://45.83.100.13/dl/example.mkv .

I have a good faith belief that the use is not authorised. I swear, under
penalty of perjury, that this information is accurate.`,
    expectReport: true,
    expectCategory: "copyright",
    expectAddresses: ["45.83.100.13"],
    expectSeverity: ["low", "medium", "high"],
  },
  {
    name: "phishing page hosted",
    subject: "Phishing site on your network",
    body: `A page imitating our online banking login is being served from
45.83.100.14 at /secure/login.html. Screenshots attached. We have notified
our customers and would like this removed urgently.`,
    expectReport: true,
    expectCategory: "phishing",
    expectAddresses: ["45.83.100.14"],
    expectSeverity: ["high", "critical"],
  },
  {
    name: "defanged indicators from a CERT",
    subject: "[CERT] Compromised host in AS-EXAMPLE",
    body: `Indicators (defanged):

  45.83.100[.]15  - C2 beacon, observed 2026-08-27 and 2026-08-28
  hxxp://45.83.100[.]15/gate.php

The host appears compromised rather than malicious by intent.`,
    expectReport: true,
    expectAddresses: ["45.83.100.15"],
    expectSeverity: ["high", "critical"],
  },
  {
    name: "sustained flood",
    subject: "URGENT: DDoS from 45.83.100.16",
    body: `We are receiving 40 Gbit/s of UDP reflection traffic sourced from
45.83.100.16 and it is affecting our transit. This started 20 minutes ago
and is ongoing. Please null-route or shut the host down.`,
    expectReport: true,
    expectCategory: "ddos",
    expectAddresses: ["45.83.100.16"],
    expectSeverity: ["critical"],
  },
  {
    name: "not a report: sales enquiry",
    subject: "Partnership opportunity",
    body: `Hi there,

I lead partnerships at ExampleCloud and would love to explore a reseller
agreement. Do you have 20 minutes next week?`,
    expectReport: false,
  },
  {
    name: "not a report: delivery failure",
    subject: "Undelivered Mail Returned to Sender",
    body: `This is the mail system at host mx1.example.org.

I'm sorry to have to inform you that your message could not be delivered.

<somebody@example.org>: host mx.example.org said: 550 5.1.1 User unknown`,
    expectReport: false,
  },
  {
    name: "not a report: vague complaint with no address",
    subject: "your servers are attacking us",
    body: `Someone on your network is doing something to our systems. Sort it
out or we will contact your upstream.`,
    // Real enough to be a report, but it names nothing to act on. An empty
    // address list is the correct answer, not a guess.
    expectReport: true,
    expectAddresses: [],
  },
];

export interface CaseOutcome {
  matched: boolean;
  notes: string[];
}

/** Whether one classification satisfies the case, and what it got wrong. */
export const evaluateCase = (
  testCase: TriageEvalCase,
  classification: AbuseClassification,
  verified: string[],
): CaseOutcome => {
  const notes: string[] = [];

  if (classification.is_abuse_report !== testCase.expectReport) {
    notes.push(
      `is_abuse_report ${classification.is_abuse_report}, expected ${testCase.expectReport}`,
    );
  }

  if (testCase.expectReport) {
    if (
      testCase.expectCategory &&
      classification.category !== testCase.expectCategory
    ) {
      notes.push(
        `category ${classification.category}, expected ${testCase.expectCategory}`,
      );
    }

    if (
      testCase.expectSeverity &&
      !testCase.expectSeverity.includes(classification.severity)
    ) {
      notes.push(
        `severity ${classification.severity}, expected one of ${testCase.expectSeverity.join("/")}`,
      );
    }

    for (const address of testCase.expectAddresses ?? []) {
      if (!verified.includes(address)) notes.push(`missing ${address}`);
    }

    if (testCase.expectAddresses?.length === 0 && verified.length > 0) {
      notes.push(`invented ${verified.join(", ")}`);
    }

    for (const address of testCase.rejectAddresses ?? []) {
      if (verified.includes(address)) {
        notes.push(`returned ${address}, which is not the offender`);
      }
    }
  }

  return { matched: 0 === notes.length, notes };
};
