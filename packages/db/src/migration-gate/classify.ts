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
 * What a migration can do to rows that already exist:
 *
 * - `moves-data`: a statement other than `CREATE`, `ALTER`, `DROP` or
 *   `COMMENT`, such as `INSERT`, `UPDATE`, `DELETE`, `WITH`, `MERGE`,
 *   `TRUNCATE`, `COPY` or a `DO` block;
 * - `rewrites-rows`: an `ALTER … TYPE … USING`, which converts every value;
 * - `constrains-rows`: DDL that fails on rows breaking it: `SET NOT NULL`, a
 *   `NOT NULL` column added without a default, an added `UNIQUE`, `CHECK`,
 *   `FOREIGN KEY` or `PRIMARY KEY` constraint, or a unique index.
 */
export type MigrationRisk = "constrains-rows" | "moves-data" | "rewrites-rows";

const SCHEMA_STATEMENT = /^(?:create|alter|drop|comment)\b/i;
const TYPE_CHANGE_WITH_USING = /^alter\b[\s\S]*\btype\b[\s\S]*\busing\b/i;
const CONSTRAINS_ROWS = [
  /\bset\s+not\s+null\b/i,
  /\badd\s+column\b(?![\s\S]*\bdefault\b)[\s\S]*\bnot\s+null\b/i,
  /\badd\s+constraint\b[\s\S]*\b(?:unique|check|foreign\s+key|primary\s+key)\b/i,
  /^create\s+unique\s+index\b/i,
];

/** Every risk a migration's SQL carries, sorted. Empty for plain DDL. */
export const classifyMigration = (sql: string): MigrationRisk[] => {
  const risks = new Set<MigrationRisk>();
  for (const statement of splitStatements(sql)) {
    if (!SCHEMA_STATEMENT.test(statement)) {
      risks.add("moves-data");
      continue;
    }
    if (TYPE_CHANGE_WITH_USING.test(statement)) risks.add("rewrites-rows");
    if (CONSTRAINS_ROWS.some((pattern) => pattern.test(statement))) {
      risks.add("constrains-rows");
    }
  }
  return [...risks].sort();
};

const DOLLAR_QUOTE = /^\$[A-Za-z_]*\$/;

/**
 * Splits SQL into its statements, without comments. A semicolon inside a
 * comment, a quoted string or identifier, or a dollar-quoted body such as a
 * `DO $$ … $$` block does not end a statement.
 */
export const splitStatements = (sql: string): string[] => {
  const statements: string[] = [];
  let current = "";
  let index = 0;
  while (index < sql.length) {
    const rest = sql.slice(index);
    const character = sql.charAt(index);
    if (rest.startsWith("--")) {
      const end = sql.indexOf("\n", index);
      index = end === -1 ? sql.length : end;
    } else if (rest.startsWith("/*")) {
      const end = sql.indexOf("*/", index + 2);
      index = end === -1 ? sql.length : end + 2;
    } else if (DOLLAR_QUOTE.test(rest)) {
      const tag = DOLLAR_QUOTE.exec(rest)?.[0] ?? "$$";
      const end = sql.indexOf(tag, index + tag.length);
      const stop = end === -1 ? sql.length : end + tag.length;
      current += sql.slice(index, stop);
      index = stop;
    } else if (character === "'" || character === '"') {
      const stop = findClosingQuote(sql, index);
      current += sql.slice(index, stop);
      index = stop;
    } else if (character === ";") {
      statements.push(current.trim());
      current = "";
      index++;
    } else {
      current += character;
      index++;
    }
  }
  statements.push(current.trim());
  return statements.filter((statement) => statement.length > 0);
};

/** The index after the quote that closes the one at `start`; a doubled quote escapes. */
const findClosingQuote = (sql: string, start: number): number => {
  const quote = sql.charAt(start);
  let index = start + 1;
  while (index < sql.length) {
    if (sql.charAt(index) === quote) {
      if (sql.charAt(index + 1) !== quote) return index + 1;
      index += 2;
    } else {
      index++;
    }
  }
  return sql.length;
};
