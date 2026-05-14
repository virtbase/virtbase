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

import { join } from "node:path";
import type { Session } from "@virtbase/auth";
import { APP_NAME } from "@virtbase/utils";
import type { Account } from "better-auth";
import blobStream from "blob-stream";
import type { Locale } from "next-intl";
import { getExtracted, getFormatter } from "next-intl/server";
import PDFDocument from "pdfkit";
import { defaultLocale } from "@/i18n/config";

const BASE_DIR = join(process.cwd(), "src/features/admin/api/users/generator");

const FONT_HEADLINE = join(BASE_DIR, "fonts/arial-black.ttf");
const FONT_BODY = join(BASE_DIR, "fonts/arial.ttf");

const BACKGROUND_IMAGE = join(BASE_DIR, "assets/logo_plain.png");
const BACKGROUND_IMAGE_WIDTH = 269;
const BACKGROUND_IMAGE_HEIGHT = 175;

const WORDMARK_IMAGE = join(BASE_DIR, "assets/wordmark.png");
const WORDMARK_IMAGE_WIDTH = 130;
const WORDMARK_IMAGE_HEIGHT = 31;

const COLOR_SECONDARY = "#f0f0f0";
const COLOR_BACKGROUND = "#ffffff";

function renderBackgroundImage(document: PDFKit.PDFDocument) {
  document.save();
  document.opacity(0.02);
  document.image(
    BACKGROUND_IMAGE,
    document.page.width / 2 - BACKGROUND_IMAGE_WIDTH / 2,
    document.page.height / 2 - BACKGROUND_IMAGE_HEIGHT / 2,
    {
      width: BACKGROUND_IMAGE_WIDTH,
      height: BACKGROUND_IMAGE_HEIGHT,
      fit: [BACKGROUND_IMAGE_WIDTH, BACKGROUND_IMAGE_HEIGHT],
    },
  );
  document.restore();
}

