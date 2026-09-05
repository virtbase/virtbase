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

//import "server-only";

import type { Proxmox } from "@virtbase/proxmox-api";
import proxmoxApi, { ProxmoxEngine } from "@virtbase/proxmox-api";

export type GetProxmoxInstanceParams = {
  hostname: string;
  fqdn: string;
  tokenID: string;
  tokenSecret: string;
};

/**
 * Subtrees of the generated client, named so they can be written down.
 *
 * `Proxmox.Api` is one interface of inline anonymous objects - there is no
 * `Proxmox.nodesNode` to import. Every type below therefore reaches into it by
 * index rather than restating its shape, which is also what keeps the
 * declaration emit small: the PVE 9 model expands `net0`..`net31`,
 * `scsi0`..`scsi30` and `mp0`..`mp255`, so a single node subtree written out
 * structurally exceeds what the compiler will serialize (TS7056).
 */
export type ProxmoxNode = ReturnType<Proxmox.Api["nodes"]["$"]>;
export type ProxmoxCluster = Proxmox.Api["cluster"];

export type DownloadUrlParams = {
  storage: string;
  content: "iso" | "vztmpl" | "import";
  /**
   * Caution: Proxmox normalizes this. It must already consist of
   * `[a-zA-Z0-9-.+=_]` and carry an extension the content type accepts -
   * for `import` that is `.ova`, `.ovf`, `.qcow2`, `.raw` or `.vmdk`
   * (notably *not* `.img`).
   */
  filename: string;
  url: string;
  /** Requires `checksumAlgorithm`. Proxmox aborts the download on mismatch. */
  checksum?: string;
  checksumAlgorithm?:
    | "md5"
    | "sha1"
    | "sha224"
    | "sha256"
    | "sha384"
    | "sha512";
  /** Decompress after download, e.g. `zst` or `gz`. */
  compression?: string;
  verifyCertificates?: boolean;
};

export type UploadSnippetParams = {
  filename: string;
  storage: string;
  contents: string;
};

export type ProxmoxInstance = {
  proxmox: Proxmox.Api;
  engine: ProxmoxEngine;
  node: ProxmoxNode;
  hostname: string;
  cluster: ProxmoxCluster;
  /** Returns the UPID of the download task - the caller has to poll it. */
  downloadUrl: (params: DownloadUrlParams) => Promise<string>;
  uploadSnippet: (params: UploadSnippetParams) => Promise<void>;
};

export const getProxmoxInstance = (
  proxmoxNode: GetProxmoxInstanceParams,
): ProxmoxInstance => {
  const { hostname, fqdn, tokenID, tokenSecret } = proxmoxNode;
  const engine = new ProxmoxEngine({
    host: fqdn,
    tokenID,
    tokenSecret,
  });

  const proxmox = proxmoxApi(engine);
  const node = proxmox.nodes.$(hostname);
  const cluster = proxmox.cluster;

  return {
    proxmox,
    engine,
    node,
    hostname,
    cluster,
    // A thin adapter over the generated endpoint: camelCase names, and the two
    // parameters Proxmox couples (`checksum`/`checksum-algorithm`) passed as a
    // pair or not at all.
    downloadUrl: async ({
      storage,
      content,
      filename,
      url,
      checksum,
      checksumAlgorithm,
      compression,
      verifyCertificates = true,
    }: DownloadUrlParams): Promise<string> => {
      return node.storage.$(storage)["download-url"].$post({
        content,
        filename,
        url,
        ...(checksum && checksumAlgorithm
          ? { checksum, "checksum-algorithm": checksumAlgorithm }
          : {}),
        ...(compression ? { compression } : {}),
        "verify-certificates": verifyCertificates,
      });
    },
    // Need to place this here because Proxmox team is too lazy to implement this
    // in the official Proxmox VE API.
    // See: https://bugzilla.proxmox.com/show_bug.cgi?id=2208
    // This requires us to patch each Proxmox VE node with a custom API endpoint.
    // Unfortunately, engine.doRequest() does not support multipart/form-data requests.
    // So we have to use fetch() directly.
    uploadSnippet: async ({
      filename,
      storage,
      contents,
    }: UploadSnippetParams): Promise<void> => {
      let ticket: string | undefined;
      try {
        const ticketResponse = await engine.getTicket();
        ticket = ticketResponse.ticket;
      } catch {
        throw new Error(
          "[getProxmoxInstance] Failed to get or create ticket for snippet upload.",
        );
      }

      const formData = new FormData();
      formData.append(
        "filename",
        new Blob([contents], { type: "text/plain" }),
        filename,
      );

      try {
        const url = new URL(
          `https://${fqdn}/api2/json/nodes/${hostname}/storage/${storage}/upload`,
        );
        url.searchParams.set("content", "snippets");
        url.searchParams.set("filename", encodeURIComponent(filename));

        const response = await fetch(url, {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: ticket,
          },
          body: formData,
        });

        if (!response.ok) {
          throw new Error(
            `[getProxmoxInstance] Failed to upload snippet ${filename} to storage ${storage}: ${response.statusText}`,
          );
        }
      } catch {
        throw new Error(
          `[getProxmoxInstance] Fetch failed for snippet upload ${filename} to storage ${storage}.`,
        );
      }
    },
  };
};
