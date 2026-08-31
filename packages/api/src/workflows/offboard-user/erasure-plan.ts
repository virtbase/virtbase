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

// Imported from the leaf rather than the `privacy` barrel: that barrel reaches
// the export builder and through it PDFKit and the embedded fonts, none of
// which an offboarding has any business loading.
import type { SubjectTableName } from "../../privacy/subject-data";
import { tablesToErase } from "../../privacy/subject-data";

/** Marks a table `eraseSubjectDataStep` deletes itself. */
export const HERE = Symbol("erased-by-this-step");

/**
 * Where each table `SUBJECT_DATA` marks `erase` is actually destroyed.
 *
 * The map declares the intent; this declares the mechanism, and
 * {@link unplannedErasures} is what keeps the two honest. A table added to
 * `SUBJECT_DATA` with `disposition: "erase"` and no entry here fails the
 * offboarding loudly instead of quietly surviving it - which is exactly how six
 * tables came to be declared for erasure and never erased.
 *
 * [!] The foreign keys cannot be relied on to do this work. Every one of the
 * tables below cascades from `users.id`, but `anonymizeUserStep` deliberately
 * *keeps* that row - scrubbed to a tombstone, so the retained invoices still
 * have somebody to point at - so no cascade from `users` ever fires during an
 * offboarding.
 *
 * [!] A module of its own, and not because the step file was getting long.
 * `erase-subject-data.ts` may export nothing but its step: the workflow
 * compiler only replaces a step module with a stub when every one of its
 * exports is a step, and a module it cannot stub drags its whole import graph
 * into the workflow bundle - where `@virtbase/utils`, reached from
 * `subject-data.ts`, fails the build over `node:crypto`.
 */
export const ERASURE_PLAN: Partial<
  Record<SubjectTableName, string | typeof HERE>
> = {
  // Credentials, taken away up front so nothing can act mid-erasure, and
  // swept again by the terminal write.
  sessions: "claimAccountStep, then anonymizeUserStep",
  api_keys: "claimAccountStep, then anonymizeUserStep",
  accounts: "anonymizeUserStep",
  passkeys: "anonymizeUserStep",
  two_factors: "anonymizeUserStep",
  ssh_keys: "anonymizeUserStep",
  data_exports: "anonymizeUserStep",
  account_deletion_tokens: "anonymizeUserStep",
  // Everything that hangs off a server, destroyed with it.
  servers: "storeServerDeletionStep, via deleteOneServer",
  server_backups: "purgeAllBackupsStep, via deleteOneServer",
  // `resetPointerRecordsStep` retracts them from DNS first where a provider is
  // configured; either way the rows go with `subnet_allocations`, which cascade
  // from the deleted server.
  pointer_records: "resetPointerRecordsStep / the servers cascade",
  // Blocks the `users` row until it is gone - the foreign key is `restrict`.
  proxmox_iso_downloads: "purgeIsoDownloadsStep",
  // Detached at the provider first, because deleting the row on its own leaves
  // a credential that can still be charged.
  payment_methods: "detachPaymentMethodsStep",
  // The rest is `eraseSubjectDataStep`'s job.
  abuse_signals: HERE,
  abuse_cases: HERE,
  abuse_case_servers: HERE,
  abuse_case_messages: HERE,
  abuse_case_events: HERE,
  notification_deliveries: HERE,
};

/**
 * Tables declared for erasure that nothing has been written to erase.
 *
 * Exported so a test can assert the list is empty, and so the step can refuse
 * to run when it is not.
 */
export const unplannedErasures = (): SubjectTableName[] =>
  tablesToErase().filter((name) => !(name in ERASURE_PLAN));
