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

import { GenerateServerFirewallRuleOutputSchema } from "@virtbase/validators/server";
import { generateObject } from "ai";
import {
  FIREWALL_AI_MODEL,
  GENERATION_TIMEOUT_MS,
  repairGeneratedText,
} from "../../router/servers/firewall/generation";
import { buildGenerationContext } from "../build-context";
import { buildSystemPrompt } from "../system-prompt";
import type { EvalCase } from "./cases";
import { defaultServer, EVAL_CASES, matchesExpectation } from "./cases";

/**
 * Measures rule generation against a fixed set of prompts.
 *
 * Exists because "increase the success rate" needs a number that can move.
 * It reports two:
 *
 * - **schema-valid** - the answer parsed on the first attempt, with no retry.
 *   This measures syntax, and was the visible failure with the old 3B model.
 * - **matched** - the answer was also *right*: it contains the rules the case
 *   expects, or correctly returns none. This is the one worth optimising, and
 *   the one a model can fail while producing perfectly valid JSON.
 *
 * Costs real money - one model call per case. Run it deliberately:
 *
 * ```
 * bun --env-file .env packages/api/src/firewall-ai/eval/run.ts
 * bun --env-file .env packages/api/src/firewall-ai/eval/run.ts --model openai/gpt-5
 * ```
 */
const modelArg = process.argv.indexOf("--model");
const MODEL = modelArg === -1 ? FIREWALL_AI_MODEL : process.argv[modelArg + 1];

interface CaseResult {
  name: string;
  schemaValid: boolean;
  matched: boolean;
  ruleCount: number;
  durationMs: number;
  note: string;
}

const evaluate = (
  testCase: EvalCase,
  rules: { direction?: string; action?: string }[],
): { matched: boolean; note: string } => {
  if (testCase.expectEmpty) {
    return rules.length === 0
      ? { matched: true, note: "" }
      : { matched: false, note: `expected no rules, got ${rules.length}` };
  }

  if (testCase.maxRules && rules.length > testCase.maxRules) {
    return {
      matched: false,
      note: `${rules.length} rules, expected at most ${testCase.maxRules}`,
    };
  }

  const missing = (testCase.expect ?? []).filter(
    (expected) =>
      !rules.some((rule) => matchesExpectation(rule as never, expected)),
  );

  return missing.length === 0
    ? { matched: true, note: "" }
    : { matched: false, note: `missing ${JSON.stringify(missing)}` };
};

const runCase = async (testCase: EvalCase): Promise<CaseResult> => {
  const context = buildGenerationContext(defaultServer(testCase.server));
  const started = Date.now();

  let attempts = 0;

  try {
    const result = await generateObject({
      model: MODEL as string,
      system: buildSystemPrompt(testCase.locale),
      prompt: [`Server:\n${context}`, "", `Request: ${testCase.prompt}`].join(
        "\n",
      ),
      schema: GenerateServerFirewallRuleOutputSchema,
      schemaName: "annotated_rules",
      repairText: async ({ text }) => {
        // Reached only when the first parse failed.
        attempts += 1;
        return repairGeneratedText(text);
      },
      maxRetries: 2,
      abortSignal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
    });

    const { matched, note } = evaluate(testCase, result.object.rules);

    return {
      name: testCase.name,
      schemaValid: attempts === 0,
      matched,
      ruleCount: result.object.rules.length,
      durationMs: Date.now() - started,
      note,
    };
  } catch (error) {
    return {
      name: testCase.name,
      schemaValid: false,
      matched: false,
      ruleCount: 0,
      durationMs: Date.now() - started,
      note: error instanceof Error ? error.message.slice(0, 120) : "failed",
    };
  }
};

const main = async () => {
  if (!process.env.AI_GATEWAY_API_KEY) {
    console.error(
      "AI_GATEWAY_API_KEY is not set. Run with: bun --env-file .env <this file>",
    );
    process.exit(1);
  }

  console.log(`model: ${MODEL}`);
  console.log(`cases: ${EVAL_CASES.length}\n`);

  const results: CaseResult[] = [];

  // Sequential, to stay well inside any provider rate limit.
  for (const testCase of EVAL_CASES) {
    const result = await runCase(testCase);
    results.push(result);

    console.log(
      `${result.matched ? "PASS" : "FAIL"}  ${result.name.padEnd(28)} ` +
        `${String(result.ruleCount).padStart(2)} rules  ` +
        `${String(result.durationMs).padStart(5)}ms` +
        (result.note ? `  ${result.note}` : ""),
    );
  }

  const rate = (n: number) => `${((n / results.length) * 100).toFixed(0)}%`;
  const schemaValid = results.filter((r) => r.schemaValid).length;
  const matched = results.filter((r) => r.matched).length;
  const median = results.map((r) => r.durationMs).sort((a, b) => a - b)[
    Math.floor(results.length / 2)
  ];

  console.log(
    [
      "",
      `schema-valid first try: ${schemaValid}/${results.length} (${rate(schemaValid)})`,
      `matched expectation:    ${matched}/${results.length} (${rate(matched)})`,
      `median latency:         ${median}ms`,
    ].join("\n"),
  );

  process.exit(matched === results.length ? 0 : 1);
};

void main();
