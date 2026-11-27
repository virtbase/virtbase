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
 * `Proxmox.NodesNode` to import. Every type below therefore reaches into it by
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
  /**
   * The `Authorization` header value for the node's API token, for requests
   * that cannot go through `engine`: the multipart snippet upload and the
   * noVNC proxy's `vncwebsocket` dial. A bearer credential - never log it.
   */
  authorization: string;
  /** Returns the UPID of the download task - the caller has to poll it. */
  downloadUrl: (params: DownloadUrlParams) => Promise<string>;
  uploadSnippet: (params: UploadSnippetParams) => Promise<void>;
};

/**
 * Splits a node's `fqdn` into the host and port the client wants.
 *
 * `fqdn` carries a port only where the API is not on 443, as on the local
 * cluster in `tooling/proxbase` (`127.0.0.1:19001`); production nodes sit
 * behind TLS on 443 and store a bare name. The client rejects a port inside
 * `host` and defaults to Proxmox's own 8006, so 443 has to be passed
 * explicitly - leaving it out would send every request to the wrong port.
 */
export const parseNodeEndpoint = (
  fqdn: string,
): { host: string; port: number } => {
  const url = new URL(`https://${fqdn}`);

  return {
    host: url.hostname,
    // `URL` drops the scheme's default port, so 443 reads back as "".
    port: url.port ? Number(url.port) : 443,
  };
};

export const getProxmoxInstance = (
  proxmoxNode: GetProxmoxInstanceParams,
): ProxmoxInstance => {
  const { hostname, fqdn, tokenID, tokenSecret } = proxmoxNode;
  const engine = new ProxmoxEngine({
    ...parseNodeEndpoint(fqdn),
    tokenID,
    tokenSecret,
  });
  const authorization = `PVEAPIToken=${tokenID}=${tokenSecret}`;

  const proxmox = proxmoxApi(engine);
  const node = proxmox.nodes.$(hostname);
  const cluster = proxmox.cluster;

  return {
    proxmox,
    engine,
    node,
    hostname,
    cluster,
    authorization,
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
      const formData = new FormData();
      formData.append(
        "filename",
        new Blob([contents], { type: "text/plain" }),
        filename,
      );

      try {
        const url = new URL(
          `/api2/json/nodes/${hostname}/storage/${storage}/upload`,
          engine.origin,
        );
        url.searchParams.set("content", "snippets");
        url.searchParams.set("filename", encodeURIComponent(filename));

        const response = await fetch(url, {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: authorization,
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
