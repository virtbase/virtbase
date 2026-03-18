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
  en: "Your password has been changed",
} as const satisfies EmailTitles;

export const messages = {
  en: {
    preview: "Your password has been changed",
    heading: "Password has been changed",
    description:
      "The password for your {appName} account has been successfully changed.",
    hint: "If you did not make this change or you believe an unauthorised person has accessed your account, please contact us immediately to secure your account.",
  },
} as const satisfies EmailTranslations;
