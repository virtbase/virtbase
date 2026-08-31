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

import type { PaymentMethodBackfillCandidate } from "@virtbase/api/backfill";
import {
  backfillPaymentMethods,
  PAYMENT_METHOD_BACKFILL_BATCH_SIZE,
} from "@virtbase/api/backfill";
import { db } from "@virtbase/db/client";

/**
 * Records the cards customers saved before `payment_methods` existed.
 *
 *     bun script backfill-payment-methods                  # dry run, writes nothing
 *     bun script backfill-payment-methods --apply          # writes
 *     bun script backfill-payment-methods --limit=500      # bound the first pass
 *     bun script backfill-payment-methods --after=usr_...  # resume from a user id
 *
 * **Dry run is what you get by forgetting the flag**, and `--apply` is the
 * only thing that turns it off. A dry run still reads from Stripe - the counts
 * it prints are the real ones - and writes nothing.
 *
 * **It enrols nobody in automatic charging.** It writes rows in
 * `payment_methods` and touches neither `auto_renew` nor
 * `mandate_accepted_at`; the opt-in stays a customer action. See the note at
 * the top of `packages/api/src/backfill/payment-methods.ts`.
 *
 * Safe to run twice: a credential already recorded is skipped outright rather
 * than rewritten, so a second run reports everything as skipped and issues no
 * writes. Safe to interrupt too - pass the last user id back as `--after`, or
 * simply run it again from the start, which costs one Stripe listing per
 * customer and changes nothing.
 *
 * Needs `STRIPE_SECRET_KEY`, because it reads the credentials from Stripe.
 */

const flag = (name: string) => process.argv.includes(`--${name}`);

const option = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  return process.argv
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
};

const number = (name: string): number | undefined => {
  const raw = option(name);
  if (undefined === raw) return undefined;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || 1 > parsed) {
    console.error(`--${name} must be a positive whole number, got "${raw}".`);
    process.exit(1);
  }

  return parsed;
};

const describe = (candidate: PaymentMethodBackfillCandidate) =>
  [
    candidate.userId,
    candidate.externalId,
    `(${candidate.type}${candidate.brand ? ` ${candidate.brand}` : ""}${
      candidate.last4 ? ` ****${candidate.last4}` : ""
    })`,
  ].join(" ");

async function main() {
  // `--dry-run` is accepted and does nothing, because it is what somebody will
  // type when they want to be careful, and having it error would push them
  // towards running without it.
  const apply = flag("apply") && !flag("dry-run");
  const verbose = flag("verbose") || !apply;

  if (flag("apply") && flag("dry-run")) {
    console.log("--dry-run wins over --apply. Nothing will be written.\n");
  }

  console.log(
    apply
      ? "Recording the saved credentials Stripe holds and this database does not."
      : "Dry run. Nothing will be written - pass --apply to write.",
  );
  console.log(
    "Credentials already recorded are skipped, never rewritten. Nothing here turns on automatic renewal.\n",
  );

  const result = await backfillPaymentMethods({
    db,
    dryRun: !apply,
    batchSize: number("batch-size") ?? PAYMENT_METHOD_BACKFILL_BATCH_SIZE,
    limit: number("limit"),
    after: option("after") ?? null,
    // One line per batch rather than per customer, so a large customer base
    // does not bury the summary.
    onProgress: ({ scanned, found, created, skipped, failed, cursor }) =>
      console.log(
        `  scanned ${scanned} customer(s), found ${found}, ${
          apply ? "recorded" : "would record"
        } ${created}, skipped ${skipped}, failed ${failed} (at ${cursor})`,
      ),
    onCandidate: verbose
      ? (candidate) => console.log(`  ${describe(candidate)}`)
      : undefined,
    onFailure: ({ userId, stripeCustomerId, error }) =>
      console.warn(
        `  ! ${userId} (${stripeCustomerId}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
  });

  console.log(
    `\n${result.scanned} customer(s) considered, ${result.found} credential(s) at the provider, ${
      apply
        ? `${result.created} recorded`
        : `${result.created} would be recorded`
    }, ${result.skipped} already known, ${result.failed} failed.`,
  );

  if (result.cursor) {
    console.log(`Last user id: ${result.cursor}`);
  }

  if (0 < result.failed) {
    // A run where everything failed is a misconfiguration, not an empty
    // customer base, and it must not read as success.
    console.log(
      "\nSome customers could not be read. Re-running is safe and will retry them.",
    );
  }

  if (!apply && 0 < result.created) {
    console.log("\nRe-run with --apply to write them.");
  }

  process.exit(0);
}

void main();
