import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

export function createDatabase(databasePath: string): Database.Database {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true })

  const db = new Database(databasePath)
  db.pragma('foreign_keys = ON')

  const schema = fs.readFileSync(
    new URL('./schema.sql', import.meta.url),
    'utf8'
  )

  db.exec(schema)

  return db
}
