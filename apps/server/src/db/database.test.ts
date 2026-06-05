import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase } from './database.js'

const tempDirs: string[] = []

afterEach(async () => {
  const dirs = tempDirs.splice(0)
  await Promise.all(dirs.map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('createDatabase', () => {
  it('migrates legacy terminal_sessions before creating scoped indexes', async () => {
    const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'vibetree-db-test-'))
    tempDirs.push(rootPath)
    const databasePath = path.join(rootPath, 'app.db')
    const legacyDb = new Database(databasePath)

    legacyDb.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        repo_path TEXT NOT NULL UNIQUE,
        worktree_base_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE worktrees (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        branch TEXT,
        head TEXT,
        is_main INTEGER NOT NULL DEFAULT 0,
        is_dirty INTEGER NOT NULL DEFAULT 0,
        created_by_app INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE terminal_sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        worktree_id TEXT NOT NULL,
        title TEXT NOT NULL,
        shell TEXT NOT NULL,
        cwd TEXT NOT NULL,
        status TEXT NOT NULL,
        pid INTEGER,
        cols INTEGER NOT NULL DEFAULT 120,
        rows INTEGER NOT NULL DEFAULT 30,
        exit_code INTEGER,
        last_active_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (worktree_id) REFERENCES worktrees(id) ON DELETE CASCADE
      );
    `)

    legacyDb.close()

    const db = createDatabase(databasePath)
    const columns = db.prepare('PRAGMA table_info(terminal_sessions)').all() as Array<{ name: string }>
    const columnNames = new Set(columns.map((column) => column.name))
    const indexes = db.prepare('PRAGMA index_list(terminal_sessions)').all() as Array<{ name: string }>
    const indexNames = new Set(indexes.map((index) => index.name))

    expect(columnNames.has('scope_type')).toBe(true)
    expect(columnNames.has('scope_id')).toBe(true)
    expect(columnNames.has('scope_label')).toBe(true)
    expect(indexNames.has('idx_terminal_sessions_scope_id')).toBe(true)

    db.close()
  })
})
