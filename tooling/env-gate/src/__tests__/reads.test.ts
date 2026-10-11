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

import { describe, expect, test } from "bun:test";
import { DYNAMIC_KEY, findEnvReads, WHOLE_ENVIRONMENT } from "../reads";

const variables = (source: string, path = "src/a.ts") =>
  findEnvReads(path, source).map((read) => read.variable);

describe("findEnvReads: member access", () => {
  test("records the path and line of process.env.X", () => {
    expect(
      findEnvReads("src/a.ts", "\nconst a = process.env.DATABASE_URL;"),
    ).toEqual([{ path: "src/a.ts", line: 2, variable: "DATABASE_URL" }]);
  });

  test("reads string, template and optional keys", () => {
    expect(
      variables('process.env["A"]; process.env[`B`]; process.env?.C;'),
    ).toEqual(["A", "B", "C"]);
  });

  test("reads Bun.env and import.meta.env", () => {
    expect(variables("Bun.env.A; import.meta.env.B;")).toEqual(["A", "B"]);
  });

  test("reads process through globalThis, global and a computed env key", () => {
    expect(
      variables(
        'globalThis.process.env.A; global.process.env.B; process["env"].C;',
      ),
    ).toEqual(["A", "B", "C"]);
  });

  test("counts a write as a read", () => {
    expect(variables('process.env.SMTP_HOST = "localhost";')).toEqual([
      "SMTP_HOST",
    ]);
  });

  test("reads the key of an in check", () => {
    expect(variables('"RESEND_API_KEY" in process.env;')).toEqual([
      "RESEND_API_KEY",
    ]);
  });

  test("records a computed key as dynamic", () => {
    expect(variables("process.env[name];")).toEqual([DYNAMIC_KEY]);
  });
});

describe("findEnvReads: destructuring", () => {
  test("reads every key of a pattern, and its rest as the whole environment", () => {
    expect(
      variables("const { SMTP_HOST, SMTP_PORT: port, ...rest } = process.env;"),
    ).toEqual(["SMTP_HOST", "SMTP_PORT", WHOLE_ENVIRONMENT]);
  });

  test("reads string keys, assignment patterns and computed keys", () => {
    expect(variables('const { "A": a } = process.env;')).toEqual(["A"]);
    expect(variables("let B; ({ B } = process.env);")).toEqual(["B"]);
    expect(variables("const { [name]: c } = process.env;")).toEqual([
      DYNAMIC_KEY,
    ]);
  });

  test("reads env destructured from process", () => {
    expect(variables("const { env } = process;")).toEqual([WHOLE_ENVIRONMENT]);
    expect(variables("const { env: { A, B } } = process;")).toEqual(["A", "B"]);
    expect(variables("const { argv } = process;")).toEqual([]);
  });
});

describe("findEnvReads: the whole environment", () => {
  test("records a spread, an alias and a passed-on environment", () => {
    expect(variables("spawn(cmd, { env: { ...process.env } });")).toEqual([
      WHOLE_ENVIRONMENT,
    ]);
    expect(variables("const e = process.env;")).toEqual([WHOLE_ENVIRONMENT]);
    expect(variables("schema.parse(process.env);")).toEqual([
      WHOLE_ENVIRONMENT,
    ]);
  });

  test("records env, default and namespace imports of the process module", () => {
    expect(variables('import { env } from "node:process";')).toEqual([
      WHOLE_ENVIRONMENT,
    ]);
    expect(variables('import proc from "process";')).toEqual([
      WHOLE_ENVIRONMENT,
    ]);
    expect(variables('import * as proc from "node:process";')).toEqual([
      WHOLE_ENVIRONMENT,
    ]);
    expect(variables('import { argv } from "node:process";')).toEqual([]);
  });

  test("records env imported from bun, and nothing else from it", () => {
    expect(variables('import { env } from "bun";')).toEqual([
      WHOLE_ENVIRONMENT,
    ]);
    expect(variables('import { file } from "bun";')).toEqual([]);
  });
});

describe("findEnvReads: t3-env schemas", () => {
  test("reads every key of the server, client and shared schema", () => {
    const source = [
      "export const env = createEnv({",
      "  server: { STRIPE_SECRET_KEY: z.string() },",
      "  client: { NEXT_PUBLIC_X: z.string() },",
      "  shared: { NODE_ENV: z.string() },",
      "  runtimeEnv: {},",
      "});",
    ].join("\n");

    expect(findEnvReads("src/env.ts", source)).toEqual([
      { path: "src/env.ts", line: 2, variable: "STRIPE_SECRET_KEY" },
      { path: "src/env.ts", line: 3, variable: "NEXT_PUBLIC_X" },
      { path: "src/env.ts", line: 4, variable: "NODE_ENV" },
    ]);
  });

  test("ignores createEnv options that are not a schema", () => {
    expect(
      variables(
        "createEnv({ skipValidation: true, emptyStringAsUndefined: true });",
      ),
    ).toEqual([]);
  });
});

describe("findEnvReads: what is not a read", () => {
  test("ignores env members of other objects and text in strings", () => {
    expect(variables('config.env.X; const b = "process.env.Y";')).toEqual([]);
  });
});

describe("findEnvReads: files", () => {
  test("parses TSX, generic arrows and JavaScript by file extension", () => {
    expect(
      variables("const A = () => <b>{process.env.X}</b>;", "src/a.tsx"),
    ).toEqual(["X"]);
    expect(variables("const f = <T,>(x: T) => process.env.Y;")).toEqual(["Y"]);
    expect(variables("export default process.env.Z;", "src/a.mjs")).toEqual([
      "Z",
    ]);
  });

  test("throws on a file Babel cannot recover", () => {
    expect(() => findEnvReads("src/a.ts", "const = = ;")).toThrow();
  });
});
