/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { chromium } from "@playwright/test";
import type { Locale } from "next-intl";
import sharp from "sharp";
import { sessionCookies } from "../../e2e/support/auth.ts";
import { locales } from "../../src/i18n/config.ts";
import {
  ACCOUNT_PASSWORD,
  CASE_ID,
  clearExports,
  getAccount,
  PLAN_ID,
  prepareAbuseCase,
  prepareGuest,
  prepareServer,
  SERVER_ID,
  setAccountLocale,
  setBilling,
  setFirewall,
} from "./lib/fixtures.ts";

/**
 * Takes the screenshots of the help articles, in every language, against the
 * local cluster and the demo server.
 *
 *   bun script video/prepare            (once: the demo server)
 *   bun script help/screenshots
 *   bun script help/screenshots --locale=de --only=create-backup-dialog
 *
 * Each picture is cropped to what the article is about - a dialog, a card, a
 * row of buttons - with a margin, taken at twice the pixel density and saved
 * as WebP next to the articles of its language. The labels the script clicks
 * are looked up in the language's catalog, so the same steps work in all of
 * them. The Next.js dev indicator is hidden, and animations are switched off
 * so nothing is caught halfway.
 */

const APP = "http://app.virtbase.localhost:3000";
const SITE = "http://virtbase.localhost:3000";
const ARTICLES = resolve(
  import.meta.dir,
  "../../../../packages/content/help/articles",
);
const SERVER = `${APP}/servers/${SERVER_ID}`;

/** Widest picture written: twice the width of the article column. */
const MAX_WIDTH = 1600;
const MARGIN = 16;
const VIEWPORT = { width: 1440, height: 1000 };

const STYLE = [
  "nextjs-portal{display:none!important}",
  "*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}",
  "[data-sonner-toaster]{display:none!important}",
  // Behind a dialog, the page is just background: the margin around a dialog
  // shows nothing of what it covers.
  '[data-slot="dialog-overlay"]{background:var(--background)!important;backdrop-filter:none!important}',
].join("\n");

const args = process.argv.slice(2);
const option = (name: string) =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
const only = option("only")?.split(",");
const selectedLocales = (option("locale")?.split(",") ?? locales) as Locale[];

/** The catalog of a language, English source text to translation. */
async function catalog(locale: Locale) {
  const po = await Bun.file(
    resolve(import.meta.dir, `../../src/i18n/messages/${locale}.po`),
  ).text();
  const text = (block: string) =>
    [...block.matchAll(/"((?:[^"\\]|\\.)*)"/g)]
      .map((m) => m[1])
      .join("")
      .replace(/\\"/g, '"');
  const map = new Map<string, string>();
  for (const entry of po.split("\n\n")) {
    const id = entry.match(/^msgid ((?:".*"\n?)+)/m)?.[1];
    const str = entry.match(/^msgstr ((?:".*"\n?)+)/m)?.[1];
    if (id) map.set(text(id), (str && text(str)) || text(id));
  }
  return (source: string) => map.get(source) ?? source;
}

type Shot = {
  name: string;
  /** A different window size, for pages that fill the window. */
  viewport?: { width: number; height: number };
  /** Applies the database or cluster state the picture needs. */
  setup?: (ctx: Context) => Promise<void>;
  /** Navigates and acts, then returns what to photograph. */
  take: (ctx: Context) => Promise<Locator | Locator[]>;
};

type Context = {
  page: Page;
  locale: Locale;
  userId: string;
  t: (source: string) => string;
};

async function open(page: Page, url: string) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: STYLE });
}

const dialog = (page: Page) => page.getByRole("dialog").last();

/** Fills a field found by its visible label. */
async function fill(scope: Locator | Page, label: string, value: string) {
  await scope.getByLabel(label, { exact: true }).fill(value);
}

async function stepUp(page: Page, t: Context["t"]) {
  const confirm = page
    .getByRole("dialog")
    .filter({ hasText: t("Confirm It's You") });
  await confirm.waitFor();
  // The dialog first asks for a method; the password is the first.
  await confirm
    .getByRole("button", { name: t("Use"), exact: true })
    .first()
    .click();
  await confirm.locator('input[type="password"]').fill(ACCOUNT_PASSWORD);
  await confirm.getByRole("button", { name: t("Confirm") }).click();
}

const EXAMPLES: Record<Locale, { backup: string; apiKey: string }> = {
  en: { backup: "Before upgrade", apiKey: "Backup script" },
  de: { backup: "Vor dem Upgrade", apiKey: "Backup-Skript" },
  fr: { backup: "Avant la mise à niveau", apiKey: "Script de sauvegarde" },
  nl: { backup: "Voor de upgrade", apiKey: "Back-upscript" },
};

