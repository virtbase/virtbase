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
 * Test helpers for the tRPC surface.
 *
 * These live beside the router rather than in `@virtbase/test-utils` because
 * they need `appRouter`, and a shared package that imports `@virtbase/api`
 * cannot also be a dev dependency of it - turbo reads dev dependencies as graph
 * edges and the cycle breaks the build.
 *
 * Nothing here is imported by shipped code; `.dependency-cruiser.jsonc` enforces
 * that.
 */
export * from "./caller";
export * from "./fixtures";

// `./fixtures` is also exported on its own as `@virtbase/api/testing/fixtures`.
// The Playwright suite runs under Node and needs the fixture objects without
// `./caller`, which reaches the tRPC router and through it `next/cache`.