export const generateInventoryPdf = async ({
  user,
  sessions,
  accounts,
  locale = defaultLocale,
}: {
  user: Pick<
    Session["user"],
    | "id"
    | "name"
    | "email"
    | "emailVerified"
    | "locale"
    | "stripeCustomerId"
    | "createdAt"
    | "updatedAt"
  >;
  sessions: Pick<
    Session["session"],
    "id" | "ipAddress" | "userAgent" | "createdAt"
  >[];
  accounts: Pick<
    Account,
    "id" | "accountId" | "providerId" | "createdAt" | "updatedAt" | "scope"
  >[];
  locale?: Locale;
}): Promise<Blob> => {
  const t = await getExtracted({ locale });
  const formatter = await getFormatter({ locale });

  const title = t("User Data Report");

  const document = new PDFDocument({
    size: "A4",
    margins: {
      top: "1.38cm",
      bottom: "0.88cm",
      left: "1.5cm",
      right: "1.5cm",
    },
    lang: locale,
    displayTitle: true,
    tagged: true,
    subset: "PDF/A-3a",
    pdfVersion: "1.7",
    font: FONT_BODY,
  });

  const stream = blobStream();
  document.pipe(stream);

  document.info.Title = title;
  document.info.Author = APP_NAME;
  document.info.CreationDate = new Date();

  renderBackgroundImage(document);
  document.on("pageAdded", () => {
    renderBackgroundImage(document);
  });

  const struct = document.struct("Document");
  document.addStructure(struct);

  document.registerFont("Arial", FONT_BODY);
  document.registerFont("Arial Black", FONT_HEADLINE);

  // Headline
  struct.add(
    document.struct("H1", {}, () => {
      document.fontSize(19.5).font("Arial Black").text(title);
    }),
  );

  // Logo in Headline
  struct.add(
    document.struct(
      "Figure",
      {
        alt: `${APP_NAME} Logo`,
      },
      () => {
        document.image(
          WORDMARK_IMAGE,
          document.page.width -
            document.page.margins.right -
            WORDMARK_IMAGE_WIDTH,
          document.page.margins.top - 2.5,
          {
            width: WORDMARK_IMAGE_WIDTH,
            height: WORDMARK_IMAGE_HEIGHT,
            fit: [WORDMARK_IMAGE_WIDTH, WORDMARK_IMAGE_HEIGHT],
          },
        );
      },
    ),
  );

  // Divider element
  struct.add(
    document.struct("Div", {}, () => {
      document
        .rect(
          document.page.margins.left,
          75,
          document.page.width -
            document.page.margins.right -
            document.page.margins.left,
          1,
        )
        .fill("#000");
    }),
  );

  const informationSection = document.struct("Sect");
  struct.add(informationSection);

  informationSection.add(
    document.struct("H2", {}, () => {
      document
        .fontSize(14.5)
        .font("Arial Black")
        .text(t("Report Information"), document.page.margins.left, 100);
    }),
  );

  informationSection.add(
    document.struct("Table", {}, () => {
      document
        .moveDown()
        .fontSize(9.5)
        .font("Arial")
        .table({
          columnStyles: (index) => {
            if (index % 2 !== 0) {
              return {
                backgroundColor: COLOR_SECONDARY,
                width: 240,
              };
            }
          },
          defaultStyle: {
            width: 120,
            padding: 8,
            border: 2,
            borderColor: COLOR_BACKGROUND,
          },
          data: [
            [
              { text: t("Export timestamp:"), type: "TH" },
              { text: formatter.dateTime(new Date()), type: "TD" },
            ],
          ],
        });
    }),
  );

  const userSection = document.struct("Sect");
  struct.add(userSection);

  userSection.add(
    document.struct("H2", {}, () => {
      document
        .moveDown()
        .fontSize(14.5)
        .font("Arial Black")
        .text(t("User data"), document.page.margins.left);
    }),
  );

  userSection.add(
    document.struct("Table", {}, () => {
      document
        .moveDown()
        .fontSize(9.5)
        .font("Arial")
        .table({
          columnStyles: (index) => {
            if (index % 2 !== 0) {
              return {
                backgroundColor: COLOR_SECONDARY,
                width: 240,
              };
            }
          },
          defaultStyle: {
            width: 120,
            padding: 8,
            border: 2,
            borderColor: COLOR_BACKGROUND,
          },
          data: [
            [
              { text: t("ID:"), type: "TH" },
              { text: user.id, type: "TD" },
            ],
            [
              { text: t("Display name:"), type: "TH" },
              { text: user.name, type: "TD" },
            ],
            [
              { text: t("Email:"), type: "TH" },
              { text: user.email, type: "TD" },
            ],
            [
              { text: t("Email confirmed:"), type: "TH" },
              { text: user.emailVerified ? "✓" : "🞩", type: "TD" },
            ],
            [
              { text: t("Language:"), type: "TH" },
              { text: user.locale || defaultLocale, type: "TD" },
            ],
            [
              { text: t("Stripe ID:"), type: "TH" },
              { text: user.stripeCustomerId || "-", type: "TD" },
            ],
            [
              { text: t("Registration date:"), type: "TH" },
              { text: formatter.dateTime(user.createdAt), type: "TD" },
            ],
            [
              { text: t("Last change:"), type: "TH" },
              { text: formatter.dateTime(user.updatedAt), type: "TD" },
            ],
          ],
        });
    }),
  );

  const sessionSection = document.struct("Sect");
  struct.add(sessionSection);

  sessionSection.add(
    document.struct("H2", {}, () => {
      document
        .moveDown()
        .fontSize(14.5)
        .font("Arial Black")
        .text(t("Session information"), document.page.margins.left)
        .moveDown();
    }),
  );

  if (sessions.length === 0) {
    sessionSection.add(
      document.struct("P", {}, () => {
        document
          .moveDown()
          .fontSize(9.5)
          .font("Arial")
          .fillColor("#000")
          .text(t("No sessions recorded."), document.page.margins.left);
      }),
    );
  } else {
    for (const session of sessions) {
      sessionSection.add(
        document.struct("Table", {}, () => {
          document
            .fontSize(9.5)
            .font("Arial")
            .table({
              columnStyles: [
                { width: 100, minWidth: 72 },
                { width: "*", minWidth: 120 },
              ],
              defaultStyle: {
                padding: 8,
                border: 0,
                textColor: "#000",
              },
              data: [
                [
                  {
                    text: formatter.dateTime(session.createdAt),
                    type: "TH",
                    colSpan: 2,
                    backgroundColor: COLOR_SECONDARY,
                  },
                ],
                [
                  { text: t("ID:"), type: "TH" },
                  {
                    text: session.id,
                    type: "TD",
                  },
                ],
                [
                  { text: t("IP address:"), type: "TH" },
                  { text: session.ipAddress ?? "—", type: "TD" },
                ],
                [
                  { text: t("User-Agent:"), type: "TH" },
                  { text: session.userAgent ?? "—", type: "TD" },
                ],
              ],
            });
        }),
      );
    }
  }

  const accountSection = document.struct("Sect");
  struct.add(accountSection);

  accountSection.add(
    document.struct("H2", {}, () => {
      document
        .moveDown()
        .fontSize(14.5)
        .font("Arial Black")
        .text(t("Linked accounts"), document.page.margins.left)
        .moveDown();
    }),
  );

  if (accounts.length === 0) {
    sessionSection.add(
      document.struct("P", {}, () => {
        document
          .moveDown()
          .fontSize(9.5)
          .font("Arial")
          .fillColor("#000")
          .text(t("No linked accounts recorded."), document.page.margins.left);
      }),
    );
  } else {
    for (const account of accounts) {
      sessionSection.add(
        document.struct("Table", {}, () => {
          document
            .fontSize(9.5)
            .font("Arial")
            .table({
              columnStyles: [
                { width: 100, minWidth: 72 },
                { width: "*", minWidth: 120 },
              ],
              defaultStyle: {
                padding: 8,
                border: 0,
                textColor: "#000",
              },
              data: [
                [
                  {
                    text:
                      account.providerId.charAt(0).toUpperCase() +
                      account.providerId.slice(1),
                    type: "TH",
                    colSpan: 2,
                    backgroundColor: COLOR_SECONDARY,
                  },
                ],
                [
                  { text: t("ID:"), type: "TH" },
                  {
                    text: account.id,
                    type: "TD",
                  },
                ],
                [
                  { text: t("Provider ID:"), type: "TH" },
                  { text: account.accountId, type: "TD" },
                ],
                [
                  { text: t("Permissions:"), type: "TH" },
                  { text: account.scope || "—", type: "TD" },
                ],
                [
                  { text: t("Creation date:"), type: "TH" },
                  {
                    text: formatter.dateTime(account.createdAt),
                    type: "TD",
                  },
                ],
                [
                  { text: t("Last change:"), type: "TH" },
                  {
                    text: formatter.dateTime(account.updatedAt),
                    type: "TD",
                  },
                ],
              ],
            });
        }),
      );
    }
  }

  document.end();

  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  return stream.toBlob();
};
