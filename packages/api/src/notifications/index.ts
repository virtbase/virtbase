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

export type { NotificationChannelDescription } from "./channels";
export { listNotificationChannels } from "./channels";
export { deliverNotification, MAX_DELIVERY_ATTEMPTS } from "./deliver";
export type {
  DispatchNotificationInput,
  DispatchResult,
} from "./dispatch";
export { dispatchNotification } from "./dispatch";
export {
  matchesAnyKey,
  matchesKey,
  meetsSeverity,
  SEVERITY_RANK,
} from "./match";
export { type RetryResult, retryFailedNotifications } from "./retry";
export { notificationTargetStore } from "./store";
export type {
  NotificationParams,
  NotificationRenderer,
  NotificationText,
} from "./text";
export { NOTIFICATION_TEXT, renderNotification } from "./text";
