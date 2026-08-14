import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { runMigrations } from "./migrate.js";

export type DatabaseConnection = BetterSqlite3.Database;

export function openDatabase(databasePath: string): DatabaseConnection {
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
  }

  const database = new BetterSqlite3(databasePath);
  try {
    database.pragma("journal_mode = WAL");
    database.pragma("foreign_keys = ON");
    database.pragma("busy_timeout = 5000");
    runMigrations(database);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
