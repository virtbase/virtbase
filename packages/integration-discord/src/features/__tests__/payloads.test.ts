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

import { beforeAll, describe, expect, test } from "bun:test";
import type { APIInteractionResponse } from "discord-api-types/v10";

import { stubNextIntl } from "../../__tests__/support/harness";

beforeAll(stubNextIntl);

const { HelpMessage, InviteMessage, MainMenuMessage, SetupMenuMessage } =
  await import("../menu/messages");
const { ServersListEmptyMessage } = await import("../servers/messages");
const { ErrorMessage } = await import("../../messages/error");
const { isLinkableUrl } = await import("../../ui/components");

/**
 * Discord's own limits. Exceeding one is not an error anybody sees: the message
 * is discarded and the customer is told the bot did not respond in time.
 */
const LIMITS = {
  embeds: 10,
  embedTitle: 256,
  embedDescription: 4096,
  embedFields: 25,
  embedFieldName: 256,
  embedFieldValue: 1024,
  embedTotal: 6000,
  rows: 5,
  buttonsPerRow: 5,
  buttonLabel: 80,
  customId: 100,
};

interface Component {
  type: number;
  style?: number;
  label?: string;
  url?: string;
  custom_id?: string;
  options?: { label: string; value: string; description?: string }[];
}

/** Everything Discord validates before it will accept a message. */
const assertValid = (response: APIInteractionResponse, name: string) => {
  expect(response.type, `${name}: response type`).toBeGreaterThan(0);
  if (!("data" in response) || !response.data) return;

  const data = response.data as {
    embeds?: {
      title?: string;
      description?: string;
      fields?: { name: string; value: string }[];
    }[];
    components?: { type: number; components?: Component[] }[];
  };

  const embeds = data.embeds ?? [];
  expect(embeds.length, `${name}: embed count`).toBeLessThanOrEqual(
    LIMITS.embeds,
  );

  for (const embed of embeds) {
    expect((embed.title ?? "").length, `${name}: title`).toBeLessThanOrEqual(
      LIMITS.embedTitle,
    );
    expect(
      (embed.description ?? "").length,
      `${name}: description`,
    ).toBeLessThanOrEqual(LIMITS.embedDescription);

    const fields = embed.fields ?? [];
    expect(fields.length, `${name}: field count`).toBeLessThanOrEqual(
      LIMITS.embedFields,
    );

    for (const field of fields) {
      expect(field.name.length, `${name}: field name`).toBeLessThanOrEqual(
        LIMITS.embedFieldName,
      );
      expect(field.value.length, `${name}: field value`).toBeLessThanOrEqual(
        LIMITS.embedFieldValue,
      );
      // An empty field value is rejected outright.
      expect(field.name.length, `${name}: empty field name`).toBeGreaterThan(0);
      expect(field.value.length, `${name}: empty field value`).toBeGreaterThan(
        0,
      );
    }

    const total =
      (embed.title ?? "").length +
      (embed.description ?? "").length +
      fields.reduce((sum, f) => sum + f.name.length + f.value.length, 0);
    expect(total, `${name}: embed total`).toBeLessThanOrEqual(
      LIMITS.embedTotal,
    );
  }

  const rows = data.components ?? [];
  expect(rows.length, `${name}: row count`).toBeLessThanOrEqual(LIMITS.rows);

  for (const rowComponent of rows) {
    const children = rowComponent.components ?? [];

    // An action row with no children is rejected; `message()` drops them.
    expect(children.length, `${name}: empty row`).toBeGreaterThan(0);

    if (children.every((child) => child.type === 2)) {
      expect(children.length, `${name}: buttons per row`).toBeLessThanOrEqual(
        LIMITS.buttonsPerRow,
      );
    }

    for (const child of children) {
      if (child.label !== undefined) {
        expect(child.label.length, `${name}: label`).toBeLessThanOrEqual(
          LIMITS.buttonLabel,
        );
        expect(child.label.length, `${name}: empty label`).toBeGreaterThan(0);
      }

      if (child.custom_id !== undefined) {
        expect(
          child.custom_id.length,
          `${name}: custom_id`,
        ).toBeLessThanOrEqual(LIMITS.customId);
      }

      // A link button carries a url and never a custom_id; the reverse for the
      // rest. Discord rejects a component carrying both or neither.
      if (child.type === 2 && child.style === 5) {
        expect(child.url, `${name}: link button url`).toBeDefined();
        expect(
          child.custom_id,
          `${name}: link button custom_id`,
        ).toBeUndefined();
        expect(
          isLinkableUrl(child.url as string),
          `${name}: ${child.url}`,
        ).toBe(true);
      } else if (child.type === 2) {
        expect(child.custom_id, `${name}: button custom_id`).toBeDefined();
        expect(child.url, `${name}: button url`).toBeUndefined();
      }
    }
  }
};

