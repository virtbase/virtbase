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

import { captureException } from "@sentry/nextjs";
import {
  integrationConfigStore,
  integrations,
} from "@virtbase/api/integrations";
import { db } from "@virtbase/db/client";
import { integrationInstallations } from "@virtbase/db/schema";
import type { IntegrationDescription } from "@virtbase/integration-sdk";
import { verifySession } from "../verify-session";

export interface IntegrationListItem {
  descriptor: IntegrationDescription;
  installed: boolean;
  enabled: boolean;
  settings: Record<string, unknown>;
  /**
   * Which secret fields have a stored value — never the values themselves. A
   * secret that has been written is not readable through this API again.
   */
  configuredSecretKeys: string[];
  health: {
    status: "unknown" | "ok" | "degraded" | "error";
    message: string | null;
    checkedAt: Date | null;
  };
  /** Set when stored configuration does not satisfy the integration's schema. */
  configError: string | null;
}

/**
 * Everything the integrations page renders.
 *
 * Health is read from the last stored probe rather than measured here: probing
 * means outbound HTTP to every configured provider, and a page load is the
 * wrong moment to discover that a third party is slow. The page offers an
 * explicit re-check instead.
 */
export async function getIntegrationsList(): Promise<IntegrationListItem[]> {
  await verifySession();

  const descriptors = await integrations.describeAll();
  const store = integrationConfigStore;

  if (!store) {
    // No bootstrap key: configuration is environment-only and cannot be edited.
    return descriptors.map((descriptor) => ({
      descriptor,
      installed: false,
      enabled: false,
      settings: {},
      configuredSecretKeys: [],
      health: { status: "unknown" as const, message: null, checkedAt: null },
      configError:
        "CONFIG_ENCRYPTION_KEY is not set, so configuration cannot be stored.",
    }));
  }

  try {
    const rows = await db
      .select({
        integrationId: integrationInstallations.integrationId,
        healthStatus: integrationInstallations.healthStatus,
        healthMessage: integrationInstallations.healthMessage,
        healthCheckedAt: integrationInstallations.healthCheckedAt,
      })
      .from(integrationInstallations);

    const healthById = new Map(rows.map((row) => [row.integrationId, row]));

    return await Promise.all(
      descriptors.map(async (descriptor) => {
        const installation = await store.find(descriptor.id);
        const health = healthById.get(descriptor.id);
        const validation = installation
          ? integrations.validateSettings(descriptor.id, installation.settings)
          : null;

        return {
          descriptor,
          installed: installation !== null,
          enabled: installation?.enabled ?? false,
          settings: installation?.settings ?? {},
          configuredSecretKeys: installation
            ? await store.secretKeys(descriptor.id)
            : [],
          health: {
            status: health?.healthStatus ?? ("unknown" as const),
            message: health?.healthMessage ?? null,
            checkedAt: health?.healthCheckedAt ?? null,
          },
          configError:
            validation && !validation.success
              ? validation.errors.join("; ")
              : null,
        };
      }),
    );
  } catch (error) {
    captureException(error);
    throw error;
  }
}

/**
 * A single integration, or `null` when the id does not match a registered one.
 *
 * Reuses the list rather than duplicating the assembly: there are a handful of
 * integrations, and the alternative is two code paths that can disagree.
 */
export async function getIntegration(
  integrationId: string,
): Promise<IntegrationListItem | null> {
  const items = await getIntegrationsList();
  return items.find((item) => item.descriptor.id === integrationId) ?? null;
}
