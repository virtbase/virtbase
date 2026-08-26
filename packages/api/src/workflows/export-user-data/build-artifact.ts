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

import { buildDataExport } from "../../privacy/export/build";

type BuildExportArtifactStepParams = {
  exportId: string;
  /**
   * [!] Travels through the workflow's own input log, which is why it is never
   * written to the `data_exports` row: an artifact encrypted with a key stored
   * in the column beside it is decoration. Needed here because encryption
   * happens at build time while the customer is shown the passphrase at
   * request time, and nothing is reachable in between.
   */
  passphrase: string;
};

export async function buildExportArtifactStep({
  exportId,
  passphrase,
}: BuildExportArtifactStepParams) {
  "use step";

  return buildDataExport({ exportId, passphrase });
}
