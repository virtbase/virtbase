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

import { buildExportArtifactStep } from "./build-artifact";
import { sendExportReadyEmailStep } from "./send-export-ready-email";

type ExportUserDataWorkflowParams = {
  exportId: string;
  passphrase: string;
};

/**
 * Builds a customer's data export and tells them it is ready.
 *
 * A workflow rather than a background promise because the expensive part is
 * one call to the accounting provider per invoice, and a customer with three
 * years of history should not lose their export to a single timeout.
 */
export async function exportUserDataWorkflow({
  exportId,
  passphrase,
}: ExportUserDataWorkflowParams) {
  "use workflow";

  const { byteSize, name, email, locale } = await buildExportArtifactStep({
    exportId,
    passphrase,
  });

  // The link only. The passphrase was shown in the browser that asked for the
  // export and is deliberately not repeated here - a mailbox compromise should
  // yield an encrypted blob, not a readable dossier.
  await sendExportReadyEmailStep({
    exportId,
    user: { name, email, locale },
    byteSize,
  });
}
