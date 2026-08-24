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
 * Unwraps the reply of a guest agent passthrough endpoint.
 *
 * Proxmox nests most QEMU guest agent replies under `result` - which is why
 * `getDiskInfo` reads `response.result` - but not all of them, and the typings
 * describe every one of these endpoints as `any`. Accepting both shapes costs
 * one property check and removes a whole class of version-dependent breakage.
 */
export const unwrapAgentResult = (response: unknown): unknown => {
  if (
    typeof response === "object" &&
    response !== null &&
    "result" in response
  ) {
    return (response as { result: unknown }).result;
  }

  return response;
};
