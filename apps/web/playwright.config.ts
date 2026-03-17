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

//import "dotenv/config";

import { defineConfig, devices } from "@playwright/test";
import { APP_DOMAIN } from "@virtbase/utils";

const PORT = 3000;
const BASE_URL = process.env.BASE_URL || APP_DOMAIN;

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
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
    // Public pages without authentication
    {
      name: "public",
      testDir: "./e2e/public",
      testMatch: /.*\.e2e\.ts/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    /*{ name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      testMatch: /.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },*/
  ],
  webServer: !process.env.CI
    ? {
        command: `next dev --turbo --port ${PORT}`,
        timeout: 120 * 1000,
        port: PORT,
        reuseExistingServer: !process.env.CI,
      }
    : undefined,
});