const card = (page: Page, text: string) =>
  page.locator('[data-slot="card"]').filter({ hasText: text }).first();

/** The dialog that opened last, once it has settled. */
async function openedDialog(page: Page) {
  const found = dialog(page);
  await found.waitFor();
  await page.waitForTimeout(300);
  return found;
}

/** Picks an option from a select or combobox by its visible text. */
async function choose(page: Page, trigger: Locator, option: string | RegExp) {
  await trigger.click();
  await page.getByRole("option", { name: option }).first().click();
}

/** The operating system picker opens a searchable list. */
async function chooseOs(page: Page, scope: Locator, t: Context["t"]) {
  await choose(
    page,
    scope
      .getByText(t("Select an operating system..."), { exact: true })
      .first(),
    /Debian 13/,
  );
}

const shots: Shot[] = [
  {
    name: "server-overview-status",
    take: async ({ page }) => {
      await open(page, `${SERVER}/overview`);
      return page
        .locator("header")
        .filter({ has: page.locator('[data-slot="button-group"]') })
        .first();
    },
  },
  {
    name: "server-overview-addresses",
    take: async ({ page }) => {
      await open(page, `${SERVER}/overview`);
      return card(page, "IPv4");
    },
  },
  {
    name: "console-login",
    take: async ({ page }) => {
      await open(page, `${SERVER}/console`);
      const frame = page.locator('iframe[title="noVNC"]');
      await frame.waitFor();
      const canvas = page
        .frameLocator('iframe[title="noVNC"]')
        .locator("canvas")
        .first();
      await canvas.waitFor({ timeout: 30_000 });
      // `prepareGuest` restarted getty, so the screen holds one fresh login prompt.
      await page.waitForTimeout(3000);
      return frame;
    },
  },
  {
    name: "firewall-rules",
    setup: () => setFirewall("basic"),
    take: async ({ page, t }) => {
      await open(page, `${SERVER}/firewall`);
      return [
        card(page, t("Incoming packets")),
        card(page, t("Firewall Rules")),
      ];
    },
  },
  {
    name: "firewall-rule-order",
    setup: () => setFirewall("order"),
    take: async ({ page, t }) => {
      await open(page, `${SERVER}/firewall`);
      return card(page, t("Firewall Rules"));
    },
  },
  {
    name: "checkout-configuration",
    take: async ({ page, locale, t }) => {
      await open(page, `${SITE}/${locale}/checkout/${PLAN_ID}`);
      const form = page.locator("form").first();
      await chooseOs(page, form, t);
      return form;
    },
  },
  {
    name: "abuse-case",
    setup: async ({ userId, locale }) => {
      await prepareAbuseCase(userId, locale);
    },
    viewport: { width: 1440, height: 620 },
    take: async ({ page }) => {
      await open(page, `${APP}/abuse/${CASE_ID}`);
      // The case fills the window; a low one keeps it compact. From the title
      // row down to the reply box.
      return [
        page.locator("h1").locator(".."),
        page.locator('[data-slot="input-group"]'),
      ];
    },
  },
  {
    name: "create-custom-image-dialog",
    take: async ({ page, t }) => {
      await open(page, `${APP}/account/settings/custom-images`);
      await page
        .getByRole("button", { name: t("Create Custom Image") })
        .first()
        .click();
      return openedDialog(page);
    },
  },
  {
    name: "mount-iso-dialog",
    take: async ({ page, t }) => {
      await open(page, `${SERVER}/overview`);
      await page
        .locator(
          '[data-slot="button-group"] [data-slot="dropdown-menu-trigger"]',
        )
        .click();
      await page.getByRole("menuitem", { name: t("Mount ISO") }).click();
      const found = await openedDialog(page);
      return found;
    },
  },
  {
    name: "upgrade-dialog",
    setup: ({ userId }) => setBilling(userId, "manual"),
    take: async ({ page, t }) => {
      await open(page, `${SERVER}/plan`);
      // Smaller plans offer a disabled "Upgrade"; the first enabled one opens.
      await page
        .getByRole("button", { name: t("Upgrade"), exact: true })
        .and(page.locator(":enabled"))
        .first()
        .click();
      return openedDialog(page);
    },
  },
  {
    name: "plan-extend",
    setup: ({ userId }) => setBilling(userId, "manual"),
    take: async ({ page, t }) => {
      await open(page, `${SERVER}/plan`);
      return [
        card(page, t("Automatic renewal")),
        card(page, t("Current plan")),
      ];
    },
  },
  {
    name: "plan-payment-failed",
    setup: ({ userId }) => setBilling(userId, "past-due"),
    take: async ({ page, t }) => {
      await open(page, `${SERVER}/plan`);
      const alert = page
        .getByRole("alert")
        .filter({ hasText: t("A payment for this server failed") });
      await alert.waitFor();
      return alert;
    },
  },
  {
    name: "create-backup-dialog",
    take: async ({ page, locale, t }) => {
      await open(page, `${SERVER}/backups`);
      await card(page, t("Backups"))
        .locator('[data-slot="card-header"] button')
        .first()
        .click();
      const found = await openedDialog(page);
      await fill(found, t("Name"), EXAMPLES[locale].backup);
      return found;
    },
  },
  {
    name: "restore-backup-dialog",
    setup: async ({ page, locale, t }) => {
      // A restore needs a finished backup; the first run takes one.
      await open(page, `${SERVER}/backups`);
      if ((await page.locator("table tbody tr td").count()) > 1) return;
      await card(page, t("Backups"))
        .locator('[data-slot="card-header"] button')
        .first()
        .click();
      const create = await openedDialog(page);
      await fill(create, t("Name"), EXAMPLES[locale].backup);
      await create
        .getByRole("button", { name: t("Create Backup") })
        .last()
        .click();
      for (let attempt = 0; attempt < 60; attempt++) {
        await page.waitForTimeout(5000);
        await open(page, `${SERVER}/backups`);
        const status = await page.locator("table tbody tr").first().innerText();
        if (!status.includes(t("Creating..."))) return;
      }
      throw new Error("the backup did not finish");
    },
    take: async ({ page, t }) => {
      await open(page, `${SERVER}/backups`);
      await page
        .locator("table tbody tr")
        .first()
        .getByRole("button")
        .last()
        .click();
      await page.getByRole("menuitem", { name: t("Restore") }).click();
      return openedDialog(page);
    },
  },
  {
    name: "create-api-key-dialog",
    take: async ({ page, locale, t }) => {
      await open(page, `${APP}/account/settings/api`);
      await page
        .getByRole("button", { name: t("Create API key") })
        .first()
        .click();
      const found = await openedDialog(page);
      await fill(found, t("Name"), EXAMPLES[locale].apiKey);
      // What a backup script needs: read servers, read and write backups.
      const toggles = found.locator('[data-slot="toggle-group-item"]');
      for (const index of [0, 2, 3]) await toggles.nth(index).click();
      return found;
    },
  },
  {
    name: "reset-password-dialog",
    take: async ({ page, t }) => {
      await open(page, `${SERVER}/overview`);
      await page
        .getByRole("button", { name: t("Reset Password") })
        .first()
        .click();
      const found = await openedDialog(page);
      await fill(found, t("Username"), "root");
      await fill(found, t("New Password"), "Example-Passw0rd");
      return found;
    },
  },
  {
    name: "rdns-dialog",
    take: async ({ page, t }) => {
      await open(page, `${SERVER}/rdns`);
      await card(page, t("PTR Records"))
        .locator('[data-slot="card-header"] button')
        .first()
        .click();
      const found = await openedDialog(page);
      await fill(found, t("IP Address"), "203.0.113.10");
      await fill(found, t("Hostname"), "mail.example.com");
      return found;
    },
  },
  {
    name: "two-factor-dialog",
    take: async ({ page, t }) => {
      await open(page, `${APP}/account/settings/authentication`);
      await page
        .getByRole("button", { name: t("Set Up") })
        .first()
        .click();
      const confirm = await openedDialog(page);
      await confirm.locator('input[type="password"]').fill(ACCOUNT_PASSWORD);
      await confirm
        .getByRole("button", { name: t("Confirm Password") })
        .or(confirm.locator('button[type="submit"]'))
        .first()
        .click();
      const found = page
        .getByRole("dialog")
        .filter({ hasText: t("Set Up Authenticator App") });
      await found.waitFor();
      await page.waitForTimeout(500);
      return found;
    },
  },
  {
    name: "change-os-dialog",
    take: async ({ page, t }) => {
      await open(page, `${SERVER}/overview`);
      await page
        .getByRole("button", { name: t("Change Operating System") })
        .first()
        .click();
      const found = await openedDialog(page);
      await chooseOs(page, found, t);
      await fill(found, t("New Root Password"), "Example-Passw0rd");
      return found;
    },
  },
  {
    name: "auto-renew-agreement",
    setup: ({ userId }) => setBilling(userId, "card"),
    take: async ({ page }) => {
      await open(page, `${SERVER}/plan`);
      await page.getByRole("switch").first().click();
      return openedDialog(page);
    },
  },
  {
    name: "export-passphrase",
    setup: ({ userId }) => clearExports(userId),
    take: async ({ page, t }) => {
      await open(page, `${APP}/account/settings/privacy`);
      await page.getByRole("button", { name: t("Request Export") }).click();
      // A session that re-authenticated a moment ago skips the check.
      const passphrase = page.getByText(t("Save this passphrase now"), {
        exact: true,
      });
      const challenge = page
        .getByRole("dialog")
        .filter({ hasText: t("Confirm It's You") });
      await passphrase.or(challenge).waitFor();
      if (await challenge.isVisible()) await stepUp(page, t);
      // The passphrase is shown inside the card, once.
      await passphrase.waitFor();
      return card(page, t("Download Your Data"));
    },
  },
  {
    name: "delete-account-card",
    take: async ({ page, t }) => {
      await open(page, `${APP}/account/settings/privacy`);
      return card(page, t("Delete Your Account"));
    },
  },
];

