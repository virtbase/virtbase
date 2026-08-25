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
import { ServerManagementError } from "@virtbase/ports";
import { InteractionResponseType } from "discord-api-types/v10";

import {
  buttonData,
  componentsOf,
  customIdsOf,
  modalData,
  selectData,
  testContext,
  textOf,
} from "../../__tests__/support/context";
import { fakePort, stubNextIntl } from "../../__tests__/support/harness";

beforeAll(stubNextIntl);

const { runComponent } = await import("../../handlers/dispatch");
const { buttonHandlers, modalHandlers, selectHandlers } = await import(
  "../index"
);

const SERVER = "srv_1KECN6RQ2MHEMQV0E62050P88";
const BACKUP = "kbu_1KECN6RQ2MHEMQV0E62050P88";

/** Runs a button through the real router, exactly as the webhook would. */
const press = async (
  customId: string,
  options: {
    results?: Record<string, unknown>;
    user?: null | undefined;
  } = {},
) => {
  const { port, calls } = fakePort(options.results ?? {});
  const { ctx, settled } = testContext({
    interaction: { data: buttonData(customId) },
    servers: port,
    ...("user" in options ? { user: options.user as never } : {}),
  });

  const immediate = await runComponent(ctx, "button", customId, buttonHandlers);

  return { immediate, settled: await settled(), calls };
};

describe("the router", () => {
  test("an unlinked account is sent to setup, and the port is never touched", async () => {
    const { immediate, calls } = await press(`button:servers:list`, {
      user: null,
    });

    expect(calls).toEqual([]);
    expect(textOf(immediate)).toContain("Setup");
  });

  test("an entry point still answers an unlinked account", async () => {
    const { immediate, calls } = await press("button:menu:help", {
      user: null,
    });

    expect(calls).toEqual([]);
    expect(textOf(immediate)).toContain("Manage your servers from Discord");
  });

  test("a stale button from an older message answers with the menu", async () => {
    const { immediate, calls } = await press("button:removed:gone");

    expect(calls).toEqual([]);
    expect(textOf(immediate)).toContain("Main menu");
  });
});

describe("servers", () => {
  test("listing asks the port for the acting user's page", async () => {
    const { immediate, calls } = await press("button:servers:list:2");

    // The ack goes back inside Discord's three-second budget…
    expect(immediate.type).toBe(InteractionResponseType.DeferredMessageUpdate);
    // …and the real call happens behind it.
    expect(calls).toEqual([
      {
        method: "list",
        actor: { userId: "usr_1" },
        input: { page: 2, per_page: 25, expand: ["plan", "template"] },
      },
    ]);
  });

  test("an empty list is its own screen, not an empty one", async () => {
    const { settled } = await press("button:servers:list");

    expect(textOf(settled)).toContain("No servers available");
  });

  test("the overview reads status alongside the server", async () => {
    const { calls } = await press(`button:servers:overview:${SERVER}`);

    expect(calls.map((call) => call.method).sort()).toEqual([
      "get",
      "status.get",
    ]);
  });

  test("a node that will not answer costs the live figures, not the screen", async () => {
    const { settled, calls } = await press(
      `button:servers:overview:${SERVER}`,
      {
        results: {
          "status.get": new ServerManagementError("internal", "node is down"),
          get: { server: { id: SERVER, name: "web-01" } },
        },
      },
    );

    expect(calls).toHaveLength(2);
    expect(textOf(settled)).toContain("web-01");
  });

  test("the console link is fetched and offered once", async () => {
    const { settled, calls } = await press(`button:servers:console:${SERVER}`, {
      results: { console: "https://novnc.example/one-time" },
    });

    expect(calls[0]?.method).toBe("console");
    expect(textOf(settled)).toContain("https://novnc.example/one-time");
  });

  test("reset password opens a form without touching the server", async () => {
    const { immediate, calls } = await press(
      `button:servers:password:${SERVER}`,
    );

    // A modal has to be the immediate answer; deferring one is not allowed.
    expect(immediate.type).toBe(InteractionResponseType.Modal);
    expect(calls).toEqual([]);
  });
});

describe("power", () => {
  test("a gentle action runs straight away", async () => {
    const { calls } = await press(`button:power:run:${SERVER}|reboot`);

    expect(calls[0]).toEqual({
      method: "status.update",
      actor: { userId: "usr_1" },
      input: { server_id: SERVER, action: "reboot" },
    });
  });

  test("a hard stop asks first and changes nothing yet", async () => {
    const { immediate, calls } = await press(
      `button:power:confirm:${SERVER}|stop`,
    );

    expect(calls).toEqual([]);
    expect(textOf(immediate)).toContain("Force stop this server?");
    // The confirm button is the one that actually does it.
    expect(customIdsOf(immediate)).toContain(`button:power:run:${SERVER}|stop`);
  });
});

