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

import { expect, test } from "@playwright/test";
import type { ClusterConfig } from "../support/cluster";
import { clusterIsReachable, readClusterConfig } from "../support/cluster";

/**
 * The three Proxmox patches in `tooling/pve-patches` are what make provisioning
 * work: without them cloud-init snippets cannot be uploaded, an uploaded
 * hookscript is not executable, and `hookscript` is rejected on VM config
 * updates. They are applied when the node image is built, so an upstream
 * Proxmox bump that breaks them would otherwise surface as a confusing
 * provisioning failure rather than a failing test.
 */
let cluster: ClusterConfig | null = null;
let skipReason = "";

const SNIPPET = "e2e-patch-probe.yml";
const HOOKSCRIPT = "e2e-patch-probe.pl";
const VMID = 9100;
const HOOKSCRIPT_VMID = 9101;

function auth(config: ClusterConfig) {
  return {
    Authorization: `PVEAPIToken=${config.tokenId}=${config.tokenSecret}`,
  };
}

function api(config: ClusterConfig, path: string) {
  return `https://${config.fqdn}/api2/json${path}`;
}

test.beforeAll(async () => {
  cluster = await readClusterConfig();

  if (!cluster) {
    skipReason =
      "no local Proxmox cluster - run ./tooling/proxmox-cluster/bootstrap.sh";
    return;
  }

  if (!(await clusterIsReachable(cluster))) {
    skipReason = process.env.NODE_EXTRA_CA_CERTS
      ? "cluster is configured but not answering - is it running?"
      : `cluster is configured but TLS is untrusted - export NODE_EXTRA_CA_CERTS=${cluster.caFile}`;
    cluster = null;
  }
});

test.beforeEach(() => {
  test.skip(!cluster, skipReason);
});

test.describe("proxmox patches", () => {
  // Every test here creates a guest and writes to the one shared snippet
  // storage on the same node. Run in parallel they race for the cluster's
  // VMID lock and a create silently loses, leaving the config update to fail
  // with "configuration file does not exist".
  test.describe.configure({ mode: "serial" });

  test("snippets can be uploaded to shared storage", async () => {
    const config = cluster as ClusterConfig;
    const node = config.nodes[0]?.hostname ?? "pve1";

    // Plain `fetch` with `FormData` rather than Playwright's `request.multipart`:
    // Proxmox's upload handler is particular about how the parts are encoded and
    // rejects Playwright's flavour with a bare "upload failed" from AnyEvent.pm.
    const form = new FormData();
    form.append("content", "snippets");
    form.append(
      "filename",
      new Blob(["#cloud-config\nhostname: e2e-probe\n"], { type: "text/yaml" }),
      SNIPPET,
    );

    // Stock Proxmox refuses `snippets` as an upload content type outright; this
    // only returns 200 with proxmox-snippet-upload.patch applied.
    const upload = await fetch(
      api(config, `/nodes/${node}/storage/${config.storage.snippet}/upload`),
      { method: "POST", headers: auth(config), body: form },
    );

    expect(upload.status, await upload.text()).toBe(200);

    await expect
      .poll(
        async () => {
          const list = await fetch(
            api(
              config,
              `/nodes/${node}/storage/${config.storage.snippet}/content?content=snippets`,
            ),
            { headers: auth(config) },
          );
          const body = (await list.json()) as {
            data: Array<{ volid: string }>;
          };
          return body.data.some((item) => item.volid.endsWith(SNIPPET));
        },
        { timeout: 20_000 },
      )
      .toBe(true);
  });

  test("hookscript is accepted on a VM config update", async ({ request }) => {
    const config = cluster as ClusterConfig;
    const node = config.nodes[0]?.hostname ?? "pve1";

    await request.post(api(config, `/nodes/${node}/qemu`), {
      headers: auth(config),
      form: { vmid: VMID, name: "e2e-patch-probe", memory: 512, cores: 1 },
    });

    const update = await request.put(
      api(config, `/nodes/${node}/qemu/${VMID}/config`),
      {
        headers: auth(config),
        form: { hookscript: `${config.storage.snippet}:snippets/${SNIPPET}` },
      },
    );

    const body = await update.text();

    // Stock Proxmox rejects the property outright ("not defined in schema").
    // With proxmox-hookscript.patch it is a known option, so the only complaint
    // left is that the uploaded snippet is not executable - which is a
    // different, and much later, failure.
    expect(body).not.toContain("not defined in schema");
    expect(update.ok() || body.includes("is not executable")).toBe(true);
  });

  test("an uploaded hookscript is executable", async ({ request }) => {
    const config = cluster as ClusterConfig;
    const node = config.nodes[0]?.hostname ?? "pve1";

    const form = new FormData();
    form.append("content", "snippets");
    form.append(
      "filename",
      new Blob(["#!/usr/bin/perl\nexit(0);\n"], { type: "text/plain" }),
      HOOKSCRIPT,
    );

    const upload = await fetch(
      api(config, `/nodes/${node}/storage/${config.storage.snippet}/upload`),
      { method: "POST", headers: auth(config), body: form },
    );

    expect(upload.status, await upload.text()).toBe(200);

    await request.post(api(config, `/nodes/${node}/qemu`), {
      headers: auth(config),
      form: {
        vmid: HOOKSCRIPT_VMID,
        name: "e2e-hookscript-probe",
        memory: 512,
        cores: 1,
      },
    });

    // `PVE::GuestHelpers::check_hookscript` refuses a script that is not
    // executable, and the upload API cannot express a file mode. Only
    // proxmox-snippet-mode.patch makes this succeed - without it the config
    // update fails with "is not executable", which is what the whole
    // provisioning flow hits at `applyHardwareConfigStep`.
    await expect
      .poll(
        async () => {
          const update = await request.put(
            api(config, `/nodes/${node}/qemu/${HOOKSCRIPT_VMID}/config`),
            {
              headers: auth(config),
              form: {
                hookscript: `${config.storage.snippet}:snippets/${HOOKSCRIPT}`,
              },
            },
          );
          return update.ok() ? "ok" : await update.text();
        },
        { timeout: 20_000 },
      )
      .toBe("ok");
  });

  test.afterAll(async ({ request }) => {
    if (!cluster) return;
    const config = cluster;
    const node = config.nodes[0]?.hostname ?? "pve1";

    for (const vmid of [VMID, HOOKSCRIPT_VMID]) {
      await request
        .delete(api(config, `/nodes/${node}/qemu/${vmid}?purge=1`), {
          headers: auth(config),
        })
        .catch(() => {});
    }
  });
});
