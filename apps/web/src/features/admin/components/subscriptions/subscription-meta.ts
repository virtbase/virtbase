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

import type { PaymentStatus, RenewalStatus } from "@virtbase/db/schema";
import {
  LucideBan,
  LucideCircleCheck,
  LucideCircleDashed,
  LucideCircleSlash,
  LucideCircleX,
  LucideClock,
  LucideHandCoins,
  LucidePause,
  LucidePlayCircle,
  LucideRotateCcw,
  LucideTriangleAlert,
  LucideUndo2,
} from "@virtbase/ui/icons";
import type { SubscriptionStatus } from "@virtbase/validators";

/** Matches the `Option.icon` the data table's faceted filter renders. */
export type MetaIcon = React.FC<React.SVGProps<SVGSVGElement>>;

/**
 * One icon per subscription state, in the ladder's own order.
 *
 * `Record<SubscriptionStatus, …>` rather than a loose map, so a status added
 * to the domain is a type error here instead of an undefined component at
 * render time.
 */
export const SUBSCRIPTION_STATUS_ICONS: Record<SubscriptionStatus, MetaIcon> = {
  active: LucidePlayCircle,
  past_due: LucideTriangleAlert,
  suspended: LucidePause,
  cancelled: LucideUndo2,
  ended: LucideCircleSlash,
};

/**
 * One icon per collection attempt state.
 *
 * `awaiting_action` is deliberately not a warning icon: 3-D Secure and a SEPA
 * pre-notification both park a renewal for days, and dressing that up as a
 * failure is how an operator ends up reassuring a customer about a decline
 * that never happened.
 */
export const RENEWAL_STATUS_ICONS: Record<RenewalStatus, MetaIcon> = {
  pending: LucideCircleDashed,
  collecting: LucideHandCoins,
  awaiting_action: LucideClock,
  succeeded: LucideCircleCheck,
  failed: LucideRotateCcw,
  abandoned: LucideBan,
};

export const PAYMENT_STATUS_ICONS: Record<PaymentStatus, MetaIcon> = {
  pending: LucideCircleDashed,
  processing: LucideHandCoins,
  succeeded: LucideCircleCheck,
  failed: LucideCircleX,
  cancelled: LucideBan,
  refunded: LucideUndo2,
};

/**
 * `past_due` as "past due".
 *
 * Not translated, and not a lookup table of translated labels either. These
 * are the database's own enum values, and an operator reading a decline next
 * to a status has to be able to match what they see on screen against what
 * they see in a query or a log line. The same call the abuse queue makes for
 * its own vocabulary.
 */
export const humaniseSubscriptionTerm = (value: string) =>
  value.replace(/_/g, " ");
