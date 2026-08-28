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

import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { getProxmoxInstance, runGuestCommand } from "@virtbase/api/proxmox";
import { refreshTemplateImages } from "@virtbase/api/template-images";
import { mockSession } from "@virtbase/api/testing/fixtures";
import {
  applyCloudInitStep,
  createGuestFromImageStep,
  getTemplateStep,
} from "@virtbase/api/workflows";
import { and, eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import {
  proxmoxIsoDownloads,
  proxmoxNodes,
  proxmoxTemplateImages,
  proxmoxTemplates,
  serverBackups,
  serverPlanPrices,
  serverPlans,
  servers,
  users,
} from "@virtbase/db/schema";
import { sessionCookies } from "../../../e2e/support/auth";

/**
 * The server the episodes are filmed on.
 *
 * A real guest on the local Proxmox cluster, not a fixture. Every number the
 * firewall page shows is read back out of Proxmox and out of the guest itself,
 * so a recording cannot quietly show a state the product could never produce -
 * which is the failure mode of demo videos shot against stubbed data.
 *
 * The guest is deliberately imperfect, and imperfect in exactly three ways: it
 * has a Redis reachable from anywhere, a rule holding a port nothing listens
 * on, and a rule for a port its own ufw closes again. Those are the three
 * findings the recommendations card can raise, and an episode about a feature
 * that finds nothing shows nothing.
 *
 * It also runs ufw, which is the only way to film the second half of the
 * feature: the warning, the merged rule table and the finding that exists
 * precisely because two firewalls disagree all need a firewall inside the
 * server to disagree with.
 */
export const DEMO_SERVER_ID = "kvm_00000000000000000000000FW";

/**
 * The account the episodes are filmed through.
 *
 * The same fixture the E2E suite signs in as, so one bootstrap mints a session
 * for both and the recording never needs a password or an inbox.
 */
export const CUSTOMER_ID = mockSession.user.id;

/** Where the recorder's session cookies are written. */
export const STORAGE_STATE = "e2e/.auth/video.json";

/**
 * Mints a session for the filmed account and writes it where Playwright reads
 * storage state from.
 *
 * Deliberately not `e2e/support/bootstrap.ts`, even though that is where this
 * came from. Bootstrap also mints an *admin* session, and its admin fixture
 * collides on email with the `admin@example.com` that `dev/seed` creates, so on
 * a developer database the row is never inserted under the fixture's id and
 * minting its cookies dies on a foreign key. The recording needs one customer,
 * so it takes only that half and leaves the suite's file alone.
 *
 * Unlike the suite, this runs under bun already, so `@virtbase/auth` can simply
 * be imported rather than pushed into a subprocess.
 */
export async function ensureSession(): Promise<string> {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.id, CUSTOMER_ID))
    .limit(1);

  if (!existing) {
    await db.insert(users).values(mockSession.user).onConflictDoNothing();
  }

  await mkdir(dirname(STORAGE_STATE), { recursive: true });
  await Bun.write(
    STORAGE_STATE,
    /* `origins` stays empty: a signed-in session needs no localStorage. */
    JSON.stringify({ cookies: await sessionCookies(CUSTOMER_ID), origins: [] }),
  );

  return STORAGE_STATE;
}

/** `clean-dev-servers` recognises this prefix. */
const GUEST_NAME = "vb-dev-firewall";

const NETWORK = {
  mac: "BC:24:11:00:94:21",
  address: "172.30.0.91/24",
  gateway: "172.30.0.1",
} as const;

/**
 * The rules the guest starts every take with, top to bottom.
 *
 * Ordering matters twice over: the firewall evaluates top down, and the episode
 * points at the order on screen while explaining that. Proxmox prepends new
 * rules, so they are created back to front.
 */
