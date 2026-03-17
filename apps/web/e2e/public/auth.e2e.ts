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

import { expect, test } from "@playwright/test";
import { APP_DOMAIN } from "@virtbase/utils";

test("it should render the login page", async ({ page }) => {
  await page.goto(`${APP_DOMAIN}/login`, { waitUntil: "domcontentloaded" });

  // Wait for the animation to finish
  await page.waitForSelector(
    '[data-testid="client-only"][style="opacity: 1;"]',
  );

  await expect(page.getByTestId("logo-link")).toBeVisible();
  await expect(page.getByTestId("terms")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("sign-in-email-password-button")).toBeVisible();

  const emailInput = page.getByTestId("email-input");
  await expect(emailInput).toBeVisible();
  await expect(emailInput).toBeEditable();
  await expect(emailInput).toHaveAttribute("placeholder");

  // Email input can be focused and clicked
  await emailInput.click();
  await expect(emailInput).toBeFocused();
});

test.describe("register page", () => {
  test("it should render the register page", async ({ page }) => {
    await page.goto(`${APP_DOMAIN}/register`, {
      waitUntil: "domcontentloaded",
    });

    // Wait for the animation to finish
    await page.waitForSelector(
      '[data-testid="client-only"][style="opacity: 1;"]',
    );

    await expect(page.getByTestId("logo-link")).toBeVisible();
    await expect(page.getByTestId("terms")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByTestId("sign-up-email-password-button"),
    ).toBeVisible();
  });
});

test.describe("forgot password page", () => {
  test("it should render the forgot password page", async ({ page }) => {
    await page.goto(`${APP_DOMAIN}/forgot-password`, {
      waitUntil: "domcontentloaded",
    });

    // Wait for the animation to finish
    await page.waitForSelector(
      '[data-testid="client-only"][style="opacity: 1;"]',
    );

    await expect(page.getByTestId("logo-link")).toBeVisible();
    await expect(page.getByTestId("terms")).not.toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("input")).toBeVisible();
    await expect(page.getByTestId("input")).toBeEditable();
    await expect(page.getByTestId("forgot-password-button")).toBeVisible();
  });
});

test.describe("reset password page", () => {
  test("it redirect to login page if no token is provided", async ({
    page,
  }) => {
    await page.goto(`${APP_DOMAIN}/reset-password`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page).toHaveURL(`${APP_DOMAIN}/login`);
  });

  test("it should render the reset password page if a token is provided", async ({
    page,
  }) => {
    await page.goto(`${APP_DOMAIN}/reset-password?token=1234567890`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page).toHaveURL(
      `${APP_DOMAIN}/reset-password?token=1234567890`,
    );

    // Wait for the animation to finish
    await page.waitForSelector(
      '[data-testid="client-only"][style="opacity: 1;"]',
    );

    await expect(page.getByTestId("logo-link")).toBeVisible();
    await expect(page.getByTestId("terms")).not.toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("password-input")).toBeVisible();
    await expect(page.getByTestId("password-input")).toBeEditable();
    await expect(page.getByTestId("confirm-password-input")).toBeVisible();
    await expect(page.getByTestId("confirm-password-input")).toBeEditable();
    await expect(page.getByTestId("reset-password-button")).toBeVisible();
  });
});
