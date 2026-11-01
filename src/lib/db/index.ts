import "server-only";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

type Holder = { db?: DB; ready?: Promise<DB> };
const g = globalThis as unknown as { __sellnowDb?: Holder };
const holder: Holder = (g.__sellnowDb ??= {});

const MIGRATIONS = path.join(process.cwd(), "drizzle");

async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url, max: 10 });
    const db = drizzlePg(pool, { schema });
    await migratePg(db, { migrationsFolder: MIGRATIONS });
    return db;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required in production.");
  }
  // Development: embedded Postgres (PGlite) persisted to ./.data/pglite
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  // PGLITE_DIR lets an isolated dev/verification server use its own embedded database.
  const client = new PGlite(process.env.PGLITE_DIR || path.join(process.cwd(), ".data", "pglite"));
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as DB;
}

/** Returns the shared database handle (connecting and migrating on first use). */
export async function getDb(): Promise<DB> {
  if (holder.db) return holder.db;
  holder.ready ??= connect().then((db) => (holder.db = db));
  return holder.ready;
}

/** Test hook: inject an isolated database. */
export function __setDbForTests(db: DB) {
  holder.db = db;
  holder.ready = Promise.resolve(db);
}

export { schema };
