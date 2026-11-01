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

export type { DeletionBlockers } from "./deletion/blockers.ts";
export { getDeletionBlockers, hasBlockers } from "./deletion/blockers.ts";
export {
  CLEARED_DELETION_STATE,
  cancelAccountDeletion,
  confirmAccountDeletion,
  requestAccountDeletion,
} from "./deletion/lifecycle.ts";
export { buildDataExport, purgeExpiredExports } from "./export/build.ts";
export type { SubjectExport } from "./export/collect.ts";
export { collectSubjectData, EXPORT_SCHEMA_VERSION } from "./export/collect.ts";
export type { InvoiceAttachment } from "./export/document.ts";
export { buildExportDocument } from "./export/document.ts";
export type { ExportSection } from "./export/sections.ts";
export { EXPORT_SECTIONS } from "./export/sections.ts";
export * from "./inactivity/index.ts";
export type {
  Disposition,
  Ownership,
  SubjectTable,
  SubjectTableName,
} from "./subject-data.ts";
export {
  NEVER_EXPORTED_COLUMNS,
  SUBJECT_DATA,
  subjectTables,
  tablesToAnonymise,
  tablesToErase,
  tablesToRetain,
} from "./subject-data.ts";
