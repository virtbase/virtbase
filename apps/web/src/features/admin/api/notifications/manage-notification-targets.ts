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
  dispatchNotification,
  listNotificationChannels,
  notificationTargetStore,
} from "@virtbase/api/notifications";
import {
  CreateNotificationTargetInputSchema,
  UpdateNotificationTargetInputSchema,
} from "@virtbase/validators";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { actionClient } from "../../lib/action-client";

const requireStore = () => {
  if (!notificationTargetStore) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "CONFIG_ENCRYPTION_KEY is not set, so notification targets cannot be stored.",
    });
  }
  return notificationTargetStore;
};

const requireChannel = async (channelId: string) => {
  const channels = await listNotificationChannels();
  const channel = channels.find((candidate) => candidate.id === channelId);

  if (!channel) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `The "${channelId}" channel is not available. Enable the integration that provides it first.`,
    });
  }

  return channel;
};

/**
 * Splits form values by whether the channel calls them secret.
 *
 * A blank secret means "leave the stored value alone", which is what lets the
 * form show that a credential exists without ever sending it to the browser.
 */
const partition = (
  channelSecretKeys: string[],
  config: Record<string, string>,
  secrets: Record<string, string>,
) => {
  const secretSet = new Set(channelSecretKeys);

  const plainConfig = Object.fromEntries(
    Object.entries(config).filter(([key]) => !secretSet.has(key)),
  );

  const toWrite = Object.fromEntries(
    Object.entries(secrets).filter(
      ([key, value]) => secretSet.has(key) && value.length > 0,
    ),
  );

  return { plainConfig, toWrite };
};

const revalidate = () => revalidatePath("/admin.virtbase.com");

export const createNotificationTargetAction = actionClient
  .inputSchema(CreateNotificationTargetInputSchema)
  .action(async ({ parsedInput }) => {
    const store = requireStore();
    const channel = await requireChannel(parsedInput.channel);

    const { plainConfig, toWrite } = partition(
      channel.secretKeys,
      parsedInput.config,
      parsedInput.secrets,
    );

    const id = await store.create({
      name: parsedInput.name,
      channel: parsedInput.channel,
      audience: "operator",
      enabled: parsedInput.enabled,
      config: plainConfig,
      matchKeys: parsedInput.matchKeys,
      minSeverity: parsedInput.minSeverity,
      locale: parsedInput.locale,
    });

    if (Object.keys(toWrite).length > 0) {
      await store.setSecrets(id, toWrite);
    }

    revalidate();
    return { id };
  });

export const updateNotificationTargetAction = actionClient
  .inputSchema(UpdateNotificationTargetInputSchema)
  .action(async ({ parsedInput }) => {
    const store = requireStore();
    const channel = await requireChannel(parsedInput.channel);

    const { plainConfig, toWrite } = partition(
      channel.secretKeys,
      parsedInput.config,
      parsedInput.secrets,
    );

    await store.update(parsedInput.id, {
      name: parsedInput.name,
      channel: parsedInput.channel,
      enabled: parsedInput.enabled,
      config: plainConfig,
      matchKeys: parsedInput.matchKeys,
      minSeverity: parsedInput.minSeverity,
      locale: parsedInput.locale,
    });

    if (Object.keys(toWrite).length > 0) {
      await store.setSecrets(parsedInput.id, toWrite);
    }

    revalidate();
    return { id: parsedInput.id };
  });

export const deleteNotificationTargetAction = actionClient
  .inputSchema(z.object({ id: z.string().min(1) }))
  .action(async ({ parsedInput: { id } }) => {
    await requireStore().remove(id);
    revalidate();
  });

/**
 * Sends a real notification to one target.
 *
 * Deliberately not a dry run: the point is to prove the credential, the
 * network path and the rendering all work, and a simulated send proves none of
 * them. It writes a delivery row like any other, so a failure is visible in the
 * same place every other failure is.
 */
export const testNotificationTargetAction = actionClient
  .inputSchema(z.object({ id: z.string().min(1), name: z.string() }))
  .action(async ({ parsedInput: { id, name } }) => {
    requireStore();

    const result = await dispatchNotification({
      key: "notifications.test",
      audience: { kind: "operator", targetId: id },
      severity: "info",
      params: { target: name },
    });

    if (result.delivered > 0) return { delivered: true as const };

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        result.skipped > 0
          ? "The channel for this target is not available. Enable the integration that provides it."
          : "The test notification could not be delivered. Check the target's configuration.",
    });
  });
