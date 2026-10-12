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

import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { IncomingHttpHeaders } from "node:http";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Locator, Page, Response } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { adminUrl } from "./urls";

/** The admin session the setup project writes; the `integrations` project uses it too. */
export const ADMIN_STORAGE_STATE = "e2e/.auth/admin.json";

/**
 * The `.env` the web server loads through `bun with-env`. Node APIs rather
 * than Bun's, because Playwright runs this module under Node.
 */
const ENV_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../.env",
);

const MISSING_KEY =
  "CONFIG_ENCRYPTION_KEY is not set in the repository .env, so the web server " +
  "cannot store integration configuration. Add a test-only key from " +
  "`openssl rand -base64 32`.";

const hasConfigEncryptionKey = async (): Promise<boolean> => {
  let raw: string;
  try {
    raw = await readFile(ENV_FILE, "utf8");
  } catch {
    return false;
  }

  return raw
    .split("\n")
    .some((line) => /^\s*CONFIG_ENCRYPTION_KEY\s*=\s*\S/.test(line));
};

/**
 * Skips the calling group when the web server has no configuration store, and
 * fails it under CI instead: `e2e.yml` writes a test key, so a missing one there
 * is a broken workflow rather than a local setup without integrations.
 */
export const requireConfigStore = async () => {
  const configured = await hasConfigEncryptionKey();
  if (!configured && process.env.CI) throw new Error(MISSING_KEY);
  test.skip(!configured, MISSING_KEY);
};

/** A fresh value for a secret field; never a real credential. */
export const testSecret = (label: string) =>
  `e2e-${label}-${randomBytes(16).toString("hex")}`;

/** One request a {@link FakeProvider} received. */
export interface RecordedRequest {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: string;
}

/**
 * An HTTP server on loopback that stands in for a provider. The web server runs
 * on the same host as Playwright, so an integration pointed at {@link url}
 * reaches this process and nothing outside it.
 */
export interface FakeProvider {
  url: string;
  requests: RecordedRequest[];
  close(): Promise<void>;
}

export const startFakeProvider = async (
  respond: (request: RecordedRequest) => { status: number; json?: unknown },
): Promise<FakeProvider> => {
  const requests: RecordedRequest[] = [];

  const server = createServer((incoming, outgoing) => {
    const chunks: Buffer[] = [];
    incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
    incoming.on("end", () => {
      const request: RecordedRequest = {
        method: incoming.method ?? "GET",
        path: incoming.url ?? "/",
        headers: incoming.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      };
      requests.push(request);

      const { status, json } = respond(request);
      outgoing.writeHead(status, { "content-type": "application/json" });
      outgoing.end(JSON.stringify(json ?? {}));
    });
  });

  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const address = server.address();
  if (null === address || "string" === typeof address) {
    throw new Error("The fake provider is not listening on a TCP port.");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
};

const isServerAction = (response: Response) =>
  "POST" === response.request().method() &&
  undefined !== response.request().headers()["next-action"];

/**
 * Runs `trigger` and waits for the server action it posts. The admin forms show
 * no message on success, so the response is the only signal that the write
 * finished.
 */
export const runServerAction = async (
  page: Page,
  trigger: () => Promise<void>,
) => {
  await Promise.all([page.waitForResponse(isServerAction), trigger()]);
};

/** A card on an admin page, found by its exact title. */
export const adminCard = (page: Page, title: string): Locator =>
  page.locator('[data-slot="card"]').filter({
    has: page
      .locator('[data-slot="card-title"]')
      .getByText(title, { exact: true }),
  });

/**
 * Opens an admin page and waits for the network to go idle. The forms on it are
 * client components, and a click or a fill that lands before they hydrate is
 * lost: the click posts no server action and React resets the field.
 */
export const openAdminPage = async (page: Page, path: string) => {
  const response = await page.goto(adminUrl(path), {
    waitUntil: "networkidle",
  });
  expect(response?.status()).toBe(200);
};

export const openIntegration = (page: Page, integrationId: string) =>
  openAdminPage(page, `/integrations/${integrationId}`);

/** Fills text fields of the Settings card by label and saves them. */
export const saveSettings = async (
  page: Page,
  values: Record<string, string>,
) => {
  const card = adminCard(page, "Settings");
  for (const [label, value] of Object.entries(values)) {
    await card.getByLabel(label, { exact: true }).fill(value);
  }
  await runServerAction(page, () =>
    card.getByRole("button", { name: "Save", exact: true }).click(),
  );
};

/** Picks an option of a select field in the Settings card. */
export const chooseSetting = async (
  page: Page,
  label: string,
  option: string,
) => {
  await adminCard(page, "Settings").getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
};

/**
 * Saves secret fields by label, then checks the form is write-only: every field
 * is emptied and marked as stored, and the value is not served back.
 */
export const saveSecrets = async (
  page: Page,
  values: Record<string, string>,
) => {
  const card = adminCard(page, "Secrets");
  for (const [label, value] of Object.entries(values)) {
    await card.getByLabel(label, { exact: true }).fill(value);
  }
  await runServerAction(page, () =>
    card.getByRole("button", { name: "Save", exact: true }).click(),
  );

  for (const label of Object.keys(values)) {
    const field = card.getByLabel(label, { exact: true });
    await expect(field).toHaveValue("");
    await expect(field).toHaveAttribute("placeholder", /leave blank to keep/);
  }
};

/**
 * Asserts that no secret appears in the integration's admin page, neither in
 * its HTML nor in its RSC payload.
 */
export const expectSecretsNotServed = async (
  page: Page,
  integrationId: string,
  secrets: string[],
) => {
  const url = adminUrl(`/integrations/${integrationId}`);
  const html = await page.request.get(url);
  // Next answers an `RSC: 1` request without the `_rsc` parameter with a
  // redirect that adds it, so the parameter is sent up front.
  const rsc = await page.request.get(`${url}?_rsc=e2e`, {
    headers: { RSC: "1" },
  });

  expect(html.status()).toBe(200);
  expect(rsc.status()).toBe(200);
  expect(rsc.headers()["content-type"]).toContain("text/x-component");

  const bodies = [await html.text(), await rsc.text()];
  for (const secret of secrets) {
    for (const body of bodies) expect(body).not.toContain(secret);
  }
};

export const setIntegrationEnabled = async (page: Page, enabled: boolean) => {
  await page
    .getByRole("button", { name: enabled ? "Enable" : "Disable", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: enabled ? "Disable" : "Enable",
      exact: true,
    }),
  ).toBeVisible();
};

export const recheckHealth = async (page: Page) => {
  await runServerAction(page, () =>
    adminCard(page, "Status")
      .getByRole("button", { name: "Re-check", exact: true })
      .click(),
  );
};

/** The message of the last health probe, rendered only when it has one. */
export const healthMessage = (page: Page): Locator =>
  adminCard(page, "Status").locator("code");

/**
 * Switches an integration off when an earlier, interrupted run left it on, so
 * every run starts and ends with the integration disabled.
 */
export const ensureIntegrationDisabled = async (
  browser: Browser,
  integrationId: string,
) => {
  const context = await browser.newContext({
    storageState: ADMIN_STORAGE_STATE,
  });
  try {
    const page = await context.newPage();
    await openIntegration(page, integrationId);

    const disable = page.getByRole("button", { name: "Disable", exact: true });
    const enable = page.getByRole("button", { name: "Enable", exact: true });
    await expect(disable.or(enable)).toBeVisible();

    if (await disable.isVisible()) await setIntegrationEnabled(page, false);
  } finally {
    await context.close();
  }
};
