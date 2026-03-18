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

import type { EmailTitles, EmailTranslations } from ".";

export const titles = {
  en: "Your email address has been changed",
} as const satisfies EmailTitles;

export const messages = {
  en: {
    preview: "Your email address has been updated",
    heading: "Your email address has been updated",
    changedFromTo:
      "The e-mail address for your {appName} account has been changed from <strong>{oldEmail}</strong> to <strong>{newEmail}</strong>.",
    support:
      "If you did not make this change, please contact our support team or <link>update your email address</link>.",
    hint: "This message is being sent to your old e-mail address only.",
  },
} as const satisfies EmailTranslations;
