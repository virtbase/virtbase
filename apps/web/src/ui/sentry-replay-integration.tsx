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

"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

let registered = false;

/**
 * Lazy load the Sentry replay integration to reduce the initial bundle size.
 * Currently only used on the app layout (public pages are not subject to replay recording)
 */
export default function SentryReplayIntegration() {
  useEffect(() => {
    if (registered) return;
    registered = true;
    void import("@sentry/nextjs").then((lazyLoadedSentry) => {
      Sentry.addIntegration(lazyLoadedSentry.replayIntegration());
    });
  }, []);

  return null;
}
