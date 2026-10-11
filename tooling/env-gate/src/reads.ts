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

import type { ParserPlugin } from "@babel/parser";
import { parse } from "@babel/parser";
import type {
  MemberExpression,
  Node,
  ObjectPattern,
  OptionalMemberExpression,
} from "@babel/types";
import {
  isAssignmentExpression,
  isBinaryExpression,
  isCallExpression,
  isIdentifier,
  isImportDeclaration,
  isImportSpecifier,
  isMemberExpression,
  isMetaProperty,
  isObjectExpression,
  isObjectPattern,
  isObjectProperty,
  isOptionalMemberExpression,
  isRestElement,
  isStringLiteral,
  isTemplateLiteral,
  isVariableDeclarator,
  traverse,
} from "@babel/types";

/** One reference to an environment variable in a source file. */
export interface EnvRead {
  path: string;
  line: number;
  /**
   * The variable's name, {@link WHOLE_ENVIRONMENT} for a reference to the
   * whole environment, or {@link DYNAMIC_KEY} for a computed key.
   */
  variable: string;
}

/**
 * The name the gate records for a reference to the whole environment: a
 * spread, a rest pattern, an alias, or the object passed on.
 */
export const WHOLE_ENVIRONMENT = "*";

/** The name the gate records for a key computed at run time. */
export const DYNAMIC_KEY = "<dynamic>";

const PROCESS_MODULES: ReadonlySet<string> = new Set([
  "node:process",
  "process",
]);
const SCHEMA_GROUPS: ReadonlySet<string> = new Set([
  "server",
  "client",
  "shared",
]);

/**
 * Lists the environment reads of a source file, in source order. A read is:
 *
 * - a reference to `process.env` (also through `globalThis.process` or
 *   `global.process`), `Bun.env` or `import.meta.env`;
 * - `env` destructured from `process`;
 * - `env`, a default or a namespace imported from `node:process` or
 *   `process`, and `env` imported from `bun`, recorded as
 *   {@link WHOLE_ENVIRONMENT};
 * - a key of the `server`, `client` or `shared` schema passed to a t3-env
 *   `createEnv` call, which reads that variable itself.
 *
 * Writes count as reads: a test that sets `process.env.X` depends on `X` as
 * much as code that reads it. Throws when Babel cannot recover from a syntax
 * error, because a gate that skipped the file would pass reads it never saw.
 */
export const findEnvReads = (path: string, source: string): EnvRead[] => {
  const file = parse(source, {
    sourceType: "module",
    plugins: selectPlugins(path),
    errorRecovery: true,
  });

  const reads: EnvRead[] = [];
  const record = (node: Node, variables: string[]) => {
    const line = node.loc?.start.line ?? 0;
    for (const variable of variables) reads.push({ path, line, variable });
  };

  traverse(file.program, (node, ancestors) => {
    const parent = ancestors.at(-1)?.node ?? null;
    if (isEnvironmentObject(node)) {
      record(node, listVariablesRead(node, parent));
    } else if (
      isVariableDeclarator(node) &&
      node.init &&
      isProcessObject(node.init) &&
      isObjectPattern(node.id)
    ) {
      record(node, listEnvFromProcessPattern(node.id));
    } else if (isImportDeclaration(node)) {
      record(
        node,
        listImportedEnvironments(node.source.value, node.specifiers),
      );
    } else if (
      isCallExpression(node) &&
      isIdentifier(node.callee, { name: "createEnv" })
    ) {
      for (const property of listSchemaKeys(node.arguments[0] ?? null)) {
        record(property.node, [property.name]);
      }
    }
  });
  return reads.sort((a, b) => a.line - b.line);
};

type Member = MemberExpression | OptionalMemberExpression;

const isMember = (node: Node | null): node is Member =>
  isMemberExpression(node) || isOptionalMemberExpression(node);

const readPropertyName = (node: Member): string | null => {
  if (!node.computed && isIdentifier(node.property)) return node.property.name;
  if (node.computed && isStringLiteral(node.property)) {
    return node.property.value;
  }
  if (
    node.computed &&
    isTemplateLiteral(node.property) &&
    node.property.expressions.length === 0
  ) {
    return node.property.quasis[0]?.value.cooked ?? null;
  }
  return null;
};

const isProcessObject = (node: Node): boolean =>
  isIdentifier(node, { name: "process" }) ||
  (isMember(node) &&
    readPropertyName(node) === "process" &&
    (isIdentifier(node.object, { name: "globalThis" }) ||
      isIdentifier(node.object, { name: "global" })));

const isEnvironmentObject = (node: Node): node is Member =>
  isMember(node) &&
  readPropertyName(node) === "env" &&
  (isProcessObject(node.object) ||
    isIdentifier(node.object, { name: "Bun" }) ||
    isMetaProperty(node.object));

const readKeyName = (key: Node, computed: boolean): string =>
  computed
    ? DYNAMIC_KEY
    : isIdentifier(key)
      ? key.name
      : isStringLiteral(key)
        ? key.value
        : DYNAMIC_KEY;

const listPatternKeys = (pattern: ObjectPattern): string[] =>
  pattern.properties.map((property) =>
    isRestElement(property)
      ? WHOLE_ENVIRONMENT
      : readKeyName(property.key, property.computed),
  );

const listVariablesRead = (
  environment: Member,
  parent: Node | null,
): string[] => {
  if (isMember(parent) && parent.object === environment) {
    return [readPropertyName(parent) ?? DYNAMIC_KEY];
  }
  if (isBinaryExpression(parent, { operator: "in" })) {
    return [isStringLiteral(parent.left) ? parent.left.value : DYNAMIC_KEY];
  }
  const pattern =
    isVariableDeclarator(parent) && parent.init === environment
      ? parent.id
      : isAssignmentExpression(parent) && parent.right === environment
        ? parent.left
        : null;
  return isObjectPattern(pattern)
    ? listPatternKeys(pattern)
    : [WHOLE_ENVIRONMENT];
};

const listEnvFromProcessPattern = (pattern: ObjectPattern): string[] =>
  pattern.properties.flatMap((property) => {
    if (isRestElement(property)) return [WHOLE_ENVIRONMENT];
    if (readKeyName(property.key, property.computed) !== "env") return [];
    return isObjectPattern(property.value)
      ? listPatternKeys(property.value)
      : [WHOLE_ENVIRONMENT];
  });

const listImportedEnvironments = (
  source: string,
  specifiers: Node[],
): string[] =>
  specifiers
    .filter((specifier) =>
      isImportSpecifier(specifier)
        ? (PROCESS_MODULES.has(source) || source === "bun") &&
          readKeyName(specifier.imported, false) === "env"
        : PROCESS_MODULES.has(source),
    )
    .map(() => WHOLE_ENVIRONMENT);

const listSchemaKeys = (
  options: Node | null,
): { node: Node; name: string }[] => {
  if (!isObjectExpression(options)) return [];
  return options.properties.flatMap((group) => {
    if (
      !isObjectProperty(group) ||
      !SCHEMA_GROUPS.has(readKeyName(group.key, group.computed)) ||
      !isObjectExpression(group.value)
    ) {
      return [];
    }
    return group.value.properties.flatMap((property) =>
      isObjectProperty(property)
        ? [
            {
              node: property,
              name: readKeyName(property.key, property.computed),
            },
          ]
        : [],
    );
  });
};

const selectPlugins = (path: string): ParserPlugin[] =>
  path.endsWith(".tsx")
    ? ["typescript", "jsx"]
    : /\.[cm]?ts$/.test(path)
      ? ["typescript"]
      : ["jsx"];
