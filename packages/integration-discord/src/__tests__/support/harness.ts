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

import { mock } from "bun:test";
import type {
  ServerManagementActor,
  ServerManagementPort,
} from "@virtbase/ports";

import type { EmojiResolver } from "../../emoji";

/**
 * next-intl's server entry needs a Next.js request scope and a resolved i18n
 * config, neither of which exists in a bare test process.
 *
 * Stubbing it is the point of these tests: with the tRPC caller gone, message
 * rendering is a Discord handler's only remaining tie to the application. The
 * stub returns the message id, so an assertion can still read what a screen
 * says without a message catalogue.
 */
export const stubNextIntl = () => {
  mock.module("next-intl/server", () => ({
    getExtracted: async () => interpolate,
    getFormatter: async () => ({
      // Delegates to the platform rather than stringifying: `formatBytes` asks
      // for a unit style, and a stub that ignored it rendered
      // "4.093592369808323" where a customer sees "4.09 GB" — which hid
      // formatting mistakes instead of surfacing them.
      number: (value: number, options?: Intl.NumberFormatOptions) =>
        new Intl.NumberFormat("en", options).format(value),
      dateTime: (value: Date) => value.toISOString(),
    }),
  }));
};

/**
 * Stands in for a translator by returning the message with its simple
 * placeholders filled in.
 *
 * Returning the message untouched was enough to assert which screen rendered,
 * but not what it said about a particular server — `{name}` never became
 * "web-01", so a test could not tell a correct value from a missing one.
 *
 * ICU constructs with a type (`{count, plural, ...}`) are left alone: matching
 * next-intl's behaviour there means implementing ICU, and no test needs it.
 */
const interpolate = (
  message: string,
  values: Record<string, unknown> = {},
): string =>
  message.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (whole, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : whole,
  );

export interface PortCall {
  method: string;
  actor: ServerManagementActor;
  input: unknown;
}

/**
 * Records what a handler asked the port for, and answers with whatever the test
 * hands it.
 *
 * Keyed by the dotted path a handler calls (`backups.create`), so a test asserts
 * against the same name it would read in the handler.
 */
export const fakePort = (results: Record<string, unknown> = {}) => {
  const calls: PortCall[] = [];

  const record =
    (method: string, fallback: unknown) =>
    async (actor: ServerManagementActor, input: unknown) => {
      calls.push({ method, actor, input });

      const result = Object.hasOwn(results, method)
        ? results[method]
        : fallback;
      if (result instanceof Error) throw result;
      return result;
    };

  const emptyPage = {
    meta: { pagination: { page: 1, per_page: 25, last_page: 1 } },
  };

  const port = {
    list: record("list", { servers: [], ...emptyPage }),
    get: record("get", { server: { id: "srv_1", name: "one" } }),
    console: record("console", "https://novnc.example/x"),
    resetPassword: record("resetPassword", undefined),
    status: {
      get: record("status.get", {
        status: { state: "RUNNING", task: null, stats: {} },
      }),
      update: record("status.update", undefined),
    },
    graphs: {
      get: record("graphs.get", { data: [] }),
    },
    backups: {
      list: record("backups.list", { backups: [], ...emptyPage }),
      get: record("backups.get", {
        backup: { id: "kbu_1", name: "b", is_locked: false },
      }),
      create: record("backups.create", { backup: { id: "kbu_1", name: "b" } }),
      update: record("backups.update", {
        backup: { id: "kbu_1", name: "b", is_locked: true },
      }),
      delete: record("backups.delete", undefined),
      restore: record("backups.restore", undefined),
    },
    rdns: {
      list: record("rdns.list", { records: [], ...emptyPage }),
      upsert: record("rdns.upsert", { record: { id: "ipptr_1" } }),
      delete: record("rdns.delete", undefined),
    },
    firewall: {
      options: {
        get: record("firewall.options.get", {
          options: { enabled: true, policy_in: "DROP", policy_out: "ACCEPT" },
        }),
        update: record("firewall.options.update", undefined),
      },
      rules: {
        list: record("firewall.rules.list", { rules: [] }),
        create: record("firewall.rules.create", undefined),
        update: record("firewall.rules.update", undefined),
        delete: record("firewall.rules.delete", undefined),
        move: record("firewall.rules.move", undefined),
      },
    },
    mounts: {
      list: record("mounts.list", { iso_downloads: [], ...emptyPage }),
      mount: record("mounts.mount", undefined),
      unmount: record("mounts.unmount", undefined),
    },
    lifecycle: {
      rename: record("lifecycle.rename", undefined),
      changeTemplate: record("lifecycle.changeTemplate", undefined),
      plan: record("lifecycle.plan", { plans: [] }),
      templateGroups: record("lifecycle.templateGroups", {
        template_groups: [],
      }),
      advanced: {
        get: record("lifecycle.advanced.get", {
          settings: { tpm: null, bios: null },
        }),
        update: record("lifecycle.advanced.update", undefined),
      },
    },
  } as unknown as ServerManagementPort;

  return { port, calls };
};

export const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

export const noEmojis: EmojiResolver = {
  forOperatingSystem: () => "",
  forTemplate: () => "",
  componentForTemplate: () => undefined,
  byName: () => "",
};
