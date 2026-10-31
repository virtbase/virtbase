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

import {
  notifySuspendedCustomers,
  suspendTerminatedServers,
} from "@virtbase/api/subscriptions";
import { withCronSecret } from "@/lib/with-cron-secret.ts";

export const maxDuration = 300;

/**
 * Powers off and suspends the servers whose term has run out, moves their
 * subscriptions to `suspended`, and emails their owners. A node that fails or
 * hangs is reported, and its servers are suspended by a later run.
 */
const handler = withCronSecret(async () => {
  const result = await suspendTerminatedServers();
  await notifySuspendedCustomers(result.suspendedServerIds);

  return Response.json({
    processed: result.suspendedServerIds.length + result.failedServerIds.length,
    settled: result.suspendedServerIds.length,
    failed: result.failedServerIds.length,
    skipped: 0,
  });
});

export { handler as GET };
