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

import { generateObject } from "ai";
import { verifiedAddresses } from "../addresses";
import { AbuseClassificationSchema } from "../classify";
import { ABUSE_TRIAGE_MODEL, TRIAGE_TIMEOUT_MS } from "../model";
import { buildTriageSystemPrompt } from "../system-prompt";
import type { TriageEvalCase } from "./cases";
import { evaluateCase, TRIAGE_EVAL_CASES } from "./cases";

/**
 * Measures report triage against a fixed set of reports.
 *
 * Exists because "the classifier is good enough" needs a number that can move.
 * It reports three:
 *
 * - **schema-valid** - the answer parsed, so the model understood the shape.
 * - **matched** - the answer was also right: the category, the severity band
 *   and the addresses. This is the one worth optimising.
 * - **hallucinated** - the model named an address that is not in the report.
 *   Should always be zero, and is the reason `verifiedAddresses` exists: the
 *   count here is of what the guard caught, not of what reached a case.
 *
 * Costs real money - one model call per case. Run it deliberately:
 *
 * ```
 * bun --env-file .env packages/api/src/abuse/triage/eval/run.ts
 * bun --env-file .env packages/api/src/abuse/triage/eval/run.ts --model openai/gpt-5
 * ```
 */
const modelArg = process.argv.indexOf("--model");
const MODEL = -1 === modelArg ? ABUSE_TRIAGE_MODEL : process.argv[modelArg + 1];

interface CaseResult {
  name: string;
  schemaValid: boolean;
  matched: boolean;
  hallucinated: number;
  confidence: number;
  durationMs: number;
  notes: string[];
}

const run = async (testCase: TriageEvalCase): Promise<CaseResult> => {
  const startedAt = Date.now();

  try {
    const result = await generateObject({
      model: MODEL as string,
      system: buildTriageSystemPrompt(),
      prompt: `Subject: ${testCase.subject}\n\n${testCase.body}`,
      schema: AbuseClassificationSchema,
      schemaName: "abuse_classification",
      schemaDescription:
        "What an abuse report is about, and which addresses it names.",
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(TRIAGE_TIMEOUT_MS),
    });

    const verified = verifiedAddresses(result.object, testCase.body);
    const outcome = evaluateCase(testCase, result.object, verified);

    return {
      name: testCase.name,
      schemaValid: true,
      matched: outcome.matched,
      // Anything the model named that the guard could not find in the report.
      hallucinated: result.object.addresses.length - verified.length,
      confidence: result.object.confidence,
      durationMs: Date.now() - startedAt,
      notes: outcome.notes,
    };
  } catch (error) {
    return {
      name: testCase.name,
      schemaValid: false,
      matched: false,
      hallucinated: 0,
      confidence: 0,
      durationMs: Date.now() - startedAt,
      notes: [error instanceof Error ? error.message : String(error)],
    };
  }
};

const results: CaseResult[] = [];

for (const testCase of TRIAGE_EVAL_CASES) {
  const result = await run(testCase);
  results.push(result);

  const mark = result.matched ? "PASS" : result.schemaValid ? "FAIL" : "ERR ";
  console.log(
    `${mark}  ${result.name.padEnd(42)} ${String(result.durationMs).padStart(6)}ms  ${
      result.notes.join("; ") || ""
    }`,
  );
}

const total = results.length;
const valid = results.filter((result) => result.schemaValid).length;
const matched = results.filter((result) => result.matched).length;
const hallucinated = results.reduce(
  (sum, result) => sum + result.hallucinated,
  0,
);

console.log("");
console.log(`model          ${MODEL}`);
console.log(`schema-valid   ${valid}/${total}`);
console.log(`matched        ${matched}/${total}`);
console.log(`hallucinated   ${hallucinated} address(es), all discarded`);

// A non-zero exit so this can gate a change to the prompt or the model.
if (matched < total) process.exitCode = 1;
