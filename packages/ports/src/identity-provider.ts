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

/**
 * An OAuth account that was just linked, or whose token was just refreshed.
 *
 * `accessToken` arrives decrypted: unwrapping it needs better-auth internals,
 * which belong to the auth layer, not to a plug-in.
 */
export interface LinkedAccount {
  userId: string;
  /** better-auth provider id, e.g. `discord`. */
  providerId: string;
  /** The provider's own id for the account. */
  accountId: string;
  scopes: string[];
  accessToken: string | null;
}

/**
 * An integration that reacts to social login.
 *
 * The auth layer owns the OAuth dance; this port is only about what happens
 * afterwards — pushing role-connection metadata to Discord, syncing a directory
 * group, and so on. Implementations must be safe to call repeatedly: the hook
 * fires on token refresh as well as first link.
 */
export interface IdentityProvider {
  /** Which provider this reacts to. Events for others are not delivered. */
  readonly providerId: string;
  /**
   * Scopes the integration needs on top of the application's own. Declared for
   * documentation and admin display; the auth layer still decides what to ask
   * for, because an unrequestable scope breaks login for everyone.
   */
  readonly requiredScopes?: readonly string[];

  onAccountLinked(account: LinkedAccount): Promise<void>;
}
