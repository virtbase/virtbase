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

import { useExtracted } from "next-intl";
import type { AbuseCaseSummary, CustomerAbuseCase } from "./use-abuse-cases";

/**
 * The internal vocabulary, said the way it would be said to the person it is
 * about.
 *
 * `awaiting_customer` is an accurate description of a queue and a useless
 * thing to show somebody who is in it. The operator console keeps the enum
 * because operators reason in it; here the same status has to answer "is this
 * waiting on me?" at a glance.
 *
 * A hook rather than a map, because the extractor only sees literals at a
 * `useExtracted()` call site.
 */
export const useCaseLabels = () => {
  const t = useExtracted();

  const status: Record<AbuseCaseSummary["status"], string> = {
    triage: t("Under review"),
    open: t("Open"),
    awaiting_customer: t("Needs your answer"),
    awaiting_operator: t("With our team"),
    mitigated: t("Being verified"),
    resolved: t("Resolved"),
    rejected: t("Dismissed"),
  };

  const severity: Record<AbuseCaseSummary["severity"], string> = {
    low: t("Low"),
    medium: t("Medium"),
    high: t("High"),
    critical: t("Critical"),
  };

  const category: Record<AbuseCaseSummary["category"], string> = {
    spam: t("Spam"),
    phishing: t("Phishing"),
    malware: t("Malware"),
    port_scan: t("Port scanning"),
    ddos: t("Denial of service"),
    copyright: t("Copyright"),
    compromised: t("Compromised server"),
    other: t("Other"),
  };

  /**
   * What the lock does, not what the code calls it.
   *
   * "isolate" is a mechanism; "network blocked" is the thing the customer is
   * looking at when they open the page wondering why nothing responds.
   */
  const enforcement: Record<
    CustomerAbuseCase["servers"][number]["lock_level"],
    string
  > = {
    none: t("Watched"),
    throttle: t("Network limited"),
    isolate: t("Network blocked"),
    power_off: t("Powered off"),
    terminate: t("Scheduled for deletion"),
  };

  return { status, severity, category, enforcement };
};