describe("backups", () => {
  test("a running backup is shown as in progress, not as a failure", async () => {
    const { settled } = await press(`button:backups:list:${SERVER}`, {
      results: {
        "backups.list": {
          backups: [
            {
              id: BACKUP,
              name: "nightly",
              is_locked: false,
              finished_at: null,
              failed_at: null,
            },
          ],
          meta: { pagination: { page: 1, per_page: 10, last_page: 1 } },
        },
      },
    });

    expect(textOf(settled)).toContain("In progress");
    // An unsettled row blocks the next backup, so the button must be disabled
    // rather than offered and then rejected by the API.
    const create = componentsOf(settled).find(
      (component) => component.custom_id === `button:backups:create:${SERVER}`,
    );
    expect(create?.disabled).toBe(true);
  });

  test("restoring asks before it overwrites a disk", async () => {
    const { immediate, calls } = await press(
      `button:backups:restore-confirm:${SERVER}|${BACKUP}`,
    );

    expect(calls).toEqual([]);
    expect(textOf(immediate)).toContain("Restore this backup?");
  });

  test("confirming a restore calls the port once", async () => {
    const { calls } = await press(`button:backups:restore:${SERVER}|${BACKUP}`);

    expect(calls[0]).toEqual({
      method: "backups.restore",
      actor: { userId: "usr_1" },
      input: { server_id: SERVER, backup_id: BACKUP },
    });
  });

  test("creating one takes a snapshot, which leaves the server running", async () => {
    const { port, calls } = fakePort();
    const { ctx, settled } = testContext({
      interaction: {
        data: modalData(`modal:backups:create:${SERVER}`, {
          name: "before upgrade",
        }),
      },
      servers: port,
    });

    await runComponent(
      ctx,
      "modal",
      `modal:backups:create:${SERVER}`,
      modalHandlers,
    );
    await settled();

    expect(calls[0]).toEqual({
      method: "backups.create",
      actor: { userId: "usr_1" },
      input: { server_id: SERVER, name: "before upgrade", mode: "snapshot" },
    });
  });
});

describe("firewall", () => {
  test("changing a default policy sends the other one back unchanged", async () => {
    const customId = `select:firewall:policy-in:${SERVER}`;
    const { port, calls } = fakePort();
    const { ctx, settled } = testContext({
      interaction: { data: selectData(customId, ["REJECT"]) },
      servers: port,
    });

    await runComponent(ctx, "select", customId, selectHandlers);
    await settled();

    // Omitting policy_out would reset it to the schema default rather than
    // leaving it alone.
    expect(
      calls.find((call) => call.method === "firewall.options.update")?.input,
    ).toEqual({
      server_id: SERVER,
      policy_in: "REJECT",
      policy_out: "ACCEPT",
    });
  });

  test("deleting a rule re-reads the digest Proxmox is expecting", async () => {
    const { calls } = await press(`button:firewall:delete:${SERVER}|3`, {
      results: {
        "firewall.rules.list": {
          rules: [{ pos: 3, action: "ACCEPT", digest: "fresh-digest" }],
        },
      },
    });

    expect(
      calls.find((call) => call.method === "firewall.rules.delete")?.input,
    ).toEqual({ server_id: SERVER, pos: 3, digest: "fresh-digest" });
  });

  test("a rule that vanished between drawing and clicking is reported", async () => {
    const { settled } = await press(`button:firewall:delete:${SERVER}|3`, {
      results: { "firewall.rules.list": { rules: [] } },
    });

    expect(textOf(settled)).toContain("That did not work");
  });
});

describe("rdns", () => {
  test("saving a record upserts by address", async () => {
    const customId = `modal:rdns:save:${SERVER}`;
    const { port, calls } = fakePort();
    const { ctx, settled } = testContext({
      interaction: {
        data: modalData(customId, {
          ip: "192.0.2.10",
          hostname: "vm01.example.com",
        }),
      },
      servers: port,
    });

    await runComponent(ctx, "modal", customId, modalHandlers);
    await settled();

    expect(calls[0]).toEqual({
      method: "rdns.upsert",
      actor: { userId: "usr_1" },
      input: {
        server_id: SERVER,
        ip: "192.0.2.10",
        hostname: "vm01.example.com",
      },
    });
  });
});

