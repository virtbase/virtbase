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

import * as Sentry from "@sentry/node";
import { db } from "@virtbase/db/client";
import { renderTemplateVendorData } from "../../cloud-init";
import type { GetProxmoxInstanceParams, NetworkAdapter } from "../../proxmox";
import { getProxmoxInstance } from "../../proxmox";
import { generateCloudInitNetworkConfig } from "../../proxmox/generate-cloud-init-network-config";

type ApplyCloudInitStepParams = {
  proxmoxNode: GetProxmoxInstanceParams & { snippetStorage: string };
  vmid: number;
  proxmoxTemplateId: string;
  /**
   * Omit to leave the guest's existing network snippet in place and re-render
   * only the vendor data. That is the template-change case: the guest keeps its
   * addresses, but a Debian guest that becomes AlmaLinux must not keep Debian's
   * snippets. The filename is derived from the vmid, so the reference can be
   * rebuilt without reading the current config.
   */
  adapters?: (NetworkAdapter & { vlan: number; bridge: string })[];
};

export const networkSnippetName = (vmid: number) => `ci-network-${vmid}.yml`;
export const vendorSnippetName = (vmid: number) => `ci-vendor-${vmid}.yml`;

/**
 * Uploads the guest's cloud-init snippets and points `cicustom` at them.
 *
 * Both files are written by this one step on purpose. `cicustom` is a single
 * Proxmox config key holding every custom file, so two steps writing it would
 * race and one would silently win - which is exactly what happened when the
 * network config owned it and vendor data was added beside it.
 *
 * Vendor data is the seam that replaces `virt-customize`: Proxmox generates
 * user-data from `ciuser`/`cipassword`/`sshkeys`, so taking that over would
 * cost us password resets and SSH key injection. Vendor data sits beside it and
 * loses to user-data on conflict, which is the correct precedence.
 */
export async function applyCloudInitStep({
  proxmoxNode: { snippetStorage, ...proxmoxNode },
  vmid,
  proxmoxTemplateId,
  adapters,
}: ApplyCloudInitStepParams) {
  "use step";

  const instance = getProxmoxInstance(proxmoxNode);
  const vm = instance.node.qemu.$(vmid);

  const parts: string[] = [];

  // --- network -------------------------------------------------------------
  const networkFilename = networkSnippetName(vmid);
  if (adapters) {
    await instance.uploadSnippet({
      filename: networkFilename,
      storage: snippetStorage,
      contents: generateCloudInitNetworkConfig(adapters),
    });
  }
  parts.push(`network=${snippetStorage}:snippets/${networkFilename}`);

  // --- vendor --------------------------------------------------------------
  const rendered = await renderTemplateVendorData({
    db,
    proxmoxTemplateId,
  });

  // A snippet that does not parse is skipped by the renderer rather than
  // throwing, so provisioning still succeeds - but it is a misconfiguration
  // somebody has to fix, and it must not be silent.
  for (const error of rendered.errors) {
    Sentry.captureMessage(
      `[applyCloudInitStep] Snippet "${error.slug}" was skipped for template ${proxmoxTemplateId}: ${error.message}`,
    );
  }

  for (const conflict of rendered.conflicts) {
    Sentry.captureMessage(
      `[applyCloudInitStep] Snippet "${conflict.nextSlug}" overrode "${conflict.path}" set by "${conflict.previousSlug}" for template ${proxmoxTemplateId}.`,
    );
  }

  let vendorFilename: string | null = null;
  if (rendered.content) {
    vendorFilename = vendorSnippetName(vmid);
    await instance.uploadSnippet({
      filename: vendorFilename,
      storage: snippetStorage,
      contents: rendered.content,
    });
    parts.push(`vendor=${snippetStorage}:snippets/${vendorFilename}`);
  }

  // Written once, with every part. An empty vendor document is deliberately
  // *not* uploaded: to cloud-init that is not the same as no vendor data.
  const cicustomUpid = await vm.config.$post({
    cicustom: parts.join(","),
  });

  return {
    cicustomUpid,
    networkFilename,
    vendorFilename,
    appliedSnippets: rendered.applied,
  };
}

export async function rollbackApplyCloudInitStep({
  proxmoxNode: { snippetStorage, ...proxmoxNode },
  vmid,
}: Pick<ApplyCloudInitStepParams, "proxmoxNode" | "vmid">) {
  "use step";

  const instance = getProxmoxInstance(proxmoxNode);

  await instance.node.qemu
    .$(vmid)
    .config.$put({ delete: "cicustom" })
    .catch(() => {
      // The guest may already be gone - a later rollback destroys it anyway.
    });

  // Both files are removed even if only one was written; deleting a snippet
  // that does not exist is not worth branching on.
  for (const filename of [networkSnippetName(vmid), vendorSnippetName(vmid)]) {
    try {
      await instance.node.storage
        .$(snippetStorage)
        .content.$(`${snippetStorage}:snippets/${filename}`)
        .$delete();
    } catch {
      // Never uploaded, or already cleaned up.
    }
  }
}
