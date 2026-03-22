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
  en: "Your server has been suspended",
} as const satisfies EmailTitles;

export const messages = {
  en: {
    preview: "Your server has been suspended",
    heading: "Your server has been suspended",
    greeting: "Hi {name}!",
    description:
      "Your server <strong>{serverName}</strong> has been suspended, because it was not renewed in time.",
    hint: "You have <strong>{days} days</strong> to renew your server. After that, your server and all data will be permanently deleted.",
    renewButton: "Renew now",
  },
} as const satisfies EmailTranslations;
