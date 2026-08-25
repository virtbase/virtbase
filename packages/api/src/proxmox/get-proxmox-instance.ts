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

import proxmoxApi, { ProxmoxEngine } from "proxmox-api";

export type GetProxmoxInstanceParams = {
  hostname: string;
  fqdn: string;
  tokenID: string;
  tokenSecret: string;
};

export const getProxmoxInstance = (proxmoxNode: GetProxmoxInstanceParams) => {
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
    // Extend the proxmox-api client with additional methods that are not part of the package
    cluster: Object.assign(cluster, {
      "bulk-action": {
        guest: {
          shutdown: {
            async $post(params: {
              "force-stop"?: boolean;
              maxworkers?: number;
              timeout?: number;
              vms?: number[];
            }): Promise<string> {
              return engine.doRequest(
                "POST",
                "/api2/json/cluster/bulk-action/guest/shutdown",
                "/api2/json/cluster/bulk-action/guest/shutdown",
                params,
              );
            },
          },
        },
      },
      ha: {
        rules: {
          $post(params: {
            type: "node-affinity" | "resource-affinity";
            rule: string;
            resources: string;
            strict?: boolean | 0 | 1;
            affinity?: "positive" | "negative";
            comment?: string;
            disable?: boolean | 0 | 1;
            nodes?: string;
          }): Promise<null> {
            return engine.doRequest(
              "POST",
              "/api2/json/cluster/ha/rules",
              "/api2/json/cluster/ha/rules",
              params,
            );
          },
          $(rule: string) {
            return {
              async $put(params: {
                type: "node-affinity" | "resource-affinity";
                affinity?: "positive" | "negative";
                comment?: string;
                delete?: string;
                digest?: string;
                disable?: boolean | 0 | 1;
                nodes?: string;
                resources?: string;
                strict?: boolean | 0 | 1;
              }): Promise<null> {
                return engine.doRequest(
                  "PUT",
                  `/api2/json/cluster/ha/rules/${rule}`,
                  "/api2/json/cluster/ha/rules/*",
                  params,
                );
              },
            };
          },
        },
      },
    }),
    // `proxmox-api`'s generated typings predate the `import` content type: they
    // declare this endpoint's `content` as `'iso' | 'vztmpl'`, while PVE 9 also
    // accepts `import` (verified in API2/Storage/Status.pm). Rather than cast at
    // every call site, the endpoint is re-declared here with the enum Proxmox
    // actually implements.
    //
    // Returns the UPID of the download task - the caller has to poll it.
    downloadUrl: async ({
      storage,
      content,
      filename,
      url,
      checksum,
      checksumAlgorithm,
      compression,
      verifyCertificates = true,
    }: {
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
    }): Promise<string> => {
      return engine.doRequest(
        "POST",
        `/api2/json/nodes/${hostname}/storage/${storage}/download-url`,
        "/api2/json/nodes/*/storage/*/download-url",
        {
          content,
          filename,
          url,
          ...(checksum && checksumAlgorithm
            ? { checksum, "checksum-algorithm": checksumAlgorithm }
            : {}),
          ...(compression ? { compression } : {}),
          "verify-certificates": verifyCertificates,
        },
      );
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
    }: {
      filename: string;
      storage: string;
      contents: string;
    }) => {
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

export type ProxmoxInstance = Awaited<ReturnType<typeof getProxmoxInstance>>;
