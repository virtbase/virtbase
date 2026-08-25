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

/**
 * Eight levels of block, drawn from the bottom up.
 *
 * A picture would be better and is not available: rendering one means a chart
 * library, a rasteriser and an upload, none of which fit inside an
 * interaction's three seconds. In a monospace code block these read as a chart
 * well enough to answer the question anyone actually asks a graph — is it
 * climbing, and is it near the top.
 */
const BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

/** Rendered when a bucket has no samples, so gaps stay visible as gaps. */
const EMPTY = " ";

export interface SparklineOptions {
  /** Characters wide. Samples are averaged into this many buckets. */
  width?: number;
  /**
   * Upper bound of the scale. Omitted, the series scales to its own maximum,
   * which exaggerates noise on an idle server — pass the real ceiling
   * (1 for a ratio, total bytes for memory) whenever there is one.
   */
  max?: number;
}

/**
 * Averages `values` into `width` buckets and draws them as blocks.
 *
 * Averaging rather than sampling: a server that spiked once in an hour should
 * not be able to hide between two sampled points, and should not look like it
 * spiked for the whole bucket either.
 */
export const sparkline = (
  values: readonly number[],
  { width = 32, max }: SparklineOptions = {},
): string => {
  if (values.length === 0) return "";

  const buckets: number[][] = Array.from({ length: width }, () => []);
  for (const [index, value] of values.entries()) {
    const bucket = Math.min(
      width - 1,
      Math.floor((index / values.length) * width),
    );
    buckets[bucket]?.push(value);
  }

  const averages = buckets.map((bucket) =>
    bucket.length === 0
      ? null
      : bucket.reduce((sum, value) => sum + value, 0) / bucket.length,
  );

  const ceiling =
    max ??
    averages.reduce<number>(
      (highest, value) => (value === null ? highest : Math.max(highest, value)),
      0,
    );

  // A flat-zero series has no shape to draw; the floor block says "nothing
  // happened", which is the truth, where an empty string would say "no data".
  if (ceiling <= 0) {
    return averages
      .map((value) => (value === null ? EMPTY : BLOCKS[0]))
      .join("");
  }

  return averages
    .map((value) => {
      if (value === null) return EMPTY;

      const level = Math.round((value / ceiling) * (BLOCKS.length - 1));
      return BLOCKS[Math.max(0, Math.min(BLOCKS.length - 1, level))];
    })
    .join("");
};

export interface SeriesSummary {
  min: number;
  max: number;
  avg: number;
  last: number;
}

/** The four numbers worth printing under a sparkline. */
export const summarize = (values: readonly number[]): SeriesSummary => {
  if (values.length === 0) return { min: 0, max: 0, avg: 0, last: 0 };

  return {
    min: Math.min(...values),
    max: Math.max(...values),
    avg: values.reduce((sum, value) => sum + value, 0) / values.length,
    last: values[values.length - 1] as number,
  };
};