const APP_ID = "123456789012345678";
const SERVER = "srv_1KECN6RQ2MHEMQV0E62050P88";

/** Opens whatever a feature's button returns, with a fake context. */
const press = async (
  feature: { buttons?: Record<string, unknown> },
  action: string,
  params: string[],
): Promise<APIInteractionResponse> => {
  const { fakePort } = await import("../../__tests__/support/harness");
  const { buttonData, testContext } = await import(
    "../../__tests__/support/context"
  );

  const entry = feature.buttons?.[action];
  if (typeof entry !== "function") {
    throw new Error(`No button handler for "${action}"`);
  }

  const { ctx } = testContext({
    interaction: { data: buttonData(`button:x:${action}`) },
    servers: fakePort().port,
    params,
  });

  return (entry as (c: unknown) => Promise<APIInteractionResponse>)(ctx);
};

describe("every screen reachable without a server", () => {
  const screens: [string, () => Promise<APIInteractionResponse>][] = [
    ["main menu", () => MainMenuMessage({ locale: "en" })],
    ["setup", () => SetupMenuMessage({ locale: "en" })],
    ["help", () => HelpMessage({ locale: "en", appId: APP_ID })],
    ["invite", () => InviteMessage({ locale: "en", appId: APP_ID })],
    ["empty server list", () => ServersListEmptyMessage({ locale: "en" })],
    ["error", () => ErrorMessage({ locale: "en", error: new Error("boom") })],
  ];

  for (const [name, build] of screens) {
    test(`${name} is a payload Discord accepts`, async () => {
      assertValid(await build(), name);
    });
  }
});

describe("modals", () => {
  test("every modal stays inside Discord's five-component limit", async () => {
    // Exceeding it is not an error anybody sees: the modal never opens and the
    // click looks like it did nothing. The firewall form was six.
    const { firewallFeature } = await import("../firewall");
    const { backupsFeature } = await import("../backups");
    const { rdnsFeature } = await import("../rdns");
    const { lifecycleFeature } = await import("../lifecycle");
    const { serversFeature } = await import("../servers");

    const openers: [string, () => Promise<APIInteractionResponse>][] = [
      ["firewall add", () => press(firewallFeature, "add", [SERVER])],
      ["backups create", () => press(backupsFeature, "create", [SERVER])],
      ["rdns add", () => press(rdnsFeature, "add", [SERVER])],
      ["lifecycle rename", () => press(lifecycleFeature, "rename", [SERVER])],
      [
        "lifecycle reinstall-confirm",
        () => press(lifecycleFeature, "reinstall-confirm", [SERVER, "temp_1"]),
      ],
      ["servers password", () => press(serversFeature, "password", [SERVER])],
    ];

    for (const [name, open] of openers) {
      const response = await open();
      const data = (response as { data: { components: unknown[] } }).data;

      expect(data.components.length, `${name}: too few`).toBeGreaterThan(0);
      expect(data.components.length, `${name}: too many`).toBeLessThanOrEqual(
        5,
      );
    }
  });
});