const BASELINE_RULES = [
  { type: "in", action: "ACCEPT", proto: "tcp", dport: "22", comment: "SSH" },
  { type: "in", action: "ACCEPT", proto: "tcp", dport: "80", comment: "HTTP" },
  {
    type: "in",
    action: "ACCEPT",
    proto: "tcp",
    dport: "6379",
    comment: "Redis für die App",
  },
  /*
   * Open here, closed by ufw, and nothing listening on it - which is what
   * `BLOCKED_BY_GUEST_FIREWALL` is: a rule the customer wrote in Virtbase that
   * the firewall inside their own server undoes. See GUEST_FIREWALL below.
   */
  {
    type: "in",
    action: "ACCEPT",
    proto: "tcp",
    dport: "9000",
    comment: "Metriken",
  },
  {
    type: "in",
    action: "ACCEPT",
    proto: "tcp",
    dport: "8080",
    comment: "Alter Test-Port",
  },
] as const;

/**
 * What the guest runs so the analysis has something true to report.
 *
 * `nginx` gives port 80 a real listener, so the rule above it is not flagged.
 * `redis-server` is bound to every interface with protected mode off, which is
 * the misconfiguration the critical finding is about - and is exactly how Redis
 * behaves when somebody edits the config to reach it from another machine.
 */
const PROVISION_SERVICES = [
  "set -e",
  "export DEBIAN_FRONTEND=noninteractive",
  "cloud-init status --wait >/dev/null 2>&1 || true",
  // Either missing is worth a refresh: a guest built before ufw joined this
  // list has redis already, and installing against package lists that never
  // mentioned ufw fails on a guest that is otherwise perfectly fine.
  "command -v redis-server >/dev/null 2>&1 && command -v ufw >/dev/null 2>&1 || apt-get update -qq",
  "apt-get install -y -qq --no-install-recommends nginx redis-server ufw",
  "sed -i 's/^bind .*/bind 0.0.0.0/' /etc/redis/redis.conf",
  "sed -i 's/^protected-mode .*/protected-mode no/' /etc/redis/redis.conf",
  // Port 443 has to answer, because the episode creates a rule for it. An
  // opened port with nothing behind it is a finding of its own, and the video
  // would end up watching the product flag the rule it had just helped create.
  // Plain HTTP on the TLS port: nothing here is a demonstration of TLS.
  "printf 'server {\\n listen 443 default_server;\\n root /var/www/html;\\n index index.html;\\n}\\n' > /etc/nginx/sites-available/virtbase-443",
  "ln -sf /etc/nginx/sites-available/virtbase-443 /etc/nginx/sites-enabled/virtbase-443",
  "nginx -t",
  "systemctl enable --now nginx redis-server",
  "systemctl restart nginx redis-server",
  "exit 0",
].join("\n");

/**
 * The firewall the guest runs of its own accord, put back to the baseline.
 *
 * ufw rather than plain iptables because it is what somebody on a Debian VPS
 * actually installs, and because Virtbase has a parser for it: a manager it can
 * detect but not read renders as a warning with no rules underneath, which is
 * the honest fallback and the duller scene.
 *
 * The allow list is what keeps the three findings apart, and each entry is load
 * bearing:
 *
 * - `6379` is allowed on both sides, so Redis genuinely is reachable from the
 *   internet and the critical finding is true rather than staged.
 * - `8080` is allowed here as well, so the Virtbase rule for it stays an
 *   *orphan* - a rule with nothing behind it - instead of turning into the
 *   blocked-by-the-guest finding the moment ufw came along.
 * - `9000` is deliberately absent, so ufw's default deny answers for it. That
 *   is the finding that cannot exist without a second firewall.
 * - `22`, `80` and `443` are allowed because the episode leans on them being
 *   ordinary: they are open on nearly every server, and the recommendations
 *   card says nothing about them on purpose.
 *
 * Run on every take rather than only at build time. `--force reset` is what
 * makes that safe: it drops whatever a previous take or a hand-run `ufw`
 * command left behind, including the default policies.
 */
