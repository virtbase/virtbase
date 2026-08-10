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
 */

import type { db } from "@virtbase/db/client";

/**
 * The database handle the stores run against.
 *
 * Injected rather than imported so tests can pass the in-memory PGlite client
 * from `@virtbase/db/test-client`, which is structurally compatible.
 */
export type ConfigDatabase = typeof db;
