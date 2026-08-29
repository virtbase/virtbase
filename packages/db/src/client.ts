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

import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { relations } from "./relations";

// Bun's native WebSocket handles the neon proxy handshake correctly on Linux,
// whereas the `ws` npm package fails with "Unexpected server response: 101".
// Fall back to `ws` for Node.js environments that lack a global WebSocket.
const WebSocketConstructor = globalThis.WebSocket ?? ws;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Configuring Neon for local development
// See https://neon.com/guides/local-development-with-neon#local-postgresql
if (process.env.NODE_ENV === "development") {
  neonConfig.fetchEndpoint = (host) => {
    const [protocol, port] =
      host === "db.localtest.me" ? ["http", 4444] : ["https", 443];
    return `${protocol}://${host}:${port}/sql`;
  };

  const connectionStringUrl = new URL(connectionString);
  neonConfig.useSecureWebSocket =
    connectionStringUrl.hostname !== "db.localtest.me";
  neonConfig.wsProxy = (host) =>
    host === "db.localtest.me" ? `${host}:4444/v2` : `${host}/v2`;
}
neonConfig.webSocketConstructor = WebSocketConstructor;

const pool = new Pool({ connectionString });

export const db = drizzle({
  client: pool,
  relations,
});

/** A transaction on {@link db}, as its callback receives it. */
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The database, or a transaction on it.
 *
 * A helper that only reads and writes rows should take this rather than the
 * client, so it can be called from inside a `db.transaction()` block. Without
 * it, wrapping a sequence of writes in a transaction is a type error, and the
 * easy way out of a type error is not wrapping them - which is how a failed
 * insert halfway through leaves a half-built record behind.
 */
export type Executor = typeof db | Transaction;