async function save(target: Locator | Locator[], locale: Locale, name: string) {
  const targets = Array.isArray(target) ? target : [target];
  const [first] = targets;
  if (!first) throw new Error(`${name}: nothing to capture`);
  const page = first.page();
  await first.scrollIntoViewIfNeeded();
  // No caret or focus ring in the picture.
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  await page.waitForTimeout(200);

  const boxes = [];
  for (const locator of targets) {
    const box = await locator.boundingBox();
    if (!box) throw new Error(`${name}: nothing to photograph`);
    boxes.push(box);
  }
  const scroll = await page.evaluate(() => ({
    x: window.scrollX,
    y: window.scrollY,
  }));
  const left = Math.min(...boxes.map((b) => b.x)) - MARGIN;
  const top = Math.min(...boxes.map((b) => b.y)) - MARGIN;
  const right = Math.max(...boxes.map((b) => b.x + b.width)) + MARGIN;
  const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + MARGIN;
  const viewport = page.viewportSize() ?? { width: 1440, height: 1000 };

  const png = await page.screenshot({
    fullPage: true,
    clip: {
      x: Math.max(0, left) + scroll.x,
      y: Math.max(0, top) + scroll.y,
      width: Math.min(viewport.width, right) - Math.max(0, left),
      height: bottom - Math.max(0, top),
    },
  });

  const directory = join(ARTICLES, locale, "images");
  await mkdir(directory, { recursive: true });
  const info = await sharp(png)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: 82, effort: 6, smartSubsample: true })
    .toFile(join(directory, `${name}.webp`));
  console.log(
    `  ${locale}/${name}.webp  ${info.width}x${info.height}  ${Math.round(info.size / 1024)} KB`,
  );
}

