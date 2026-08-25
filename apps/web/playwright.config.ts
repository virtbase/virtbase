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

import { defineConfig, devices } from "@playwright/test";
import { appOrigin } from "./e2e/support/urls";

const PORT = Number(process.env.E2E_PORT ?? 3000);

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // The HTML report embeds the traces, videos and screenshots, so it is the one
  // artifact worth downloading. `github` adds inline annotations on the PR diff.
  // If this suite is ever sharded, add `["blob"]` here and a merge step - blob
  // reports are the only ones that combine across shards.
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["github"]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    // Specs build absolute URLs through `e2e/support/urls.ts` because the app is
    // three hostnames, not one. `baseURL` is set anyway so Playwright's trace
    // viewer and `page.goto("/")` behave sensibly.
    baseURL: appOrigin,
    // `retain-on-failure` rather than Playwright's usual `on-first-retry`:
    // `retries` is 0 outside CI, so there is no retry to attach a trace to and a
    // local failure would produce nothing to look at. This records every test
    // and throws the recording away when it passes, which costs a little time
    // and means a failure is always reproducible in the trace viewer.
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    // Bypass Vercel Deployment Protection when running E2E against protected deployments
    ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET && {
      extraHTTPHeaders: {
        "x-vercel-protection-bypass":
          process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
        "x-vercel-set-bypass-cookie": "true",
      },
    }),
  },
  projects: [
    // Seeds the database and mints session cookies for the two roles below.
    { name: "setup", testMatch: /.*\.setup\.ts/ },

    // Public pages, no session.
    {
      name: "public",
      testDir: "./e2e/public",
      testMatch: /.*\.e2e\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },

    {
      name: "app",
      testDir: "./e2e/app",
      testMatch: /.*\.e2e\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/customer.json",
      },
    },

    // Only meaningful against the local Proxmox cluster; the specs skip
    // themselves when `tooling/proxmox-cluster/cluster.json` is absent or the
    // cluster does not answer. No `storageState` - these drive the API directly
    // rather than the browser.
    {
      name: "proxmox",
      testDir: "./e2e/proxmox",
      testMatch: /.*\.e2e\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },

    {
      name: "admin",
      testDir: "./e2e/admin",
      testMatch: /.*\.e2e\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/admin.json",
      },
    },
  ],
  webServer: process.env.E2E_SKIP_WEB_SERVER
    ? undefined
    : {
        command: `bun with-env next dev --turbo --port ${PORT}`,
        timeout: 240 * 1000,
        port: PORT,
        reuseExistingServer: !process.env.CI,
        stdout: "pipe",
        stderr: "pipe",
      },
});
