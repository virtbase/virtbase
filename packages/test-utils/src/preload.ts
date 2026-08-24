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

import { afterEach, expect } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

/**
 * Give a bun test process a DOM.
 *
 * Loaded through `preload` in a package-local `bunfig.toml`, never the root one.
 * `GlobalRegistrator` replaces globals - `fetch` among them - so registering it
 * for the whole monorepo would break the suites that install their own `fetch`
 * mock, such as `packages/api/src/lib/__tests__/safe-iso-download-url.test.ts`.
 * Only packages that render components opt in.
 */
GlobalRegistrator.register({
  url: "http://app.virtbase.localhost:3000",
});

/**
 * Everything below is loaded with `require` rather than `import` on purpose.
 *
 * Two constraints meet here. Static imports are hoisted above
 * `GlobalRegistrator.register()`, and `@testing-library/dom` binds `screen` to
 * `document.body` at module evaluation - so a static import leaves every query
 * throwing "a global document has to be available". Top-level `await import()`
 * fixes that but makes the preload async, and bun then registers the hooks
 * below after the first test has already started: "Cannot call beforeAll()
 * inside a test". A synchronous `require` after `register()` satisfies both.
 */
const matchers = require("@testing-library/jest-dom/matchers");

// `toBeVisible`, `toHaveAttribute`, `toHaveTextContent` and friends. Bun's
// `expect` is Jest-compatible enough to take the jest-dom matcher set directly.
expect.extend(matchers);

// Loaded here, not lazily inside the hook: `@testing-library/react` registers a
// `beforeAll` of its own for React's act environment, and requiring it for the
// first time from inside `afterEach` means that registration happens mid-test,
// which bun rejects outright.
const { cleanup } = require("@testing-library/react");

// Testing Library appends each render to `document.body`; without this, one
// test's markup is still mounted while the next one queries.
afterEach(cleanup);
