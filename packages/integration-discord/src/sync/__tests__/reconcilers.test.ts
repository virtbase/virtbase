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

import { commands } from "../../commands";
import { EMOJI_MANIFEST, EMOJI_PREFIX } from "../../emoji/manifest";
import { roleConnectionsMetadata } from "../../role-connections-metadata";
import { reconcileCommands } from "../commands";
import { reconcileEmojis } from "../emojis";
import { reconcileRoleConnections } from "../role-connections";
import { fakeClient } from "./support";

const COMMANDS_PATH = "/applications/app_1/commands";
const METADATA_PATH = "/applications/app_1/role-connections/metadata";
const EMOJIS_PATH = "/applications/app_1/emojis";

describe("reconcileCommands", () => {
  test("registers when nothing is registered yet", async () => {
    const { client, writes } = fakeClient({ [`GET ${COMMANDS_PATH}`]: [] });

    const result = await reconcileCommands(client);

    expect(result.changed).toBe(true);
    expect(writes()).toHaveLength(1);
    expect(writes()[0]?.method).toBe("PUT");
  });

  test("writes nothing when Discord already matches", async () => {
    // What Discord answers with: the declared payload plus the fields it adds
    // itself. Those must not read as drift, or every health probe would
    // re-register.
    const live = Object.values(commands).map((command, index) => ({
      ...command,
      id: `cmd_${index}`,
      application_id: "app_1",
      version: "1",
      default_member_permissions: null,
      dm_permission: true,
      nsfw: false,
    }));

    const { client, writes } = fakeClient({ [`GET ${COMMANDS_PATH}`]: live });

    const result = await reconcileCommands(client);

    expect(result.changed).toBe(false);
    expect(writes()).toEqual([]);
  });

  test("repairs a command deleted by hand in the developer portal", async () => {
    const live = Object.values(commands)
      .slice(1)
      .map((command) => ({ ...command, id: "x", application_id: "app_1" }));

    const { client, writes } = fakeClient({ [`GET ${COMMANDS_PATH}`]: live });

    const result = await reconcileCommands(client);

    expect(result.changed).toBe(true);
    expect(writes()[0]?.body).toHaveLength(Object.keys(commands).length);
  });

  test("registration order does not count as drift", async () => {
    const live = Object.values(commands)
      .slice()
      .reverse()
      .map((command) => ({ ...command, id: "x" }));

    const { client } = fakeClient({ [`GET ${COMMANDS_PATH}`]: live });

    expect((await reconcileCommands(client)).changed).toBe(false);
  });
});

describe("reconcileRoleConnections", () => {
  test("registers the declared metadata", async () => {
    const { client, writes } = fakeClient({ [`GET ${METADATA_PATH}`]: [] });

    const result = await reconcileRoleConnections(client);

    expect(result.changed).toBe(true);
    expect(writes()[0]?.body).toHaveLength(roleConnectionsMetadata.length);
  });

  test("writes nothing when it already matches", async () => {
    const { client, writes } = fakeClient({
      [`GET ${METADATA_PATH}`]: roleConnectionsMetadata,
    });

    expect((await reconcileRoleConnections(client)).changed).toBe(false);
    expect(writes()).toEqual([]);
  });
});

describe("reconcileEmojis", () => {
  test("uploads the whole manifest to an application with none", async () => {
    const { client, writes } = fakeClient({
      [`GET ${EMOJIS_PATH}`]: { items: [] },
    });

    const result = await reconcileEmojis(client);

    expect(result.changed).toBe(true);
    expect(writes()).toHaveLength(EMOJI_MANIFEST.length);
    expect(writes().every((write) => write.method === "POST")).toBe(true);
  });

  test("uploads a PNG data URI Discord will accept", async () => {
    const { client, writes } = fakeClient({
      [`GET ${EMOJIS_PATH}`]: { items: [] },
    });

    await reconcileEmojis(client);

    const body = writes()[0]?.body as { name: string; image: string };
    expect(body.name.startsWith(EMOJI_PREFIX)).toBe(true);
    expect(body.image.startsWith("data:image/png;base64,")).toBe(true);
    // Discord's per-emoji ceiling is 256 KiB; base64 inflates by about a third.
    expect(body.image.length).toBeLessThan(256 * 1024);
  });

  test("writes nothing when every emoji is already there", async () => {
    const { client, writes } = fakeClient({
      [`GET ${EMOJIS_PATH}`]: {
        items: EMOJI_MANIFEST.map((entry, index) => ({
          id: String(index),
          name: entry.name,
        })),
      },
    });

    expect((await reconcileEmojis(client)).changed).toBe(false);
    expect(writes()).toEqual([]);
  });

  test("removes one of ours that is no longer declared", async () => {
    const { client, writes } = fakeClient({
      [`GET ${EMOJIS_PATH}`]: {
        items: [
          ...EMOJI_MANIFEST.map((entry, index) => ({
            id: String(index),
            name: entry.name,
          })),
          { id: "999", name: `${EMOJI_PREFIX}retired` },
        ],
      },
    });

    const result = await reconcileEmojis(client);

    expect(result.changed).toBe(true);
    expect(writes()).toEqual([
      { method: "DELETE", path: `${EMOJIS_PATH}/999`, body: undefined },
    ]);
  });

  test("leaves an emoji it does not own alone", async () => {
    // An application can hold 2000 emojis and something else may be using them.
    const { client, writes } = fakeClient({
      [`GET ${EMOJIS_PATH}`]: {
        items: [
          ...EMOJI_MANIFEST.map((entry, index) => ({
            id: String(index),
            name: entry.name,
          })),
          { id: "999", name: "someone_elses_emoji" },
        ],
      },
    });

    expect((await reconcileEmojis(client)).changed).toBe(false);
    expect(writes()).toEqual([]);
  });

  test("tolerates a bare array as well as the documented wrapper", async () => {
    const { client } = fakeClient({
      [`GET ${EMOJIS_PATH}`]: EMOJI_MANIFEST.map((entry, index) => ({
        id: String(index),
        name: entry.name,
      })),
    });

    expect((await reconcileEmojis(client)).changed).toBe(false);
  });
});
