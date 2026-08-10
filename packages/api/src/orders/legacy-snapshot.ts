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

import {
  decryptPayload,
  deriveKeyHex,
  readChunkedStripeMetadata,
} from "@virtbase/utils";
import type { OrderConfigurationSnapshot } from "@virtbase/validators";
import { createOrder } from "./create-order";

/**
 * Reads the pre-order configuration snapshot out of Stripe metadata.
 *
 * TODO(WS5.7): delete this file once no unsettled payment intent predates the
 * order table. It exists so that a payment created before the cutover still
 * fulfils after it — deploying the order path must not strand money that has
 * already been taken.
 *
 * Everything about it is what finding F9 objected to: the payload is chunked
 * across several metadata keys because encryption doubles its size, and the key
 * is derived from `STRIPE_SECRET_KEY`, so rotating that credential makes
 * in-flight orders undecryptable.
 */
export const readLegacySnapshot = async (
  metadata: Record<string, string | undefined> | undefined,
  baseKey = "configurationSnapshot",
): Promise<OrderConfigurationSnapshot | null> => {
  const snapshot = readChunkedStripeMetadata(metadata, baseKey);
  if (!snapshot) return null;

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set, so the legacy configuration snapshot cannot be decrypted.",
    );
  }

  const decrypted = await decryptPayload(
    snapshot,
    await deriveKeyHex(stripeSecretKey),
  );

  try {
    return JSON.parse(decrypted) as OrderConfigurationSnapshot;
  } catch {
    throw new Error(
      "Failed to parse the legacy configuration snapshot. The Stripe secret may have been rotated since the payment was created.",
    );
  }
};

/**
 * Resolves a payment intent to an order id, adopting a pre-cutover payment by
 * creating the order it never had.
 *
 * Doing it this way means the rest of the pipeline only ever deals in orders,
 * and the legacy path is one function that can be deleted in one commit.
 */
export const resolveOrderId = async ({
  metadata,
  userId,
  amount,
  planName,
}: {
  metadata: Record<string, string | undefined> | undefined;
  userId: string;
  amount: number;
  planName: string;
}): Promise<string> => {
  const orderId = metadata?.orderId;
  if (orderId) return orderId;

  const configuration = await readLegacySnapshot(metadata);
  if (!configuration) {
    throw new Error(
      "Payment intent carries neither an orderId nor a configuration snapshot.",
    );
  }

  console.warn(
    "[orders] Adopting a payment intent that predates the order table.",
  );

  return createOrder({
    userId,
    configuration,
    totalAmount: amount,
    planName,
    rootPassword:
      "root_password" in configuration ? configuration.root_password : null,
  });
};
