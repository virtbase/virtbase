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
import type { Stripe } from "@virtbase/api/stripe";
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

const BACKGROUND_PATH =
  "M918.06,345.72h116.29c45.97,0,81.11-10.63,105.23-31.37,24.28-20.88,36.5-50.86,36.5-90.09s-11.61-72.04-35.17-92.77c-23.42-20.58-59.04-30.83-106.55-30.83h-169.33l-183.7,379.14-52.15,108.41-.18-.38-139.08,287.01h-68.17L0,0h466.88l103.04,216.25-59.27,123.33-113.89-238.92h-230.06l289.12,600.52,114.17-237.12-.22-.43,59.4-123,.12.25L793.4,0h231.47c86.01,0,151.2,18.42,195.3,55.2,44.08,36.78,66.26,90.9,66.26,162.84,0,34.89-6.76,66.03-20.54,93.6-13.78,27.59-33.29,49.78-58.69,66.56,46.5,27.04,81.64,60.08,105.21,99,23.76,39.23,35.72,83.85,35.72,134.7,0,80.88-26.48,144.81-79.54,192.05-53.21,47.36-125.31,70.88-216.13,70.88h-286.7l-77.5-162.61,59.39-122.93,88.07,184.92h238.11c49.78,0,89.1-14.57,117.68-43.82,28.7-29.38,42.99-69.52,42.99-120.13s-14.32-90.06-42.99-119.55c-28.68-29.48-67.95-44.37-117.68-44.37h-155.77v-100.62Z";
const BACKGROUND_PATH_ORIGINAL_WIDTH = 1348.13;
const BACKGROUND_PATH_ORIGINAL_HEIGHT = 874.83;
const BACKGROUND_PATH_TARGET_WIDTH = 269;
const BACKGROUND_PATH_TARGET_HEIGHT = 175;

const WORDMARK_PATHS = [
  "M91.29 44.5h-3.22L70.47.69h3.55l15.69 39.24L105.51.69h3.33L91.29 44.5zm23.76 0V.69h3.22V44.5h-3.22zm47.68 0h-3.67l-9.31-14.46-3.61.25h-11.12V44.5h-3.22V27.16h14.33c8.24 0 12.7-4.32 12.7-11.64s-4.46-11.64-12.7-11.64H131.8V.69h14.33c9.93 0 15.97 5.51 15.97 14.83 0 6.95-3.39 11.77-9.2 13.71l9.82 15.27zm16.76 0V3.88h-14.11V.69h31.49v3.19h-14.11V44.5h-3.27zM203.87.69h16.59c8.58 0 13.71 4.01 13.71 11.2 0 5.13-2.6 8.51-6.43 10.01 5.42 1.19 8.52 4.95 8.52 10.95 0 7.45-4.85 11.64-14.67 11.64h-17.72v-3.07h17.72c7.39 0 11.4-2.69 11.4-8.83s-4.01-8.83-11.4-8.83h-17.72v-3h16.48c6.66 0 10.55-2.88 10.55-8.51s-3.89-8.51-10.55-8.51h-16.48V.69zM243.2 44.5h-3.44L257.92.69h3.22l18.17 43.81h-3.5L259.5 4.57 243.19 44.5zm39.16-5.51l1.41-2.75c2.71 3.07 7.73 5.45 13.03 5.45 7.73 0 11.12-3.69 11.12-8.32 0-12.83-24.55-5.07-24.55-21.28 0-6.2 4.34-11.7 14.16-11.7 4.4 0 8.97 1.44 12.02 3.94l-1.19 2.88c-3.33-2.5-7.28-3.69-10.83-3.69-7.5 0-10.89 3.82-10.89 8.51 0 12.83 24.55 5.19 24.55 21.16 0 6.26-4.51 11.64-14.39 11.64-5.87 0-11.57-2.38-14.45-5.82zM320.79 0h26.58v3.19h-26.58V0zm0 20.66h26.58v3.19h-26.58v-3.19zm0 23.84h26.58v-3.19h-26.58v3.19z",
  "M45.95 17.82h5.82c2.3 0 4.06-.53 5.27-1.57 1.22-1.05 1.83-2.55 1.83-4.51s-.58-3.61-1.76-4.64c-1.17-1.03-2.95-1.54-5.33-1.54h-8.47l-9.19 18.98-2.61 5.43v-.02l-6.97 14.36h-3.41L0 .52h23.37l5.16 10.82-2.97 6.17-5.7-11.96H8.35l14.47 30.06 5.71-11.87v-.02l2.96-6.16h0L39.71.52h11.58c4.3 0 7.57.92 9.77 2.76 2.21 1.84 3.32 4.55 3.32 8.15 0 1.75-.34 3.3-1.03 4.68a8.45 8.45 0 0 1-2.94 3.33c2.33 1.35 4.09 3.01 5.27 4.95 1.19 1.96 1.79 4.2 1.79 6.74 0 4.05-1.33 7.25-3.98 9.61-2.66 2.37-6.27 3.55-10.82 3.55H38.32l-3.88-8.14L37.41 30l4.41 9.26h11.92c2.49 0 4.46-.73 5.89-2.19 1.44-1.47 2.15-3.48 2.15-6.01s-.72-4.51-2.15-5.98c-1.44-1.48-3.4-2.22-5.89-2.22h-7.8v-5.04h0z",
];
const WORDMARK_PATH_ORIGINAL_WIDTH = 347.36;
const WORDMARK_PATH_ORIGINAL_HEIGHT = 44.82;
const WORDMARK_PATH_TARGET_WIDTH = 115.66;
const WORDMARK_PATH_TARGET_HEIGHT = 14.94;

