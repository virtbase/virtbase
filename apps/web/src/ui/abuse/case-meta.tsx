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

import {
  LucideBug,
  LucideChevronsDown,
  LucideChevronsUp,
  LucideChevronUp,
  LucideClock,
  LucideCopyright,
  LucideEye,
  LucideFileSearch,
  LucideFishSymbol,
  LucideGauge,
  LucideMailWarning,
  LucideMessageCircleReply,
  LucideMinus,
  LucidePower,
  LucideRadar,
  LucideShieldCheck,
  LucideShieldQuestionMark,
  LucideSiren,
  LucideSkull,
  LucideThumbsDown,
  LucideTrash2,
  LucideUnplug,
  LucideWaves,
} from "@virtbase/ui/icons";
import type {
  AbuseCaseSeveritySchema,
  AbuseCaseStatusSchema,
  AbuseCategorySchema,
  AbuseEnforcementLevelSchema,
} from "@virtbase/validators";
import type * as z from "zod";

type Status = z.infer<typeof AbuseCaseStatusSchema>;
type Severity = z.infer<typeof AbuseCaseSeveritySchema>;
type Category = z.infer<typeof AbuseCategorySchema>;
type Enforcement = z.infer<typeof AbuseEnforcementLevelSchema>;

/** Matches the `Option.icon` the data table's faceted filter renders. */
export type MetaIcon = React.FC<React.SVGProps<SVGSVGElement>>;

/**
 * One icon per value, shared by every surface that shows it.
 *
 * Outside `features/` on purpose: the operator's queue and the customer's own
 * case list render the same vocabulary, and a status that looks like one thing
 * on one screen and another elsewhere is a status somebody has to re-learn.
 * The types come from the validators rather than a second list, so a new
 * category is a type error here rather than a missing icon in production.
 */
export const STATUS_ICONS: Record<Status, MetaIcon> = {
  triage: LucideFileSearch,
  open: LucideSiren,
  awaiting_customer: LucideClock,
  awaiting_operator: LucideMessageCircleReply,
  mitigated: LucideShieldCheck,
  resolved: LucideShieldCheck,
  rejected: LucideThumbsDown,
};

export const SEVERITY_ICONS: Record<Severity, MetaIcon> = {
  low: LucideChevronsDown,
  medium: LucideMinus,
  high: LucideChevronUp,
  critical: LucideChevronsUp,
};

export const CATEGORY_ICONS: Record<Category, MetaIcon> = {
  spam: LucideMailWarning,
  phishing: LucideFishSymbol,
  malware: LucideBug,
  port_scan: LucideRadar,
  ddos: LucideWaves,
  copyright: LucideCopyright,
  compromised: LucideSkull,
  other: LucideShieldQuestionMark,
};

/**
 * The ladder, in order of what it costs the customer.
 *
 * `none` gets an eye rather than a crossed-out anything: a case with no
 * enforcement is still being watched, and an icon that reads as "nothing
 * happening" would be the wrong thing on an open case.
 */
export const ENFORCEMENT_ICONS: Record<Enforcement, MetaIcon> = {
  none: LucideEye,
  throttle: LucideGauge,
  isolate: LucideUnplug,
  power_off: LucidePower,
  terminate: LucideTrash2,
};

/** Enum values are snake_case; people are not. */
export const humanise = (value: string) => value.replace(/_/g, " ");