const GUEST_FIREWALL = [
  "set -e",
  "ufw --force reset >/dev/null",
  "ufw default deny incoming >/dev/null",
  "ufw default allow outgoing >/dev/null",
  "ufw allow 22/tcp >/dev/null",
  "ufw allow 80/tcp >/dev/null",
  "ufw allow 443/tcp >/dev/null",
  "ufw allow 6379/tcp >/dev/null",
  "ufw allow 8080/tcp >/dev/null",
  "ufw --force enable >/dev/null",
  "exit 0",
].join("\n");

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

type Node = typeof proxmoxNodes.$inferSelect;

async function pickNode(): Promise<Node> {
  const [node] = await db.select().from(proxmoxNodes).limit(1);
  if (!node)
    throw new Error("no Proxmox node registered - bun script dev/cluster");

  return node;
}

/**
 * The Debian template, ready to clone.
 *
 * `verify-guest-os` leaves behind a template that claims to be AlmaLinux, on
 * purpose. Filming on it would put the wrong logo on screen, so it is skipped
 * by id rather than by hoping it sorts last.
 */
async function pickTemplate(): Promise<string> {
  const templates = await db
    .select()
    .from(proxmoxTemplates)
    .where(eq(proxmoxTemplates.enabled, true));

  const template = templates.find(
    (row) => row.osFamily === "debian" && !row.name.includes("deliberately"),
  );

  if (!template) throw new Error("no enabled Debian template to film on");

  /*
   * The seeded Debian template leaves `packageManager` and `initSystem` null,
   * and `base-guest-agent` is targeted at `packageManager: [apt, dnf, yum,
   * apk]`. A template with neither therefore boots a guest with no
   * `qemu-guest-agent` - which is silent until the firewall page has no
   * listening ports to analyse and the recommendations card never appears.
   *
   * Filled in rather than worked around: "Debian installs with apt under
   * systemd" is not a fact about this recording.
   */
  if (!(template.packageManager && template.initSystem)) {
    console.log("[scene] completing the template's package metadata");

    await db
      .update(proxmoxTemplates)
      .set({
        packageManager: template.packageManager ?? "apt",
        initSystem: template.initSystem ?? "systemd",
      })
      .where(eq(proxmoxTemplates.id, template.id));
  }

  return template.id;
}

/** Downloads the template's disk image if the cluster does not have it yet. */
async function warmImage(templateId: string): Promise<void> {
  for (let attempt = 0; attempt < 180; attempt++) {
    await refreshTemplateImages({ db });

    const [image] = await db
      .select()
      .from(proxmoxTemplateImages)
      .where(eq(proxmoxTemplateImages.proxmoxTemplateId, templateId))
      .limit(1);

    if (image?.downloadedAt) return;
    if (image?.failedAt) {
      throw new Error(`template image download failed: ${image.lastError}`);
    }

    if (attempt === 0) console.log("[scene] warming the template image");
    await sleep(5_000);
  }

  throw new Error("the template image never finished downloading");
}

/**
 * Waits for a Proxmox task and fails when the task did.
 *
 * `status` only reports whether the task is still running; a clone that died
 * because Ceph was not ready reads as "stopped" like any other. The verdict is
 * in `exitstatus`, and skipping it turns a storage failure into a confusing
 * error several steps later about a config file that was never written.
 */
async function waitForTask(
  instance: ReturnType<typeof getProxmoxInstance>,
  upid: string,
): Promise<void> {
  for (let attempt = 0; attempt < 600; attempt++) {
    const status = await instance.node.tasks.$(upid).status.$get();

    if (status.status === "stopped") {
      if (status.exitstatus && status.exitstatus !== "OK") {
        throw new Error(`Proxmox task failed: ${status.exitstatus}`);
      }

      return;
    }

    await sleep(1_000);
  }

  throw new Error(`Proxmox task did not finish: ${upid}`);
}

