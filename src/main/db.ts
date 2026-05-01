import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import { app } from 'electron';

let db: Database | null = null;

export async function initDB(): Promise<Database> {
  const dbPath = path.join(app.getPath('userData'), 'mod_manager.db');

  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      game_version TEXT NOT NULL,
      loader TEXT NOT NULL,
      install_path TEXT
    );

    CREATE TABLE IF NOT EXISTS profile_mods (
      profile_id INTEGER,
      mod_id TEXT,
      mod_version_id TEXT,
      status TEXT,
      PRIMARY KEY (profile_id, mod_id)
    );
  `);
  
  console.log("DB Init Complete! Path:", dbPath);
  return db;
}