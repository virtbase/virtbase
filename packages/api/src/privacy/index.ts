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

export type { DeletionBlockers } from "./deletion/blockers";
export { getDeletionBlockers, hasBlockers } from "./deletion/blockers";
export {
  CLEARED_DELETION_STATE,
  cancelAccountDeletion,
  confirmAccountDeletion,
  requestAccountDeletion,
} from "./deletion/lifecycle";
export { buildDataExport, purgeExpiredExports } from "./export/build";
export type { SubjectExport } from "./export/collect";
export { collectSubjectData, EXPORT_SCHEMA_VERSION } from "./export/collect";
export type { InvoiceAttachment } from "./export/document";
export { buildExportDocument } from "./export/document";
export type { ExportSection } from "./export/sections";
export { EXPORT_SECTIONS } from "./export/sections";
export * from "./inactivity";
export type {
  Disposition,
  Ownership,
  SubjectTable,
  SubjectTableName,
} from "./subject-data";
export {
  NEVER_EXPORTED_COLUMNS,
  SUBJECT_DATA,
  subjectTables,
  tablesToAnonymise,
  tablesToErase,
  tablesToRetain,
} from "./subject-data";
