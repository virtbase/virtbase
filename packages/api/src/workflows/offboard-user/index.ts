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

import { deleteOneServer } from "../shared/delete-one-server";
import { anonymizeUserStep } from "./anonymize-user";
import { claimAccountStep } from "./claim-account";
import { countRetainedStep } from "./count-retained";
import { detachExternalServicesStep } from "./detach-external-services";
import { eraseSubjectDataStep } from "./erase-subject-data";
import { getServersToDestroyStep } from "./get-servers-to-destroy";
import { purgeIsoDownloadsStep } from "./purge-iso-downloads";
import { recordErasureStep } from "./record-erasure";
import { revokeExternalIdentitiesStep } from "./revoke-external-identities";
import { sendAccountDeletedEmailStep } from "./send-account-deleted-email";

type OffboardUserWorkflowParams = {
  userId: string;
};

/**
 * Erases an account and everything it owns.
 *
 * The single destructive path behind all three triggers - a customer asking, a
 * dormant account timing out, and an admin acting on a request that arrived by
 * post. Building them separately would guarantee they drift, and a drift here
 * is a data-protection incident on one side or a tax problem on the other.
 *
 * The order is not cosmetic. Three constraints fix it:
 *
 * - The email address must be read before the step that scrubs it, because the
 *   final message is sent afterwards.
 * - ISO downloads must go before anything writes to `users`: that foreign key
 *   is `restrict`, so the account cannot be touched while they exist.
 * - Nothing is erased until every VM is confirmed destroyed. A Proxmox outage
 *   should leave a recoverable half-state, not a customer with no account and
 *   a server still running on somebody's node.
 */
export async function offboardUserWorkflow({
  userId,
}: OffboardUserWorkflowParams) {
  "use workflow";

  const startedAt = new Date().toISOString();

  // 1. Claim the account, capture who they are, revoke everything that could
  //    act on their behalf mid-erasure.
  const { name, email, locale, reason } = await claimAccountStep({ userId });

  // 2. Destroy every server. Sequential on purpose - a node should not receive
  //    eight simultaneous destroy tasks - and before any erasure, so a failure
  //    here stops the run while it is still recoverable.
  const servers = await getServersToDestroyStep({ userId });

  for (const server of servers) {
    await deleteOneServer({
      vmid: server.vmid,
      serverId: server.id,
      proxmoxNode: server.proxmoxNode,
    });
  }

  // 3. Custom images, which block the `users` row until they are gone.
  const { purged } = await purgeIsoDownloadsStep({ userId });

  // 4. Hand back the OAuth grants before the rows holding them disappear.
  const { revoked } = await revokeExternalIdentitiesStep({ userId });

  // 5. Third parties holding a copy.
  await detachExternalServicesStep({ userId, email });

  // 6. Everything else `SUBJECT_DATA` marks for erasure and no other step
  //    takes: the abuse thread, the signals behind it, the delivery log.
  const erased = await eraseSubjectDataStep({ userId });

  // 7. Count what survives, while it can still be attributed.
  const retained = await countRetainedStep({ userId });

  // 8. The terminal write.
  const destroyed = await anonymizeUserStep({ userId, email });

  // 9. Tell them it is done, using the address captured in step 1 - by now the
  //    row no longer has it.
  await sendAccountDeletedEmailStep({
    user: { name, email, locale },
    reason: reason ?? "user_request",
  });

  // 10. Record what happened. Last, because it reports what the steps above
  //     actually did rather than what they were asked to do.
  await recordErasureStep({
    userId,
    reason: reason ?? "user_request",
    startedAt,
    destroyed: {
      ...destroyed,
      ...erased,
      servers: servers.length,
      customImages: purged,
      revokedGrants: revoked,
    },
    retained,
  });
}

export { anonymizeUserStep } from "./anonymize-user";
export { claimAccountStep } from "./claim-account";
export { countRetainedStep } from "./count-retained";
export { detachExternalServicesStep } from "./detach-external-services";
export { eraseSubjectDataStep } from "./erase-subject-data";
export { getServersToDestroyStep } from "./get-servers-to-destroy";
export { purgeIsoDownloadsStep } from "./purge-iso-downloads";
export { recordErasureStep } from "./record-erasure";
export { revokeExternalIdentitiesStep } from "./revoke-external-identities";
