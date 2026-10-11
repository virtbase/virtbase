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

import { resolve, sep } from "node:path";
import {
  CHECKED_EXTENSIONS,
  PROJECT_ROOT,
  readHookInput,
  runBiome,
} from "./shared";

/**
 * Claude Code `PostToolUse` hook for the Edit and Write tools. Formats the
 * edited file with Biome, and returns what Biome cannot fix to Claude, so it is
 * fixed in the same turn. The edit itself is kept either way.
 */

const { filePath } = await readHookInput();
const file = resolve(filePath);
const isInProject = file.startsWith(`${PROJECT_ROOT}${sep}`);

if (filePath !== "" && isInProject && CHECKED_EXTENSIONS.test(file)) {
  process.exit(runBiome(["--write"], [file]));
}
