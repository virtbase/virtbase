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

import type {
  ListProxmoxIsoDownloadsInputSchema,
  ListProxmoxIsoDownloadsOutputSchema,
} from "@virtbase/validators";
import type {
  ChangeTemplateServerInputSchema,
  CreateServerBackupInputSchema,
  CreateServerBackupOutputSchema,
  CreateServerFirewallRuleInputSchema,
  DeletePointerRecordInputSchema,
  DeleteServerBackupInputSchema,
  DeleteServerFirewallRuleInputSchema,
  GetServerAdvancedInputSchema,
  GetServerAdvancedOutputSchema,
  GetServerBackupInputSchema,
  GetServerBackupOutputSchema,
  GetServerConsoleOutputSchema,
  GetServerFirewallOptionsInputSchema,
  GetServerFirewallOptionsOutputSchema,
  GetServerFirewallRulesInputSchema,
  GetServerFirewallRulesOutputSchema,
  GetServerGraphsInputSchema,
  GetServerGraphsOutputSchema,
  GetServerInputSchema,
  GetServerOutputSchema,
  GetServerPlanInputSchema,
  GetServerPlanOutputSchema,
  GetServerStatusInputSchema,
  GetServerStatusOutputSchema,
  GetServerTemplateGroupsInputSchema,
  GetServerTemplateGroupsOutputSchema,
  ListPointerRecordsInputSchema,
  ListPointerRecordsOutputSchema,
  ListServerBackupsInputSchema,
  ListServerBackupsOutputSchema,
  ListServersInputSchema,
  ListServersOutputSchema,
  MountServerImageInputSchema,
  MoveServerFirewallRuleInputSchema,
  RenameServerInputSchema,
  ResetServerPasswordServerInputSchema,
  RestoreServerBackupInputSchema,
  UnmountServerImageInputSchema,
  UpdateServerAdvancedInputSchema,
  UpdateServerBackupInputSchema,
  UpdateServerBackupOutputSchema,
  UpdateServerFirewallOptionsInputSchema,
  UpdateServerFirewallRuleInputSchema,
  UpdateServerStatusInputSchema,
  UpsertPointerRecordInputSchema,
  UpsertPointerRecordOutputSchema,
} from "@virtbase/validators/server";
import type * as z from "zod";

/**
 * Who the integration is acting on behalf of. Implementations are responsible
 * for the same ownership checks `serverProcedure` performs — a port is not a
 * way around authorization.
 */
export interface ServerManagementActor {
  userId: string;
}

/**
 * Why a server management call failed, in terms a caller can branch on without
 * knowing the transport. Mirrors the subset of tRPC error codes the Discord
 * handlers actually distinguish.
 */
export type ServerManagementErrorCode =
  | "not_found"
  | "forbidden"
  | "unauthorized"
  | "invalid_input"
  | "rate_limited"
  | "conflict"
  | "internal";

/**
 * Replaces the `TRPCError` checks the Discord handlers do today. Implementations
 * translate their own transport errors into this, so a consumer never imports
 * `@trpc/server` — or `@virtbase/api` — to tell "server is gone" from "the
 * request blew up".
 */
export class ServerManagementError extends Error {
  readonly code: ServerManagementErrorCode;

  constructor(
    code: ServerManagementErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ServerManagementError";
    this.code = code;
  }
}

/**
 * One method of the port: inputs are `z.input` and outputs are `z.output` on
 * purpose. `sort` and `expand` carry schema defaults, so callers must be
 * allowed to omit them while implementations still see them filled in.
 */
type Call<TInput extends z.ZodType, TOutput = void> = (
  actor: ServerManagementActor,
  input: z.input<TInput>,
) => Promise<TOutput>;

/** Power state and live resource usage. */
export interface ServerStatusOperations {
  get: Call<
    typeof GetServerStatusInputSchema,
    z.output<typeof GetServerStatusOutputSchema>
  >;
  update: Call<typeof UpdateServerStatusInputSchema>;
}

/**
 * Backups. `create` and `restore` are long-running Proxmox tasks: they return
 * as soon as the task is accepted, and the row settles later through
 * `reconcileServerBackup()`.
 */
export interface ServerBackupOperations {
  list: Call<
    typeof ListServerBackupsInputSchema,
    z.output<typeof ListServerBackupsOutputSchema>
  >;
  get: Call<
    typeof GetServerBackupInputSchema,
    z.output<typeof GetServerBackupOutputSchema>
  >;
  create: Call<
    typeof CreateServerBackupInputSchema,
    z.output<typeof CreateServerBackupOutputSchema>
  >;
  update: Call<
    typeof UpdateServerBackupInputSchema,
    z.output<typeof UpdateServerBackupOutputSchema>
  >;
  delete: Call<typeof DeleteServerBackupInputSchema>;
  restore: Call<typeof RestoreServerBackupInputSchema>;
}

/**
 * Historical resource usage, as Proxmox's RRD keeps it.
 *
 * Separate from `status`, which is the instantaneous reading: this is the
 * series behind it, and the only thing that answers "was it like this an hour
 * ago?".
 */
export interface ServerGraphOperations {
  get: Call<
    typeof GetServerGraphsInputSchema,
    z.output<typeof GetServerGraphsOutputSchema>
  >;
}

/** Reverse DNS records for the server's allocated addresses. */
export interface ServerRdnsOperations {
  list: Call<
    typeof ListPointerRecordsInputSchema,
    z.output<typeof ListPointerRecordsOutputSchema>
  >;
  upsert: Call<
    typeof UpsertPointerRecordInputSchema,
    z.output<typeof UpsertPointerRecordOutputSchema>
  >;
  delete: Call<typeof DeletePointerRecordInputSchema>;
}

