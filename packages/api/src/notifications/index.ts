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

export type { NotificationChannelDescription } from "./channels/index.ts";
export { listNotificationChannels } from "./channels/index.ts";
export { deliverNotification, MAX_DELIVERY_ATTEMPTS } from "./deliver.ts";
export type {
  DispatchNotificationInput,
  DispatchResult,
} from "./dispatch.ts";
export { dispatchNotification } from "./dispatch.ts";
export {
  matchesAnyKey,
  matchesKey,
  meetsSeverity,
  SEVERITY_RANK,
} from "./match.ts";
export { type RetryResult, retryFailedNotifications } from "./retry.ts";
export { notificationTargetStore } from "./store.ts";
export type {
  NotificationParams,
  NotificationRenderer,
  NotificationText,
} from "./text.ts";
export { NOTIFICATION_TEXT, renderNotification } from "./text.ts";
