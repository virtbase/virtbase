import type { Config } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

export default {
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
  casing: "snake_case",
} satisfies Config;
