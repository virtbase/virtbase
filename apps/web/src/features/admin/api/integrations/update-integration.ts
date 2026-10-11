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

"use server";

import { TRPCError } from "@trpc/server";
import {
  integrationConfigStore,
  integrations,
} from "@virtbase/api/integrations";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { actionClient } from "../../lib/action-client";

const requireStore = () => {
  if (!integrationConfigStore) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "CONFIG_ENCRYPTION_KEY is not set, so integration configuration cannot be changed.",
    });
  }
  return integrationConfigStore;
};

const requireIntegration = (integrationId: string) => {
  const integration = integrations.find(integrationId);
  if (!integration) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Unknown integration "${integrationId}".`,
    });
  }
  return integration;
};

/**
 * Drops this process's cached configuration so the change is visible
 * immediately rather than at the end of the registry's TTL. Other instances
 * still wait out their own TTL — see `IntegrationRegistryOptions.configTtlMs`.
 */
const applyLocally = (integrationId: string) => {
  integrations.invalidate(integrationId);
  revalidatePath("/admin.virtbase.com/[locale]", "layout");
};

export const saveIntegrationSettingsAction = actionClient
  .inputSchema(
    z.object({
      integrationId: z.string().min(1),
      settings: z.record(z.string(), z.unknown()),
    }),
  )
  .action(async ({ parsedInput: { integrationId, settings } }) => {
    const store = requireStore();
    requireIntegration(integrationId);

    // Validated against the integration's own schema, so the admin form cannot
    // store a shape the integration will later choke on.
    const validation = integrations.validateSettings(integrationId, settings);
    if (!validation.success) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: validation.errors.join("; "),
      });
    }

    await store.upsert({
      integrationId,
      settings: validation.data as Record<string, unknown>,
    });

    applyLocally(integrationId);
  });

export const saveIntegrationSecretsAction = actionClient
  .inputSchema(
    z.object({
      integrationId: z.string().min(1),
      secrets: z.record(z.string(), z.string()),
    }),
  )
  .action(async ({ parsedInput: { integrationId, secrets } }) => {
    const store = requireStore();
    const integration = requireIntegration(integrationId);

    const known = new Set(
      (integration.secrets?.fields ?? []).map((field) => field.key),
    );
    const unknownKeys = Object.keys(secrets).filter((key) => !known.has(key));
    if (unknownKeys.length > 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Unknown secret field(s): ${unknownKeys.join(", ")}`,
      });
    }

    // Blank fields mean "leave unchanged": the form never receives the current
    // value, so submitting it must not be able to erase one.
    const provided = Object.fromEntries(
      Object.entries(secrets).filter(([, value]) => value.trim().length > 0),
    );
    if (0 === Object.keys(provided).length) return;

    // A row must exist before secrets can be attached to it.
    if (!(await store.find(integrationId))) {
      await store.upsert({ integrationId });
    }

    await store.setSecrets(integrationId, provided);

    applyLocally(integrationId);
  });

export const setIntegrationEnabledAction = actionClient
  .inputSchema(
    z.object({
      integrationId: z.string().min(1),
      enabled: z.boolean(),
    }),
  )
  .action(async ({ parsedInput: { integrationId, enabled } }) => {
    const store = requireStore();
    requireIntegration(integrationId);

    // onEnable runs after the flag is stored and onDisable before it is
    // cleared, so each hook sees the integration enabled (ADR 0003). A failing
    // hook never blocks the switch: a broken integration must always be
    // switchable off.
    type HookOutcome = { failed: false } | { failed: true; error: unknown };
    const runHook = async (): Promise<HookOutcome> => {
      try {
        await (enabled
          ? integrations.runEnableHook(integrationId)
          : integrations.runDisableHook(integrationId));
        return { failed: false };
      } catch (error) {
        return { failed: true, error };
      }
    };

    let outcome: HookOutcome = { failed: false };
    if (!enabled) outcome = await runHook();
    await store.upsert({ integrationId, enabled });
    integrations.invalidate(integrationId);
    if (enabled) outcome = await runHook();

    applyLocally(integrationId);

    if (outcome.failed) {
      const { error } = outcome;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Saved, but the ${enabled ? "enable" : "disable"} hook failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  });

export const checkIntegrationHealthAction = actionClient
  .inputSchema(z.object({ integrationId: z.string().min(1) }))
  .action(async ({ parsedInput: { integrationId } }) => {
    const store = requireStore();
    requireIntegration(integrationId);

    integrations.invalidate(integrationId);

    const health = await integrations.healthOf(integrationId);

    await store.recordHealth(integrationId, {
      status: health.status,
      message: "message" in health ? health.message : null,
      checkedAt: health.checkedAt,
    });

    revalidatePath("/admin.virtbase.com/[locale]", "layout");

    return {
      status: health.status,
      message: "message" in health ? health.message : null,
    };
  });