const COLOR_SECONDARY = "#f0f0f0";
const COLOR_BACKGROUND = "#ffffff";

function renderBackgroundImage(document: PDFKit.PDFDocument) {
  // center position AFTER scaling
  const x = (document.page.width - BACKGROUND_PATH_TARGET_WIDTH) / 2;
  const y = (document.page.height - BACKGROUND_PATH_TARGET_HEIGHT) / 2;

  const scaleX = BACKGROUND_PATH_TARGET_WIDTH / BACKGROUND_PATH_ORIGINAL_WIDTH;
  const scaleY =
    BACKGROUND_PATH_TARGET_HEIGHT / BACKGROUND_PATH_ORIGINAL_HEIGHT;

  document
    .save()
    .translate(x, y)
    .scale(scaleX, scaleY)
    .path(BACKGROUND_PATH)
    .opacity(0.02)
    .fillColor("#000")
    .fill("even-odd")
    .restore();
}

export const generateInventoryPdf = async ({
  user,
  sessions,
  accounts,
  charges,
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
  charges: Stripe.Charge[];
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
        // position AFTER scaling
        const x =
          document.page.width -
          document.page.margins.right -
          WORDMARK_PATH_TARGET_WIDTH;
        const y = document.page.margins.top + WORDMARK_PATH_TARGET_HEIGHT / 2;

        const scaleX =
          WORDMARK_PATH_TARGET_WIDTH / WORDMARK_PATH_ORIGINAL_WIDTH;
        const scaleY =
          WORDMARK_PATH_TARGET_HEIGHT / WORDMARK_PATH_ORIGINAL_HEIGHT;

        const base = document.save().translate(x, y).scale(scaleX, scaleY);

        for (const path of WORDMARK_PATHS) {
          base.path(path);
        }

        base.fillColor("#000").fill("even-odd").restore();
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
              {
                text: formatter.dateTime(new Date(), {
                  dateStyle: "full",
                  timeStyle: "long",
                }),
                type: "TD",
              },
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
          columnStyles: [
            { width: 120, minWidth: 120 },
            { width: 240, minWidth: 240, backgroundColor: COLOR_SECONDARY },
          ],
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
              { text: user.emailVerified ? t("Yes") : t("No"), type: "TD" },
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
              {
                text: formatter.dateTime(user.createdAt, {
                  dateStyle: "full",
                  timeStyle: "long",
                }),
                type: "TD",
              },
            ],
            [
              { text: t("Last change:"), type: "TH" },
              {
                text: formatter.dateTime(user.updatedAt, {
                  dateStyle: "full",
                  timeStyle: "long",
                }),
                type: "TD",
              },
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
                    text: formatter.dateTime(session.createdAt, {
                      dateStyle: "full",
                      timeStyle: "long",
                    }),
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
                    text: formatter.dateTime(account.createdAt, {
                      dateStyle: "full",
                      timeStyle: "long",
                    }),
                    type: "TD",
                  },
                ],
                [
                  { text: t("Last change:"), type: "TH" },
                  {
                    text: formatter.dateTime(account.updatedAt, {
                      dateStyle: "full",
                      timeStyle: "long",
                    }),
                    type: "TD",
                  },
                ],
              ],
            });
        }),
      );
    }

    const chargesSection = document.struct("Sect");
    struct.add(chargesSection);

    chargesSection.add(
      document.struct("H2", {}, () => {
        document
          .moveDown()
          .fontSize(14.5)
          .font("Arial Black")
          .text(t("Payment history"), document.page.margins.left)
          .moveDown();
      }),
    );

    if (charges.length === 0) {
      chargesSection.add(
        document.struct("P", {}, () => {
          document
            .fontSize(9.5)
            .font("Arial")
            .fillColor("#000")
            .text(t("No charges recorded."), document.page.margins.left);
        }),
      );
    } else {
      for (const charge of charges) {
        chargesSection.add(
          document.struct("Table", {}, () => {
            const { name, address } = charge.billing_details;
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
                      text: formatter.dateTime(charge.created * 1000, {
                        dateStyle: "full",
                        timeStyle: "long",
                      }),
                      type: "TH",
                      colSpan: 2,
                      backgroundColor: COLOR_SECONDARY,
                    },
                  ],
                  [
                    { text: t("ID:"), type: "TH" },
                    {
                      text: charge.id,
                      type: "TD",
                    },
                  ],
                  [
                    { text: t("Amount:"), type: "TH" },
                    {
                      text: formatter.number(charge.amount / 100, {
                        style: "currency",
                        currency: charge.currency,
                        currencyDisplay: "symbol",
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }),
                      type: "TD",
                    },
                  ],
                  [
                    { text: t("Status:"), type: "TH" },
                    { text: charge.status, type: "TD" },
                  ],
                  [
                    { text: t("Billing Details:"), type: "TH" },
                    {
                      text: [
                        name,
                        address?.line1,
                        address?.line2,
                        address?.postal_code,
                        address?.city,
                        address?.state,
                        address?.country,
                      ]
                        .filter(Boolean)
                        .join(", "),
                      type: "TD",
                    },
                  ],
                ],
              });
          }),
        );
      }
    }
  }

  document.end();

  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  return stream.toBlob();
};