/** True when the guest already exists, is running and its agent answers. */
async function isLive(node: Node, vmid: number): Promise<boolean> {
  const vm = getProxmoxInstance(node).node.qemu.$(vmid);

  try {
    const status = await vm.status.current.$get();
    if (status.status !== "running") return false;

    await vm.agent.info.$get();
    return true;
  } catch {
    return false;
  }
}

async function provision(node: Node, templateId: string): Promise<number> {
  await warmImage(templateId);

  const template = await getTemplateStep({
    proxmoxTemplateId: templateId,
    proxmoxNode: node,
  });

  const instance = getProxmoxInstance(node);

  console.log("[scene] cloning the guest");
  const { createdVmid, createUpid } = await createGuestFromImageStep({
    proxmoxNode: node,
    volid: template.volid,
    storage: node.vmStorage,
    template,
    name: GUEST_NAME,
  });
  await waitForTask(instance, createUpid);

  await instance.node.qemu.$(createdVmid).config.$put({
    memory: "2048",
    cores: 2,
    agent: "enabled=1",
    ciuser: "root",
    cipassword: crypto.randomUUID(),
    ciupgrade: false,
    nameserver: "9.9.9.9",
    serial0: "socket",
    vga: "std",
    net0: `virtio=${NETWORK.mac},bridge=vmbr0`,
  } as never);

  const { cicustomUpid } = await applyCloudInitStep({
    proxmoxNode: node,
    vmid: createdVmid,
    proxmoxTemplateId: templateId,
    adapters: [
      {
        macaddress: NETWORK.mac,
        addresses: { 4: [NETWORK.address], 6: [] },
        gateways: { 4: [NETWORK.gateway], 6: [] },
        vlan: 0,
        bridge: "vmbr0",
      },
    ],
  });
  await waitForTask(instance, cicustomUpid);

  console.log("[scene] booting");
  await instance.node.qemu.$(createdVmid).status.start.$post({});

  return createdVmid;
}

async function waitForAgent(node: Node, vmid: number): Promise<void> {
  const vm = getProxmoxInstance(node).node.qemu.$(vmid);
  const deadline = Date.now() + 480_000;

  while (Date.now() < deadline) {
    try {
      await vm.agent.info.$get();
      console.log("[scene] the guest agent is up");
      return;
    } catch {
      await sleep(5_000);
    }
  }

  throw new Error("the guest agent never answered");
}

/**
 * Installs and configures the services the analysis is meant to find.
 *
 * Run on every take, not only on a fresh guest: the script is idempotent, and
 * a guest that has been rebooted, or one built before the script last changed,
 * is otherwise a scene that quietly differs from the one the episode was
 * written against.
 */
async function ensureServices(node: Node, vmid: number): Promise<void> {
  const vm = getProxmoxInstance(node).node.qemu.$(vmid);

  console.log("[scene] installing nginx and redis inside the guest");

  const result = await runGuestCommand(
    vm,
    ["/bin/sh", "-c", PROVISION_SERVICES],
    {
      timeoutMs: 420_000,
      pollIntervalMs: 3_000,
    },
  );

  if (result.status !== "ok" || result.exitCode !== 0) {
    throw new Error(
      `could not install the demo services: ${JSON.stringify(result)}`,
    );
  }
}

/**
 * Puts the firewall inside the guest back to the baseline.
 *
 * Safe over the guest agent, which is the only reason this is not reckless:
 * the agent speaks over a virtio serial channel rather than the network, so
 * enabling a firewall that denies everything inbound cannot cut the connection
 * this command arrived on.
 */
async function ensureGuestFirewall(node: Node, vmid: number): Promise<void> {
  const vm = getProxmoxInstance(node).node.qemu.$(vmid);

  console.log("[scene] putting ufw inside the guest back to the baseline");

  const result = await runGuestCommand(vm, ["/bin/sh", "-c", GUEST_FIREWALL], {
    timeoutMs: 120_000,
  });

  if (result.status !== "ok" || result.exitCode !== 0) {
    throw new Error(
      `could not configure ufw inside the guest: ${JSON.stringify(result)}`,
    );
  }
}

