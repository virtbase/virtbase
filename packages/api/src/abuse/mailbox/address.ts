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

import { createHmac, timingSafeEqual } from "node:crypto";

/** The local part every abuse address starts with. */
export const ABUSE_MAILBOX_LOCAL = "abuse";

/**
 * The domain abuse mail is received on.
 *
 * Separate from the sending domain: Resend receives on a domain configured for
 * inbound, and outbound goes from the usual sender with this as `Reply-To`.
 */
export const abuseMailboxDomain = (): string =>
  process.env.ABUSE_MAILBOX_DOMAIN ??
  process.env.NEXT_PUBLIC_APP_DOMAIN ??
  "virtbase.com";

/**
 * The secret the address tag is signed with.
 *
 * Falls back to the config bootstrap key, which every deployment that can read
 * a secret already has. Without either, addresses cannot be verified and the
 * mailbox refuses to route by tag - the other steps of the chain still work.
 */
const signingSecret = (): string | null =>
  process.env.ABUSE_MAILBOX_SECRET ?? process.env.CONFIG_ENCRYPTION_KEY ?? null;

/** Six characters is 24 bits: too many to guess, short enough to read aloud. */
const TAG_LENGTH = 6;

const tagFor = (caseNumber: number, secret: string): string =>
  createHmac("sha256", secret)
    .update(`abuse-case:${caseNumber}`)
    .digest("hex")
    .slice(0, TAG_LENGTH);

/**
 * The address a case corresponds on: `abuse+<number>.<tag>@<domain>`.
 *
 * The tag is not decoration. Without it the address is `abuse+1043@` and
 * anyone who can count could post into another customer's case by emailing it.
 *
 * Returns `null` when no signing secret is configured, and the caller leaves
 * `mailbox_address` unset rather than minting something unverifiable.
 */
export const mintCaseAddress = (caseNumber: number): string | null => {
  const secret = signingSecret();
  if (!secret) return null;

  return `${ABUSE_MAILBOX_LOCAL}+${caseNumber}.${tagFor(caseNumber, secret)}@${abuseMailboxDomain()}`;
};

/**
 * The case number an address refers to, if the tag verifies.
 *
 * `null` for the bare `abuse@` address, for a wrong tag, and for anything
 * addressed elsewhere. The caller treats all three the same way: fall through
 * to the next step of the routing chain rather than guessing.
 */
export const parseCaseAddress = (address: string): number | null => {
  const secret = signingSecret();
  if (!secret) return null;

  const local = address.trim().toLowerCase().split("@")[0];
  if (!local) return null;

  const [prefix, tagged] = local.split("+");
  if (ABUSE_MAILBOX_LOCAL !== prefix || !tagged) return null;

  const [numberPart, tag] = tagged.split(".");
  if (!numberPart || !tag) return null;

  const caseNumber = Number.parseInt(numberPart, 10);
  if (!Number.isSafeInteger(caseNumber) || caseNumber <= 0) return null;

  const expected = tagFor(caseNumber, secret);
  const provided = Buffer.from(tag, "utf8");
  const wanted = Buffer.from(expected, "utf8");

  if (provided.length !== wanted.length) return null;
  if (!timingSafeEqual(provided, wanted)) return null;

  return caseNumber;
};

/**
 * The bare desk address, `abuse@<domain>`.
 *
 * What a case falls back to when it has no tag of its own, and the identity
 * everything the desk sends goes out as. Derived from `abuseMailboxDomain()`
 * rather than declared next to the other senders in `@virtbase/email`, because
 * the domain is configuration and the two must not be able to disagree.
 */
export const bareAbuseAddress = (): string =>
  `${ABUSE_MAILBOX_LOCAL}@${abuseMailboxDomain()}`;

/** Whether an address is the bare inbox anyone may write to. */
export const isBareAbuseAddress = (address: string): boolean => {
  const local = address.trim().toLowerCase().split("@")[0];
  return ABUSE_MAILBOX_LOCAL === local;
};

/** `[AB-1042]`, so a reply threads even when plus-addressing is stripped. */
export const subjectToken = (caseNumber: number): string =>
  `[AB-${caseNumber}]`;

/** The case number quoted in a subject line, if there is one. */
export const parseSubjectToken = (subject: string): number | null => {
  const match = /\[AB-(\d{1,9})\]/i.exec(subject);
  if (!match?.[1]) return null;

  const caseNumber = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(caseNumber) && caseNumber > 0 ? caseNumber : null;
};
