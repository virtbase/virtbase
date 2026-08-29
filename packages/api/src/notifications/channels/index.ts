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

import type { FieldDescriptor } from "@virtbase/validators";

export * from "./email";

/**
 * A channel as the admin console sees it: enough to render the form for one
 * of its targets, and nothing that can be executed.
 *
 * The same trick `IntegrationDescription` uses - an adapter holds closures and
 * credentials, neither of which survives the server/client boundary.
 */
export interface NotificationChannelDescription {
  id: string;
  targetFields: FieldDescriptor[];
  /** Which of those fields are stored encrypted and never read back. */
  secretKeys: string[];
}

/**
 * Every channel that could receive a notification right now.
 *
 * Derived from the registry rather than a list, so a channel whose integration
 * an admin has switched off disappears from the "add a target" form instead of
 * offering a destination nothing can deliver to.
 */
export const listNotificationChannels = async (): Promise<
  NotificationChannelDescription[]
> => {
  // Resolved at call time; see `deliver.ts` for why a static import here
  // would be circular.
  const { integrations } = await import("../../integrations");
  const channels = await integrations.resolveAll("notifications");

  return channels.map((channel) => ({
    id: channel.id,
    targetFields: channel.targetFields ?? [],
    secretKeys: [...(channel.targetSecretKeys ?? [])],
  }));
};
