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
 * Inspired by trpc-limiter
 *
 * @see https://github.com/OrJDev/trpc-limiter/blob/923ae1e6c6122cc60f2cb7aebcbd99717ade57ad/packages/core/src/index.ts#L96
 */
export const defaultFingerprint = (headers: Headers): string => {
  const forwarded = headers.get("x-forwarded-for");
  const ip = forwarded
    ? (typeof forwarded === "string" ? forwarded : forwarded[0])?.split(/, /)[0]
    : null;

  return ip || "127.0.0.1";
};
