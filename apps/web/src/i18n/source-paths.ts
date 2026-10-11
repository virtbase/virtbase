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
 * The directories next-intl scans for translated strings, relative to
 * `apps/web`; `next.config.ts` passes them as `experimental.srcPath`.
 *
 * The extractor only sees a `useExtracted` or `getExtracted` call in a file
 * under one of these directories. A package missing here loses its whole
 * namespace from `src/i18n/messages/en.po` without an error, which is why
 * `__tests__/source-paths.test.ts` fails for a call outside them.
 */
export const MESSAGE_SOURCE_PATHS = [
  "./src/app",
  "./src/features",
  "./src/ui",
  "../../packages/ui/src",
  "../../packages/integration-abuseipdb/src",
  "../../packages/integration-alertmanager/src",
  "../../packages/integration-discord/src",
  "../../packages/integration-lexware/src",
  "../../packages/integration-powerdns/src",
  "../../packages/integration-prometheus/src",
  "../../packages/integration-webhook/src",
];