/**
 * Takes back every custom image the filmed account holds, and empties the drive.
 *
 * The same four steps `/api/cron/delete-expired-iso-images` performs, applied
 * regardless of expiry: detach the image from any server, cancel the download
 * task, delete the volume off the storage, drop the row. Deleting only the rows
 * would leave the cluster accumulating a gigabyte of ISO per take, invisible to
 * the dashboard and visible to nobody until the storage filled up.
 *
 * Proxmox is allowed to fail at any of it. A task that has already been reaped
 * or a volume that was never written are both fine - the point is to arrive at
 * an account with no images, and a 500 from a delete that had nothing to delete
 * should not stop a recording.
 */
async function resetIsoImages(
  node: Node,
  vmid: number,
  userId: string,
): Promise<void> {
  const instance = getProxmoxInstance(node);

  const images = await db
    .select({
      id: proxmoxIsoDownloads.id,
      upid: proxmoxIsoDownloads.upid,
      failedAt: proxmoxIsoDownloads.failedAt,
    })
    .from(proxmoxIsoDownloads)
    .where(eq(proxmoxIsoDownloads.userId, userId));

  for (const image of images) {
    if (!image.failedAt) {
      await instance.node.tasks
        .$(image.upid)
        .$delete()
        .catch(() => {});

      await instance.node.storage
        .$(node.isoDownloadStorage)
        .content.$(`${node.isoDownloadStorage}:iso/${image.id}.iso`)
        .$delete()
        .catch(() => {});
    }
  }

  await db
    .update(servers)
    .set({ proxmoxIsoDownloadId: null })
    .where(eq(servers.id, DEMO_SERVER_ID));

  await db
    .delete(proxmoxIsoDownloads)
    .where(eq(proxmoxIsoDownloads.userId, userId));

  /*
   * The drive itself, and the boot order that pointed at it. Mounting sets
   * `boot: order=ide0;scsi0` so the guest comes up on the image; leaving that
   * behind on a guest with no `ide0` boots a server the episode never showed.
   */
  await instance.node.qemu
    .$(vmid)
    .config.$put({ delete: "ide0", boot: "order=scsi0" } as never)
    .catch(() => {});

  console.log(`[scene] ${images.length} custom images taken back`);
}

/**
 * Waits until the server is neither being installed nor mid-restore.
 *
 * The backups episode is the one that can leave the scene unfinished. A
 * restore stops the guest, replaces its disk and starts it again, and the
 * mutation returns the moment the workflow is queued - so the take ends while
 * the server is still down. `ensureDemoServer` would then find a guest that is
 * not live and quietly *build a second one*, because "not running" and "does
 * not exist" look the same from there.
 *
 * So this runs first, before anything else touches the scene. `installedAt` is
 * the same flag the dashboard reads: the restore workflow nulls it on the way
 * in and stamps it on the way out, which makes it the one signal that covers
 * the whole operation rather than a window inside it.
 */
async function awaitServerReady(node: Node, serverId: string): Promise<void> {
  const deadline = Date.now() + 900_000;
  let announced = false;

  while (Date.now() < deadline) {
    const [row] = await db
      .select({ vmid: servers.vmid, installedAt: servers.installedAt })
      .from(servers)
      .where(eq(servers.id, serverId))
      .limit(1);

    /* No row at all is not a wait - it is a scene that has to be built. */
    if (!row) return;

    if (row.installedAt && (await isLive(node, row.vmid))) return;

    if (!announced) {
      announced = true;
      console.log("[scene] waiting for the server to come back");
    }

    await sleep(5_000);
  }

  throw new Error("the server never came back from its restore");
}

