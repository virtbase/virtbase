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

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProxmoxInstance } from "@virtbase/api/proxmox";
import { PUBLIC_DOMAIN } from "@virtbase/utils";

export const HOOKSCRIPT_FILENAME = "hookscript.pl";

// Resolved against the working directory rather than this module's location:
// the asset has to stay inside the app's source tree so Next traces it into
// the deployment, and a bundled module has no meaningful directory of its own.
const HOOKSCRIPT_DIR = "src/features/admin/assets/proxmox-nodes";

/**
 * Install the guest hookscript on a Proxmox VE node's snippet storage.
 *
 * Every guest is created with `--hookscript <storage>:snippets/hookscript.pl`,
 * and `PVE::GuestHelpers::check_hookscript` rejects a config referring to a
 * script that is missing *or* not executable - so a node without this file
 * cannot run `applyHardwareConfigStep` at all. The upload API cannot express a
 * file mode, which is what `scripts/patches/proxmox-snippet-mode.patch` is
 * for: it gives an uploaded snippet starting with a shebang mode 0755.
 *
 * Shared by the admin "create node" action and the dev-cluster seed, because
 * both register a node that provisioning is then expected to work against.
 */
export async function uploadHookscript({
  instance,
  storage,
  secret,
}: {
  instance: Pick<ProxmoxInstance, "uploadSnippet">;
  storage: string;
  secret: string;
}) {
  const contents = await readFile(
    join(process.cwd(), HOOKSCRIPT_DIR, HOOKSCRIPT_FILENAME),
    { encoding: "utf-8" },
  );

  // Overwrites an existing copy, which is the point: the webhook URL and the
  // secret baked into the file change with the environment.
  await instance.uploadSnippet({
    filename: HOOKSCRIPT_FILENAME,
    contents: contents
      .replaceAll("{{PUBLIC_DOMAIN}}", PUBLIC_DOMAIN)
      // For now use the Vercel cron secret as the hookscript secret which is
      // used by other webhooks. We might change this to a dedicated secret in
      // the future.
      .replaceAll("{{HOOKSCRIPT_SECRET}}", secret),
    storage,
  });
}
