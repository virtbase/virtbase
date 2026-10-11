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
import type { EnvRead } from "./reads";

/**
 * The bootstrap variables of
 * `docs/architecture/env-inventory.md#bootstrap-allowlist`. Any file may read
 * them. `policy.test.ts` fails when this list and the document differ.
 */
export const BOOTSTRAP = [
  "DATABASE_URL",
  "CONFIG_ENCRYPTION_KEY",
  "BETTER_AUTH_SECRET",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "CRON_SECRET",
  "NEXT_PUBLIC_APP_DOMAIN",
  "NEXT_PUBLIC_VERCEL_ENV",
  "NODE_ENV",
  "NEXT_PUBLIC_SENTRY_DSN",
  "NEXT_PUBLIC_SENTRY_CSP_REPORT_URI",
  "SENTRY_ORG",
  "SENTRY_PROJECT",
  "SENTRY_URL",
  "SENTRY_AUTH_TOKEN",
  "VERCEL_URL",
  "VERCEL_GIT_COMMIT_REF",
  "VERCEL_GIT_PREVIOUS_SHA",
  "NEXT_RUNTIME",
  "PORT",
  "NODE_EXTRA_CA_CERTS",
] as const;

/** The test and CI variables of the allowlist; `E2E_` is a prefix. */
export const TEST_AND_CI = [
  "CI",
  "VERCEL_AUTOMATION_BYPASS_SECRET",
  "PATH",
] as const;

/** The social-login variables ADR 0014 keeps in the environment. */
export const SOCIAL_LOGIN = [
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
] as const;

/** Variables allowed only in the files under one directory. */
export const SCOPED: Readonly<Record<string, string>> = {
  NOVNC_PROXY_SECRET: "apps/novnc-proxy/",
};

const ALLOWED = new Set<string>([
  ...BOOTSTRAP,
  ...TEST_AND_CI,
  ...SOCIAL_LOGIN,
]);

/** Whether the allowlist permits `read`, wherever it is. */
export const isAllowed = ({ path, variable }: EnvRead): boolean =>
  ALLOWED.has(variable) ||
  variable.startsWith("E2E_") ||
  (SCOPED[variable] !== undefined && path.startsWith(SCOPED[variable]));

/**
 * The reads outside the allowlist that existed when the gate started, as
 * `{ path: [variable, …] }`. `--prune` removes entries and no command adds
 * one; an addition is a hand edit whose reason its PR gives.
 */
export const BaselineSchema = z.record(z.string(), z.array(z.string()));

/** The parsed `baseline.json`. */
export type Baseline = z.output<typeof BaselineSchema>;

/** The gate's verdict on the reads of the repository. */
export interface Verdict {
  /** Reads neither the allowlist nor the baseline permits. */
  added: EnvRead[];
  /** Baseline entries no file reads any more, or that the allowlist now covers. */
  stale: { path: string; variable: string }[];
}

/**
 * Compares the repository's reads with the allowlist and the baseline.
 *
 * A read is permitted when the allowlist allows it, or when the baseline lists
 * its variable for its file. A baseline entry is stale when its file no longer
 * reads its variable outside the allowlist.
 */
export const evaluateReads = ({
  reads,
  baseline,
}: {
  reads: EnvRead[];
  baseline: Baseline;
}): Verdict => {
  const unlisted = reads.filter((read) => !isAllowed(read));
  const added = unlisted.filter(
    (read) => !baseline[read.path]?.includes(read.variable),
  );
  const present = new Set(unlisted.map(toEntryKey));
  const stale = Object.entries(baseline).flatMap(([path, variables]) =>
    variables
      .filter((variable) => !present.has(toEntryKey({ path, variable })))
      .map((variable) => ({ path, variable })),
  );
  return { added, stale };
};

/** The baseline without `stale`, with paths and variables sorted. */
export const pruneBaseline = (
  baseline: Baseline,
  stale: Verdict["stale"],
): Baseline => {
  const removed = new Set(stale.map(toEntryKey));
  return Object.fromEntries(
    Object.entries(baseline)
      .map(([path, variables]): [string, string[]] => [
        path,
        variables
          .filter((variable) => !removed.has(toEntryKey({ path, variable })))
          .sort(),
      ])
      .filter(([, variables]) => variables.length > 0)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
};

const toEntryKey = ({ path, variable }: { path: string; variable: string }) =>
  `${path}\u0000${variable}`;
