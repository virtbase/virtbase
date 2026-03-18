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

import type { EmailTranslations } from ".";

export const messages = {
  en: {
    thisEmailWasIntendedFor:
      "This email was intended for <strong>{email}</strong>.",
    securityConcerns:
      "If you were not expecting this email, you can ignore this email. If you are concerned about your account's safety, please <link>reach out to let us know</link>.",
    dontWantToGetTheseEmails: "Don't want to get these emails?",
    managePreferences: "Manage your email preferences",
    adjustNotificationSettings: "Adjust your notification settings",
  
    managingDirector: "Managing Director",
    commercialRegister: "Commercial Register",
  },
} as const satisfies EmailTranslations;