/**
 * The Proxmox firewall.
 *
 * Rules are addressed by position, and every mutation carries the `digest` the
 * rules were read with — Proxmox rejects a write whose digest is stale, which
 * is what stops two concurrent edits from silently clobbering each other.
 */
export interface ServerFirewallOperations {
  options: {
    get: Call<
      typeof GetServerFirewallOptionsInputSchema,
      z.output<typeof GetServerFirewallOptionsOutputSchema>
    >;
    update: Call<typeof UpdateServerFirewallOptionsInputSchema>;
  };
  rules: {
    list: Call<
      typeof GetServerFirewallRulesInputSchema,
      z.output<typeof GetServerFirewallRulesOutputSchema>
    >;
    create: Call<typeof CreateServerFirewallRuleInputSchema>;
    update: Call<typeof UpdateServerFirewallRuleInputSchema>;
    delete: Call<typeof DeleteServerFirewallRuleInputSchema>;
    move: Call<typeof MoveServerFirewallRuleInputSchema>;
  };
}

/**
 * Attaching and detaching an installer image.
 *
 * `list` is the customer's own ISO library rather than anything server-scoped,
 * but it lives here because picking an image to mount is the only reason this
 * port has to know about it.
 */
export interface ServerMountOperations {
  list: Call<
    typeof ListProxmoxIsoDownloadsInputSchema,
    z.output<typeof ListProxmoxIsoDownloadsOutputSchema>
  >;
  mount: Call<typeof MountServerImageInputSchema>;
  unmount: Call<typeof UnmountServerImageInputSchema>;
}

/**
 * Everything that changes what the server *is* rather than what it is doing.
 *
 * `changeTemplate` reinstalls the machine and destroys its disk, which is why
 * it sits here next to `rename` rather than among the status operations.
 */
export interface ServerLifecycleOperations {
  rename: Call<typeof RenameServerInputSchema>;
  changeTemplate: Call<typeof ChangeTemplateServerInputSchema>;
  plan: Call<
    typeof GetServerPlanInputSchema,
    z.output<typeof GetServerPlanOutputSchema>
  >;
  templateGroups: Call<
    typeof GetServerTemplateGroupsInputSchema,
    z.output<typeof GetServerTemplateGroupsOutputSchema>
  >;
  advanced: {
    get: Call<
      typeof GetServerAdvancedInputSchema,
      z.output<typeof GetServerAdvancedOutputSchema>
    >;
    update: Call<typeof UpdateServerAdvancedInputSchema>;
  };
}

/**
 * The surface an out-of-band client (Discord today, Telegram or a CLI later)
 * needs to manage servers.
 *
 * It is deliberately an interface rather than a tRPC caller. `@virtbase/discord`
 * used to import `appRouter` from `@virtbase/api`, which pointed a Layer 4
 * plug-in at Layer 5; this port is what replaces it, implemented in the
 * composition layer and fakeable in tests.
 *
 * Payload types are reused from `@virtbase/validators` so that implementation
 * stays a direct delegation and existing renderers keep compiling.
 *
 * The four flat methods came first and stay flat: the namespaces below were
 * added for the rest of the panel's surface, and renaming the originals would
 * have churned every call site for cosmetics.
 *
 * Every method rejects with a {@link ServerManagementError}.
 */
export interface ServerManagementPort {
  list: Call<
    typeof ListServersInputSchema,
    z.output<typeof ListServersOutputSchema>
  >;

  get: Call<
    typeof GetServerInputSchema,
    z.output<typeof GetServerOutputSchema>
  >;

  console(
    actor: ServerManagementActor,
    input: { server_id: string },
  ): Promise<z.output<typeof GetServerConsoleOutputSchema>>;

  resetPassword: Call<typeof ResetServerPasswordServerInputSchema>;

  status: ServerStatusOperations;
  graphs: ServerGraphOperations;
  backups: ServerBackupOperations;
  rdns: ServerRdnsOperations;
  firewall: ServerFirewallOperations;
  mounts: ServerMountOperations;
  lifecycle: ServerLifecycleOperations;
}

/** Convenience aliases so renderers do not re-derive these from the schemas. */
export type ManagedServer = z.output<typeof GetServerOutputSchema>["server"];
export type ManagedServerListItem = z.output<
  typeof ListServersOutputSchema
>["servers"][number];
export type ManagedServerStatus = z.output<
  typeof GetServerStatusOutputSchema
>["status"];
export type ManagedGraphPoint = z.output<
  typeof GetServerGraphsOutputSchema
>["data"][number];
export type ManagedServerBackup = z.output<
  typeof ListServerBackupsOutputSchema
>["backups"][number];
export type ManagedPointerRecord = z.output<
  typeof ListPointerRecordsOutputSchema
>["records"][number];
export type ManagedFirewallOptions = z.output<
  typeof GetServerFirewallOptionsOutputSchema
>["options"];
export type ManagedFirewallRule = z.output<
  typeof GetServerFirewallRulesOutputSchema
>["rules"][number];
export type ManagedServerPlan = z.output<
  typeof GetServerPlanOutputSchema
>["plans"][number];
export type ManagedAdvancedSettings = z.output<
  typeof GetServerAdvancedOutputSchema
>["settings"];
export type ManagedIsoImage = z.output<
  typeof ListProxmoxIsoDownloadsOutputSchema
>["iso_downloads"][number];
export type ManagedTemplateGroup = z.output<
  typeof GetServerTemplateGroupsOutputSchema
>["template_groups"][number];