describe("lifecycle", () => {
  test("reinstalling asks twice and only then destroys the disk", async () => {
    const customId = `select:lifecycle:reinstall-pick:${SERVER}`;
    const { port, calls } = fakePort();
    const { ctx } = testContext({
      interaction: { data: selectData(customId, ["temp_1"]) },
      servers: port,
    });

    const first = await runComponent(ctx, "select", customId, selectHandlers);

    expect(calls).toEqual([]);
    expect(textOf(first)).toContain("Reinstall this server?");

    // Second step: the password form, still without a call.
    const second = await press(
      `button:lifecycle:reinstall-confirm:${SERVER}|temp_1`,
    );
    expect(second.immediate.type).toBe(InteractionResponseType.Modal);
    expect(second.calls).toEqual([]);
  });

  test("only the submitted form actually reinstalls", async () => {
    const customId = `modal:lifecycle:reinstall:${SERVER}|temp_1`;
    const { port, calls } = fakePort();
    const { ctx, settled } = testContext({
      interaction: { data: modalData(customId, { password: "Sup3rSecret" }) },
      servers: port,
    });

    await runComponent(ctx, "modal", customId, modalHandlers);
    await settled();

    expect(calls[0]).toEqual({
      method: "lifecycle.changeTemplate",
      actor: { userId: "usr_1" },
      input: {
        server_id: SERVER,
        template_id: "temp_1",
        root_password: "Sup3rSecret",
      },
    });
  });

  test("changing one firmware setting preserves the other", async () => {
    const customId = `select:lifecycle:bios:${SERVER}`;
    const { port, calls } = fakePort({
      "lifecycle.advanced.get": { settings: { bios: "legacy", tpm: "v2.0" } },
    });
    const { ctx, settled } = testContext({
      interaction: { data: selectData(customId, ["uefi"]) },
      servers: port,
    });

    await runComponent(ctx, "select", customId, selectHandlers);
    await settled();

    // Omitting `tpm` would clear it — silently removing a server's TPM because
    // somebody changed its BIOS.
    expect(
      calls.find((call) => call.method === "lifecycle.advanced.update")?.input,
    ).toEqual({ server_id: SERVER, bios: "uefi", tpm: "v2.0" });
  });

  test("the select's `none` becomes a real null", async () => {
    const customId = `select:lifecycle:tpm:${SERVER}`;
    const { port, calls } = fakePort({
      "lifecycle.advanced.get": { settings: { bios: "uefi", tpm: "v2.0" } },
    });
    const { ctx, settled } = testContext({
      interaction: { data: selectData(customId, ["none"]) },
      servers: port,
    });

    await runComponent(ctx, "select", customId, selectHandlers);
    await settled();

    expect(
      calls.find((call) => call.method === "lifecycle.advanced.update")?.input,
    ).toEqual({ server_id: SERVER, bios: "uefi", tpm: null });
  });

  test("renaming sends the trimmed name", async () => {
    const customId = `modal:lifecycle:rename:${SERVER}`;
    const { port, calls } = fakePort();
    const { ctx, settled } = testContext({
      interaction: { data: modalData(customId, { name: "  web-01  " }) },
      servers: port,
    });

    await runComponent(ctx, "modal", customId, modalHandlers);
    await settled();

    expect(calls[0]?.input).toEqual({ server_id: SERVER, name: "web-01" });
  });
});

describe("errors", () => {
  test("a port failure becomes a message, not a permanent 'thinking…'", async () => {
    const { settled } = await press(`button:servers:overview:${SERVER}`, {
      results: {
        get: new ServerManagementError("not_found", "gone"),
      },
    });

    expect(textOf(settled)).toContain("That server no longer exists.");
  });

  test("an unexpected failure does not leak its message to the customer", async () => {
    const { settled } = await press(`button:servers:overview:${SERVER}`, {
      results: { get: new Error("connection string: postgres://user:pw@host") },
    });

    const text = textOf(settled);
    expect(text).not.toContain("postgres://");
    expect(text).toContain("Something went wrong");
  });
});

