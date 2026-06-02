import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

function getColumnNames(db: Database.Database, table: string): Set<string> {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return new Set(columns.map((c) => c.name))
}

function runMigrations(db: Database.Database): void {
  const projectCols = getColumnNames(db, 'projects')
  if (!projectCols.has('main_branch')) {
    db.exec("ALTER TABLE projects ADD COLUMN main_branch TEXT NOT NULL DEFAULT 'main'")
  }
  if (!projectCols.has('setup_script')) {
    db.exec('ALTER TABLE projects ADD COLUMN setup_script TEXT')
  }

  const worktreeCols = getColumnNames(db, 'worktrees')
  if (!worktreeCols.has('display_name')) {
    db.exec('ALTER TABLE worktrees ADD COLUMN display_name TEXT')
  }
}

export function createDatabase(databasePath: string): Database.Database {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true })

  const db = new Database(databasePath)
  db.pragma('foreign_keys = ON')

  const schema = fs.readFileSync(
    new URL('./schema.sql', import.meta.url),
    'utf8'
  )

  db.exec(schema)
  runMigrations(db)

  return db
}
