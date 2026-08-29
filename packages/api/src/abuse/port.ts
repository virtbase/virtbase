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

import { db } from "@virtbase/db/client";
import type {
  InboundSignal,
  SignalIngestResult,
  SignalIntake,
} from "@virtbase/ports";
import { submitSignal, submitSignals } from "./intake";

/**
 * The pipeline, as an integration sees it.
 *
 * Provided by the internal `core` integration, exactly as `serverManagement`
 * is: an integration that receives alerts normalises them itself and submits
 * the result here, without importing `@virtbase/api`.
 */
export class AbuseSignalIntake implements SignalIntake {
  readonly id = "core";

  async submit(signal: InboundSignal): Promise<SignalIngestResult> {
    return submitSignal({ db, signal });
  }

  async submitMany(signals: InboundSignal[]): Promise<SignalIngestResult[]> {
    return submitSignals({ db, signals });
  }
}