describe("regressions", () => {
  test("the power menu only offers emoji Discord will render", async () => {
    // `⏻` (U+23FB) is a technical symbol, not an emoji. Discord answered
    // COMPONENT_INVALID_EMOJI and discarded the whole message, which the
    // customer saw as "did not respond in time".
    const { isRenderableEmoji } = await import("../../ui/emoji");
    const { settled } = await press(`button:power:menu:${SERVER}`);

    const emojis = componentsOf(settled)
      .map((component) => (component as { emoji?: { name?: string } }).emoji)
      .filter((emoji): emoji is { name: string } => Boolean(emoji?.name));

    expect(emojis.length).toBeGreaterThan(0);
    for (const emoji of emojis) {
      expect(isRenderableEmoji(emoji.name), emoji.name).toBe(true);
    }
  });

  test("the installer screen says what is mounted", async () => {
    const { settled } = await press(`button:lifecycle:iso:${SERVER}`, {
      results: {
        "mounts.list": {
          iso_downloads: [
            {
              id: "pid_1",
              name: "alpine.iso",
              finished_at: new Date(),
              failed_at: null,
              expires_at: new Date(),
            },
          ],
          meta: { pagination: { page: 1, per_page: 25, last_page: 1 } },
        },
        get: {
          server: { id: SERVER, mount: { id: "pid_1", name: "alpine.iso" } },
        },
      },
    });

    expect(textOf(settled)).toContain("is mounted");
  });

  test("unmount is not offered when nothing is attached", async () => {
    const { settled } = await press(`button:lifecycle:iso:${SERVER}`, {
      results: { get: { server: { id: SERVER, mount: null } } },
    });

    const unmount = componentsOf(settled).find(
      (component) =>
        component.custom_id === `button:lifecycle:unmount:${SERVER}`,
    );
    expect(unmount?.disabled).toBe(true);
  });

  test("a plan with less storage is not offered as an upgrade", async () => {
    // The portal disables those rows: a provisioned disk cannot shrink, so
    // listing them under "upgrades" offered something nobody could buy.
    const { settled } = await press(`button:lifecycle:plan:${SERVER}`, {
      results: {
        "lifecycle.plan": {
          plans: [
            {
              id: "pl_now",
              name: "Medium",
              current: true,
              available: true,
              cores: 4,
              memory: 8192,
              storage: 160,
              price: 2000,
              purchase_price: 2000,
              renewal_price: 2000,
              upgrade_price: null,
              purchase_discount: null,
              renewal_discount: null,
            },
            {
              id: "pl_small",
              name: "Small",
              current: false,
              available: true,
              cores: 2,
              memory: 4096,
              storage: 80,
              price: 1000,
              purchase_price: 1000,
              renewal_price: 1000,
              upgrade_price: 100,
              purchase_discount: null,
              renewal_discount: null,
            },
            {
              id: "pl_big",
              name: "Large",
              current: false,
              available: true,
              cores: 8,
              memory: 16384,
              storage: 320,
              price: 4000,
              purchase_price: 4000,
              renewal_price: 4000,
              upgrade_price: 2000,
              purchase_discount: null,
              renewal_discount: null,
            },
          ],
        },
      },
    });

    const text = textOf(settled);
    expect(text).toContain("Large");
    expect(text).not.toContain("Small");
  });
});

describe("stats", () => {
  /** The timeframe a run actually asked the port for. */
  const requestedTimeframe = (calls: { method: string; input: unknown }[]) => {
    const call = calls.find((entry) => entry.method === "graphs.get");
    if (!call) throw new Error("no graphs.get call was made");

    return (call.input as { timeframe: string }).timeframe;
  };

  const series = Array.from({ length: 60 }, (_, i) => ({
    cpu: 0.1 + (i % 10) / 100,
    mem: 1_000_000_000,
    maxmem: 8_000_000_000,
    diskread: 0,
    diskwrite: 0,
    netin: i * 1000,
    netout: i * 500,
    time: 1_700_000_000 + i * 60,
  }));

  test("it asks for the default timeframe and draws a chart", async () => {
    const { settled, calls } = await press(`button:stats:show:${SERVER}`, {
      results: {
        get: { server: { id: SERVER, name: "web-01" } },
        "graphs.get": { data: series },
      },
    });

    expect(calls.find((call) => call.method === "graphs.get")?.input).toEqual({
      server_id: SERVER,
      timeframe: "day",
      cf: "AVERAGE",
    });

    const text = textOf(settled);
    expect(text).toContain("web-01");
    // The block characters are the chart.
    expect(/[▁▂▃▄▅▆▇█]/.test(text)).toBe(true);
  });

  test("the timeframe carried by the button is the one requested", async () => {
    const { calls } = await press(`button:stats:show:${SERVER}|week`, {
      results: { "graphs.get": { data: series } },
    });

    expect(requestedTimeframe(calls)).toBe("week");
  });

  test("choosing a timeframe re-reads that period", async () => {
    const customId = `select:stats:timeframe:${SERVER}`;
    const { port, calls } = fakePort({
      get: { server: { id: SERVER, name: "web-01" } },
      "graphs.get": { data: series },
    });
    const { ctx, settled } = testContext({
      interaction: { data: selectData(customId, ["hour"]) },
      servers: port,
    });

    await runComponent(ctx, "select", customId, selectHandlers);
    await settled();

    expect(requestedTimeframe(calls)).toBe("hour");
  });

  test("a server with no samples says so instead of drawing an empty chart", async () => {
    const { settled } = await press(`button:stats:show:${SERVER}`, {
      results: {
        get: { server: { id: SERVER, name: "web-01" } },
        "graphs.get": { data: [] },
      },
    });

    expect(textOf(settled)).toContain("No data for this period");
  });

  test("a nonsense timeframe in a stale custom id falls back rather than failing", async () => {
    const { calls } = await press(`button:stats:show:${SERVER}|decade`, {
      results: { "graphs.get": { data: series } },
    });

    expect(requestedTimeframe(calls)).toBe("day");
  });
});
