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

import { expect, mock } from "bun:test";
import { resolve } from "node:path";
import type {
  FetchLike,
  Integration,
  IntegrationLogger,
  LocalizedIntegrationText,
  LogSink,
} from "@virtbase/integration-sdk";
import {
  collectSecretValues,
  findCompositionProblems,
  IntegrationRegistry,
} from "@virtbase/integration-sdk";
import { checkDocs, DOCS_FILES } from "./checks/docs";
import { checkFields } from "./checks/fields";
import type { Check } from "./checks/run";
import { describeChecks, runChecks } from "./checks/run";
import { findSecretLeaks } from "./checks/secrets";
import { checkNamespaces, checkTranslations } from "./checks/translations";

/** What the conformance suite needs besides the definition. */
export interface ConformanceOptions {
  /**
   * The integration package's directory: it holds `package.json` and
   * `docs/`, and `next-intl/server` is resolved from it.
   */
  packageDir: string;
  /**
   * A valid stored configuration. Its secret values are what the leak check
   * searches for, so use distinctive ones.
   */
  config: { settings: unknown; secrets: unknown };
  /**
   * Plays a working provider behind `ctx.http`. Required when the integration
   * has a health probe. A probe that talks to its provider through an SDK
   * client of its own (Stripe) is not served by it.
   */
  backend?: FetchLike;
}

/** A provider that never answers, until the request's own signal aborts it. */
const neverAnswers: FetchLike = (_, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  });

/** A provider that answers every request with a 503. */
const failsAtOnce: FetchLike = async () =>
  new Response("unavailable", { status: 503 });

/**
 * For the silent-provider check: `ctx.http` gives up after this, well inside
 * the probe's budget, so the probe itself has to report the timeout.
 */
const SILENT_PROVIDER_HTTP_TIMEOUT_MS = 50;
const SILENT_PROVIDER_BUDGET_MS = 2_000;

/** Marks text that came through the recording translator. */
const TRANSLATED = "\u2063";

const TEMPLATES = resolve(import.meta.dir, "../templates");

const silentLogger: IntegrationLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
const silentSink: LogSink = silentLogger;

interface ConformanceContext {
  definition: Integration;
  options: ConformanceOptions;
  registry(
    backend: FetchLike,
    overrides?: Pick<Integration, "healthBudgetMs" | "httpTimeoutMs">,
  ): IntegrationRegistry;
  localize(): Promise<{
    localized: LocalizedIntegrationText;
    namespaces: (string | undefined)[];
  }>;
}

const readIfExists = async (path: string) => {
  const file = Bun.file(path);
  return (await file.exists()) ? file.text() : null;
};

const expectHealth = async (
  { definition, registry }: ConformanceContext,
  backend: FetchLike,
  status: "ok" | "error",
  overrides?: Pick<Integration, "healthBudgetMs" | "httpTimeoutMs">,
) => {
  const health = await registry(backend, overrides).healthOf(definition.id);
  expect(health.status).toBe(status);
};

const BASE_CHECKS: Check<ConformanceContext>[] = [
  {
    title:
      "it is declared with a manifest that parses, supports this SDK and composes",
    run: ({ definition }) => {
      if (!definition.manifest) {
        throw new Error(
          `${definition.id} is a v1 definition; declare it with defineIntegration(manifest, runtime)`,
        );
      }
      expect(findCompositionProblems([definition])).toEqual([]);
    },
  },
  {
    title: "every setting and secret has a field, and every field a schema key",
    run: ({ definition }) => {
      expect(
        definition.manifest ? checkFields(definition.manifest) : [],
      ).toEqual([]);
    },
  },
  {
    title:
      "localize() translates the name, the description and every field label through its namespace",
    run: async ({ definition, localize }) => {
      const { localized, namespaces } = await localize();
      expect([
        ...(definition.manifest
          ? checkTranslations(definition.manifest, localized, (text) =>
              text.startsWith(TRANSLATED),
            )
          : []),
        ...checkNamespaces(definition.id, namespaces),
      ]).toEqual([]);
    },
  },
  {
    title: "docs/ holds the nine files, each written",
    run: async ({ options }) => {
      if (
        !(await Bun.file(resolve(options.packageDir, "package.json")).exists())
      ) {
        throw new Error(`${options.packageDir} holds no package.json`);
      }
      const files: Record<string, string | null> = {};
      const templates: Record<string, string> = {};
      for (const name of DOCS_FILES) {
        files[name] = await readIfExists(
          resolve(options.packageDir, "docs", name),
        );
        templates[name] = (await readIfExists(resolve(TEMPLATES, name))) ?? "";
      }
      expect(checkDocs({ files, templates })).toEqual([]);
    },
  },
  {
    title:
      "no secret value reaches the description, health output or translations",
    run: async (context) => {
      const { definition, options, registry, localize } = context;
      const failing = registry(failsAtOnce);
      const outputs: Record<string, unknown> = {
        description: await failing.describeAll(),
        "health against a failing provider": await failing.healthOf(
          definition.id,
        ),
        translations: (await localize()).localized,
      };
      if (options.backend) {
        outputs["health against a working provider"] = await registry(
          options.backend,
        ).healthOf(definition.id);
      }
      expect(
        findSecretLeaks({
          outputs,
          secrets: collectSecretValues(options.config.secrets),
        }),
      ).toEqual([]);
    },
  },
];

