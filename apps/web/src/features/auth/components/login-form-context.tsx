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

"use client";

import type { Dispatch, SetStateAction } from "react";
import { createContext } from "react";

/**
 * The login form's shared state, in its own module.
 *
 * It used to live in `login-form.tsx`, which also renders the buttons that
 * consume it - so every button imported its parent and the parent imported
 * every button back. The cycle was harmless while nothing read across it during
 * module initialisation, but it is the same shape that has produced
 * "cannot access before initialization" elsewhere in this repo, and it is not
 * something the form needs. The context has no dependencies of its own, so
 * moving it here points every import in one direction.
 */
export const authMethods = [
  "google",
  "github",
  "discord",
  "email",
  "passkey",
] as const;

export type AuthMethod = (typeof authMethods)[number];

export const LoginFormContext = createContext<{
  authMethod: AuthMethod | undefined;
  setAuthMethod: Dispatch<SetStateAction<AuthMethod | undefined>>;
  clickedMethod: AuthMethod | undefined;
  showPasswordField: boolean;
  setShowPasswordField: Dispatch<SetStateAction<boolean>>;
  setClickedMethod: Dispatch<SetStateAction<AuthMethod | undefined>>;
}>({
  authMethod: undefined,
  setAuthMethod: () => {},
  clickedMethod: undefined,
  showPasswordField: false,
  setShowPasswordField: () => {},
  setClickedMethod: () => {},
});
