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

import type {
  PlatformMetricsReader,
  PlatformMetricsSnapshot,
} from "@virtbase/ports";
import type { MetricsReader } from "./read-platform-metrics";
import { readPlatformMetrics } from "./read-platform-metrics";

/**
 * The options every platform metrics read opens its transaction with.
 *
 * DB-19 (`docs/style/data.md`) prescribes `read committed`, which takes a new
 * snapshot for every statement: the queries of {@link readPlatformMetrics}
 * would then count rows that changed between them, and the counts would
 * disagree. `repeatable read` makes every statement see the snapshot of the
 * first one, and `read only` makes Postgres reject a write inside it.
 */
export const PLATFORM_METRICS_TRANSACTION = {
  accessMode: "read only",
  isolationLevel: "repeatable read",
} as const;

/** Runs `read` in a transaction its caller has opened. */
export type ReadOnlyTransaction = <T>(
  read: (tx: MetricsReader) => Promise<T>,
) => Promise<T>;

/** The part of a database client {@link createDbPlatformMetrics} uses. */
export interface PlatformMetricsDatabase {
  transaction<T>(
    read: (tx: MetricsReader) => Promise<T>,
    options: typeof PLATFORM_METRICS_TRANSACTION,
  ): Promise<T>;
}

/**
 * The `platformMetrics` port, which core provides to a metrics exporter
 * (ADR 0010): {@link readPlatformMetrics} inside one transaction.
 * {@link createDbPlatformMetrics} builds it with the transaction options the
 * read requires.
 */
export class DbPlatformMetrics implements PlatformMetricsReader {
  private readonly transaction: ReadOnlyTransaction;
  private readonly now: () => Date;

  constructor({
    transaction,
    now = () => new Date(),
  }: {
    transaction: ReadOnlyTransaction;
    now?: () => Date;
  }) {
    this.transaction = transaction;
    this.now = now;
  }

  read(): Promise<PlatformMetricsSnapshot> {
    const readAt = this.now();
    return this.transaction((tx) => readPlatformMetrics(tx, readAt));
  }
}

/**
 * A {@link DbPlatformMetrics} whose every read runs in a transaction on `db`
 * opened with {@link PLATFORM_METRICS_TRANSACTION}.
 */
export const createDbPlatformMetrics = ({
  db,
  now,
}: {
  db: PlatformMetricsDatabase;
  now?: () => Date;
}): DbPlatformMetrics =>
  new DbPlatformMetrics({
    transaction: (read) => db.transaction(read, PLATFORM_METRICS_TRANSACTION),
    now,
  });
