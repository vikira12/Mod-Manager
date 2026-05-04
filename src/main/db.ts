import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'

// 1. 유저의 AppData 폴더에 modforge.db 파일 생성 (자동 설치)
const dbPath = path.join(app.getPath('userData'), 'modforge.db')
export const db = new Database(dbPath)

// 성능 향상 및 외래키(Foreign Key) 활성화
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// 2. 마이그레이션 (테이블 생성) 함수
export function migrate(): void {
  try {
    const init = db.transaction(() => {
      
      db.prepare(`
        CREATE TABLE IF NOT EXISTS games (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          slug TEXT NOT NULL UNIQUE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run()

      db.prepare(`
        CREATE TABLE IF NOT EXISTS mods (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
          modrinth_id TEXT UNIQUE NOT NULL,
          slug TEXT,
          name TEXT NOT NULL,
          description TEXT,
          icon_url TEXT,
          -- SQLite는 배열(TEXT[])이 없어서 JSON 문자열(TEXT)로 저장해야 해
          categories TEXT, 
          loaders TEXT,
          downloads INTEGER DEFAULT 0,
          follows INTEGER DEFAULT 0,
          license TEXT,
          updated_at DATETIME,
          synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run()

      db.prepare(`
        CREATE TABLE IF NOT EXISTS mod_versions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          mod_id INTEGER REFERENCES mods(id) ON DELETE CASCADE,
          modrinth_ver_id TEXT UNIQUE NOT NULL,
          version_number TEXT NOT NULL,
          version_type TEXT DEFAULT 'release',
          game_versions TEXT,
          loaders TEXT,
          file_url TEXT,
          file_name TEXT,
          file_size INTEGER,
          file_hash_sha1 TEXT,
          is_featured INTEGER DEFAULT 0,
          published_at DATETIME,
          synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run()

      db.prepare(`
        CREATE TABLE IF NOT EXISTS mod_dependencies (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          mod_version_id INTEGER REFERENCES mod_versions(id) ON DELETE CASCADE,
          depends_on_mod_id INTEGER REFERENCES mods(id) ON DELETE SET NULL,
          modrinth_dep_id TEXT,
          dep_type TEXT CHECK (dep_type IN ('required','optional','incompatible','embedded')),
          UNIQUE(mod_version_id, modrinth_dep_id, dep_type)
        )
      `).run()

      db.prepare(`
        CREATE TABLE IF NOT EXISTS profiles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          game_id INTEGER REFERENCES games(id),
          name TEXT NOT NULL,
          game_version TEXT,
          loader TEXT,
          install_path TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run()

      db.prepare(`
        CREATE TABLE IF NOT EXISTS profile_mods (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          profile_id INTEGER REFERENCES profiles(id) ON DELETE CASCADE,
          mod_id INTEGER REFERENCES mods(id) ON DELETE CASCADE,
          mod_version_id INTEGER REFERENCES mod_versions(id),
          installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(profile_id, mod_id)
        )
      `).run()

      db.prepare(`
        CREATE TABLE IF NOT EXISTS sync_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          status TEXT,
          mods_synced INTEGER DEFAULT 0,
          errors TEXT,
          started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          finished_at DATETIME
        )
      `).run()

      db.prepare(`CREATE INDEX IF NOT EXISTS idx_mods_modrinth ON mods(modrinth_id)`).run()
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_mods_name ON mods(name)`).run()
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_versions_mod ON mod_versions(mod_id)`).run()
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_deps_ver ON mod_dependencies(mod_version_id)`).run()

      // 기본 데이터(Minecraft) 넣기 (ON CONFLICT DO NOTHING -> INSERT OR IGNORE)
      db.prepare(`
        INSERT OR IGNORE INTO games (name, slug) VALUES ('Minecraft', 'minecraft')
      `).run()
    })

    init()
    console.log('[DB] 로컬 SQLite 데이터베이스 세팅 및 마이그레이션 완료!')
    console.log(`[DB] 저장 경로: ${dbPath}`)

  } catch (err) {
    console.error('[DB] 마이그레이션 실패:', err)
    throw err
  }
}