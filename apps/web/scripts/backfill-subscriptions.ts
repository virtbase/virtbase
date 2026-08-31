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

import type { BackfillCandidate } from "@virtbase/api/backfill";
import {
  BACKFILL_BATCH_SIZE,
  backfillSubscriptions,
} from "@virtbase/api/backfill";
import { db } from "@virtbase/db/client";

/**
 * Opens a subscription for every server that predates subscriptions.
 *
 *     bun script backfill-subscriptions                 # dry run, writes nothing
 *     bun script backfill-subscriptions --apply         # writes
 *     bun script backfill-subscriptions --limit=500     # bound the first pass
 *     bun script backfill-subscriptions --after=kvm_... # resume from an id
 *
 * **Dry run is what you get by forgetting the flag**, and `--apply` is the
 * only thing that turns it off. This writes one row per server in the fleet
 * and there is no undo that can tell its rows apart from anyone else's.
 *
 * **It cannot enrol anybody in automatic charging.** Every row is written with
 * `auto_renew: false` and `mandate_accepted_at: null`, there is no flag or
 * environment variable that changes that, and adding one would be wrong -
 * see the note at the top of `packages/api/src/backfill/subscriptions.ts`.
 *
 * Safe to run twice, and safe to interrupt: the servers it has already done no
 * longer match, so a second run picks up exactly where the first stopped.
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

const describe = (candidate: BackfillCandidate) =>
  [
    candidate.serverId,
    candidate.currentPeriodStart.toISOString(),
    "->",
    candidate.currentPeriodEnd.toISOString(),
    `(${candidate.serverName})`,
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
      ? "Writing subscriptions for servers that have none."
      : "Dry run. Nothing will be written - pass --apply to write.",
  );
  console.log(
    "Every row: auto_renew=false, mandate_accepted_at=null. Always.\n",
  );

  const result = await backfillSubscriptions({
    db,
    dryRun: !apply,
    batchSize: number("batch-size") ?? BACKFILL_BATCH_SIZE,
    limit: number("limit"),
    after: option("after") ?? null,
    // One line per batch rather than per row, so a fleet of thousands does not
    // bury the summary.
    onProgress: ({ scanned, created, skipped, cursor }) =>
      console.log(
        `  scanned ${scanned}, ${apply ? "created" : "would create"} ${created}, skipped ${skipped} (at ${cursor})`,
      ),
    onCandidate: verbose
      ? (candidate) => console.log(`  ${describe(candidate)}`)
      : undefined,
  });

  console.log(
    `\n${result.scanned} server(s) considered, ${
      apply ? `${result.created} created` : `${result.created} would be created`
    }, ${result.skipped} skipped.`,
  );

  if (result.cursor) {
    console.log(`Last server id: ${result.cursor}`);
  }

  if (!apply && 0 < result.created) {
    console.log("\nRe-run with --apply to write them.");
  }

  process.exit(0);
}

void main();