/**
 * Empties the server's backup list, rows and archives both.
 *
 * Driven off the storage rather than off the rows, because the two can
 * disagree in either direction and both leftovers break the episode: a row
 * without an archive puts a backup in the list the video then fails to
 * restore, and an archive without a row is a few hundred megabytes per take
 * that nothing in the dashboard will ever offer to delete.
 *
 * A protected archive is unprotected first. That is the deletion protection
 * this episode is partly about, and it reaches into Proxmox rather than
 * stopping at the database - so a take that ends with the lock on would
 * otherwise be a take that can never be filmed again.
 */
async function resetBackups(
  node: Node,
  vmid: number,
  serverId: string,
): Promise<void> {
  const instance = getProxmoxInstance(node);
  const storage = instance.node.storage.$(node.backupStorage);

  const archives = await storage.content
    .$get({ content: "backup" } as never)
    .catch(() => [] as Array<{ volid: string; vmid?: number }>);

  const mine = archives.filter((archive) => archive.vmid === vmid);

  for (const archive of mine) {
    await storage.content
      .$(archive.volid)
      .$put({ protected: false } as never)
      .catch(() => {});

    await storage.content
      .$(archive.volid)
      .$delete()
      .catch(() => {});
  }

  await db.delete(serverBackups).where(eq(serverBackups.serverId, serverId));

  console.log(`[scene] ${mine.length} backup archives taken back`);
}

/** Replaces whatever rules a previous take left behind with the baseline. */
async function resetFirewall(node: Node, vmid: number): Promise<void> {
  const vm = getProxmoxInstance(node).node.qemu.$(vmid);

  const existing = await vm.firewall.rules.$get();
  /* Back to front: deleting by position renumbers everything below it. */
  for (const rule of [...existing].sort((a, b) => b.pos - a.pos)) {
    await vm.firewall.rules.$(String(rule.pos)).$delete({});
  }

  await vm.firewall.options.$put({
    enable: 1,
    policy_in: "DROP",
    policy_out: "ACCEPT",
  } as never);

  /* Proxmox prepends, so the list is created bottom up. */
  for (const rule of [...BASELINE_RULES].reverse()) {
    await vm.firewall.rules.$post({ ...rule, enable: 1 } as never);
  }

  console.log(`[scene] ${BASELINE_RULES.length} baseline rules in place`);
}

/**
 * Makes sure the database row the dashboard reads points at this guest.
 *
 * The row is owned by the seeded customer rather than by whoever ran the
 * script, because the episode is filmed through that customer's session.
 */
async function upsertServerRow(
  node: Node,
  vmid: number,
  templateId: string,
  userId: string,
): Promise<void> {
  const plans = await db.select().from(serverPlans);
  const plan = plans.find((row) => row.id.startsWith("pck_"));
  const prices = await db.select().from(serverPlanPrices);
  const price = prices.find((row) => row.serverPlanId === plan?.id);

  if (!(plan && price))
    throw new Error("seed the plans first: bun script dev/seed");

  /* A freed vmid gets handed straight back out, so a stale row may hold it. */
  await db
    .delete(servers)
    .where(and(eq(servers.proxmoxNodeId, node.id), eq(servers.vmid, vmid)));

  await db.insert(servers).values({
    id: DEMO_SERVER_ID,
    userId,
    serverPlanId: plan.id,
    serverPlanPriceId: price.id,
    proxmoxNodeId: node.id,
    proxmoxTemplateId: templateId,
    name: "web-01",
    vmid,
    installedAt: new Date(),
  });
}

export interface SceneOptions {
  /** The user whose session the episode is filmed through. */
  userId: string;
  /** Destroy and rebuild the guest rather than reusing a live one. */
  rebuild?: boolean;
}