const account = await getAccount();
await prepareServer(account.id);
await prepareGuest();
await setBilling(account.id, "manual");
await setFirewall("basic");

const failures: string[] = [];
// The console runs on the public novnc.com page and connects to the proxy on
// localhost, which Chrome's local network access check would otherwise block.
const browser = await chromium.launch({
  args: [
    "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  ],
});
try {
  for (const locale of selectedLocales) {
    console.log(`[help] ${locale}`);
    await setAccountLocale(account.id, locale);
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 2,
      colorScheme: "dark",
      locale,
    });
    await context.addCookies(await sessionCookies(account.id));
    const page = await context.newPage();
    const t = await catalog(locale);
    const ctx: Context = { page, locale, userId: account.id, t };

    for (const shot of shots) {
      if (only && !only.includes(shot.name)) continue;
      try {
        await page.setViewportSize(shot.viewport ?? VIEWPORT);
        await shot.setup?.(ctx);
        await save(await shot.take(ctx), locale, shot.name);
      } catch (error) {
        failures.push(
          `${locale}/${shot.name}: ${(error as Error).message.split("\n")[0]}`,
        );
        if (process.env.HELP_SCREENSHOT_DEBUG) {
          await page
            .screenshot({
              path: join(
                process.env.HELP_SCREENSHOT_DEBUG,
                `${locale}-${shot.name}.png`,
              ),
            })
            .catch(() => {});
        }
        await page.keyboard.press("Escape").catch(() => {});
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  await setAccountLocale(account.id, "en");
  await setBilling(account.id, "manual");
  await setFirewall("basic").catch((error: Error) => {
    failures.push(`restoring the firewall: ${error.message}`);
  });
}

if (failures.length > 0) {
  console.error(`\n${failures.length} failed:\n${failures.join("\n")}`);
  process.exit(1);
}
process.exit(0);
