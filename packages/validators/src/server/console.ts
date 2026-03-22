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

import * as z from "zod";
import { ServerSchema } from "./shared";

export const GetServerConsoleInputSchema = z.object({
  server_id: ServerSchema.shape.id,
});

export type GetServerConsoleInput = z.infer<typeof GetServerConsoleInputSchema>;

export const GetServerConsoleOutputSchema = z
  .url({
    protocol: /https/,
    hostname: /novnc\.com/,
  })
  .meta({
    description: "The noVNC console URL to access the server's console.",
    examples: [
      "https://novnc.com/noVNC/vnc.html?host=...&port=...&password=...&path=...",
    ],
  });

export type GetServerConsoleOutput = z.infer<
  typeof GetServerConsoleOutputSchema
>;
