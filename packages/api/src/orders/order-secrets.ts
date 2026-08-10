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

import { decrypt, encrypt, parseMasterKey } from "@virtbase/config";

/**
 * Encryption for the one genuinely secret field an order carries: the initial
 * root password a customer chose.
 *
 * Everything else about an order is stored as readable JSON, because an order
 * nobody can inspect is the problem the order table exists to solve. This uses
 * the same bootstrap key as the configuration platform rather than a key
 * derived from the Stripe secret — rotating a payment credential must not make
 * in-flight orders unreadable (finding F9).
 */
const masterKey = () => {
  const configured = process.env.CONFIG_ENCRYPTION_KEY;
  return configured ? parseMasterKey(configured) : null;
};

/**
 * Returns `null` when there is nothing to protect, or when no bootstrap key is
 * configured — during the migration the legacy metadata path still carries the
 * password, so a missing key degrades rather than failing the checkout.
 */
export const encryptOrderSecret = async (
  value: string | null | undefined,
): Promise<string | null> => {
  if (!value) return null;

  const key = masterKey();
  if (!key) {
    console.warn(
      "[orders] CONFIG_ENCRYPTION_KEY is not set; the root password will not be stored on the order.",
    );
    return null;
  }

  return encrypt(value, key);
};

export const decryptOrderSecret = async (
  ciphertext: string | null,
): Promise<string | null> => {
  if (!ciphertext) return null;

  const key = masterKey();
  if (!key) {
    throw new Error(
      "CONFIG_ENCRYPTION_KEY is not set, so the order's root password cannot be read.",
    );
  }

  return decrypt(ciphertext, key);
};