/**
 * Brings the demo server up, whichever episode is about to be filmed.
 *
 * Everything every episode needs and nothing any single one does: a live guest
 * owned by the filmed account, with the services the dashboard reads back. The
 * per-episode state - firewall rules, mounted images - is reset by the scene
 * that cares about it.
 *
 * Safe to run repeatedly. A guest that is already up is reused, which takes
 * seconds rather than the several minutes a fresh one costs.
 */
async function ensureDemoServer({
  userId,
  rebuild,
}: SceneOptions): Promise<{ node: Node; vmid: number }> {
  const node = await pickNode();
  const templateId = await pickTemplate();

  /*
   * The dashboard has no locale in its URL - `i18n/request.ts` reads the
   * signed-in user's column. Filming a German episode therefore starts with
   * putting the account into German, not with a query parameter.
   */
  await db.update(users).set({ locale: "de" }).where(eq(users.id, userId));

  const [existing] = await db
    .select()
    .from(servers)
    .where(eq(servers.id, DEMO_SERVER_ID))
    .limit(1);

  let vmid = existing?.vmid;

  if (!rebuild && vmid && (await isLive(node, vmid))) {
    console.log(`[scene] reusing guest ${vmid}`);
  } else {
    if (rebuild && vmid) {
      const instance = getProxmoxInstance(node);
      console.log(`[scene] destroying guest ${vmid}`);
      await instance.node.qemu
        .$(vmid)
        .status.stop.$post({})
        .catch(() => {});
      await sleep(5_000);
      await instance.node.qemu
        .$(vmid)
        .$delete({ purge: 1, "destroy-unreferenced-disks": 1 } as never)
        .catch(() => {});
      await db.delete(servers).where(eq(servers.id, DEMO_SERVER_ID));
    }

    vmid = await provision(node, templateId);
    await upsertServerRow(node, vmid, templateId, userId);
    await waitForAgent(node, vmid);
  }

  /*
   * Ownership is asserted on every run, not only when the guest is built.
   * Two pipelines film this server as two different accounts, and whichever
   * ran last used to leave the other looking at a 404 - the row is only ever
   * reachable by the user it belongs to.
   */
  await db
    .update(servers)
    .set({ userId })
    .where(eq(servers.id, DEMO_SERVER_ID));

  await ensureServices(node, vmid);

  return { node, vmid };
}

/**
 * Brings the cluster into the state the firewall episode is filmed in.
 */
export async function prepareFirewallScene(
  options: SceneOptions,
): Promise<string> {
  const { node, vmid } = await ensureDemoServer(options);

  await ensureGuestFirewall(node, vmid);
  await resetFirewall(node, vmid);

  return DEMO_SERVER_ID;
}

/**
 * Brings the cluster into the state the custom image episode is filmed in.
 *
 * Which means: no images and nothing mounted. Both matter. A customer may hold
 * three active images at once, so a few takes without a reset would film the
 * limit being refused rather than the feature working, and an image left in the
 * drive would have the episode mount something that is already there.
 */
export async function prepareIsoScene(options: SceneOptions): Promise<string> {
  const { node, vmid } = await ensureDemoServer(options);

  await resetIsoImages(node, vmid, options.userId);

  return DEMO_SERVER_ID;
}

/**
 * Brings the cluster into the state the backups episode is filmed in.
 *
 * Which means: an empty list. The episode opens on the empty state and creates
 * the backup it later locks, restores and deletes, so the one thing it cannot
 * start with is somebody else's backup - the whole edit hangs off "this is the
 * one we just made".
 *
 * The wait comes before the guest is ensured rather than after, for the reason
 * in `awaitServerReady`: half a restore looks exactly like a missing server.
 */
export async function prepareBackupsScene(
  options: SceneOptions,
): Promise<string> {
  const node = await pickNode();
  await awaitServerReady(node, DEMO_SERVER_ID);

  const { vmid } = await ensureDemoServer(options);

  await resetBackups(node, vmid, DEMO_SERVER_ID);

  return DEMO_SERVER_ID;
}
