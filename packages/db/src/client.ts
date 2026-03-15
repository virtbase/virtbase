import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import * as schema from "./schema";

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
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString });

export const db = drizzle({
  client: pool,
  schema,
  casing: "snake_case",
});
