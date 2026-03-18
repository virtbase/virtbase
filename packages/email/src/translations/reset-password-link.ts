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
  en: "Reset Password Link",
} as const satisfies EmailTitles;

export const messages = {
  en: {
    preview: "Reset Password Link",
    heading: "Reset Password Link",
    description:
      "You are receiving this email because we received a password reset request for your account at {appName}.",
    instructions: "Please click the button below to reset your password.",
    resetPassword: "Reset Password",
    copyAndPaste: "or copy and paste this URL into your browser:",
  },
} as const satisfies EmailTranslations;
