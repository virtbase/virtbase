/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Calls `fn` for every item with at most `concurrency` calls in flight, and
 * returns one settled result per item, in the order of `items`.
 *
 * A rejection settles only its own item: the remaining items still run. Use it
 * for every fan-out over I/O, so that one unreachable host cannot stop a whole
 * batch.
 *
 * @throws {RangeError} when `concurrency` is not a positive integer.
 */
export const mapSettled = async <T, R>(
  items: readonly T[],
  { concurrency }: { concurrency: number },
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> => {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError(
      `concurrency must be a positive integer, got ${concurrency}`,
    );
  }

  const results = new Array<PromiseSettledResult<R>>(items.length);
  const queue = items.entries();

  const work = async () => {
    for (const [index, item] of queue) {
      try {
        results[index] = { status: "fulfilled", value: await fn(item, index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };

  const workers = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workers }, work));

  return results;
};
