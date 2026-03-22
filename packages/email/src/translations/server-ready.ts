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
  en: "Your server is now ready",
} as const satisfies EmailTitles;

export const messages = {
  en: {
    preview: "Your server is now ready",
    heading: "Your server is now ready",
    greeting: "Hi {name}!",
    description:
      "The server you ordered is now fully configured and ready to use. For security reasons, the IP address is not included with this email. You can find it in the customer portal.",
    username: "<strong>• Username:</strong> {username}",
    rootPassword: "<strong>• Root password:</strong> {rootPassword}",
    customPassword: "Custom password chosen by you",
    portalLink: "View server in customer portal",
  },
} as const satisfies EmailTranslations;