const HEALTH_CHECKS: Check<ConformanceContext>[] = [
  {
    title: "health reports error when the provider fails",
    run: (context) => expectHealth(context, failsAtOnce, "error"),
  },
  {
    title: "health reports error when the provider stops answering",
    run: (context) =>
      expectHealth(context, neverAnswers, "error", {
        httpTimeoutMs: SILENT_PROVIDER_HTTP_TIMEOUT_MS,
        healthBudgetMs: SILENT_PROVIDER_BUDGET_MS,
      }),
  },
  {
    title: "health reports ok against a working provider",
    run: (context) => {
      if (!context.options.backend) {
        throw new Error(
          `${context.definition.id} has a health probe, so pass a backend`,
        );
      }
      return expectHealth(context, context.options.backend, "ok");
    },
  },
];

const createContext = (
  definition: Integration,
  options: ConformanceOptions,
): ConformanceContext => ({
  definition,
  options,
  registry: (backend, overrides) =>
    new IntegrationRegistry({
      integrations: [{ ...definition, ...overrides }],
      config: {
        isEnabled: async () => true,
        settings: async () => options.config.settings,
        secrets: async () => options.config.secrets,
      },
      logger: silentLogger,
      logSink: silentSink,
      fetch: backend,
    }),
  localize: async () => {
    const namespaces: (string | undefined)[] = [];
    mock.module(
      Bun.resolveSync("next-intl/server", options.packageDir),
      () => ({
        getExtracted: async (arg?: string | { namespace?: string }) => {
          namespaces.push(typeof arg === "string" ? arg : arg?.namespace);
          return (text: string) => `${TRANSLATED}${text}`;
        },
      }),
    );
    return { localized: (await definition.localize?.()) ?? {}, namespaces };
  },
});

const checksFor = (definition: Integration) =>
  definition.health ? [...BASE_CHECKS, ...HEALTH_CHECKS] : BASE_CHECKS;

/**
 * The conformance suite (§4.7 of integration-first.md, TST-11). Every
 * integration calls it from a test file of its own, because the translations
 * check replaces `next-intl/server` with `mock.module` for the rest of the
 * file (TST-2):
 *
 * ```ts
 * describeIntegration(integration, {
 *   packageDir: resolve(import.meta.dir, "../.."),
 *   config: { settings: { apiUrl: "https://dns.test" }, secrets: { apiKey: "key-1" } },
 *   backend: fakePowerDns.fetch,
 * });
 * ```
 *
 * Implemented from §4.7: item 1 (manifest; `requires.features` and
 * `requires.ports` do not exist yet), item 2 (fields; settings migrations come
 * with them), item 3 (name, description, field labels and the namespace;
 * select-option labels and error codes come with the typed `localize()` of
 * ADR 0018), item 7 (health), item 8 (docs) and item 9 against the caller's
 * secret values rather than generated sentinels, which could not pass every
 * schema; procedure outputs come with procedures. Items 4, 5 and 6 (hooks,
 * pages, data) come with Phases 4 and 5.
 */
export const describeIntegration = (
  definition: Integration,
  options: ConformanceOptions,
): void => {
  const context = createContext(definition, options);
  describeChecks(
    `${definition.id} conformance`,
    checksFor(definition),
    async () => context,
  );
};

/**
 * Runs the conformance suite and returns one line per failed check, for the
 * suite's own tests.
 */
export const runConformance = (
  definition: Integration,
  options: ConformanceOptions,
): Promise<string[]> => {
  const context = createContext(definition, options);
  return runChecks(checksFor(definition), async () => context);
};
