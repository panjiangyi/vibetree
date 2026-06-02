import type Database from 'better-sqlite3'
import type { Worktree } from '@vibetree/shared'

type WorktreeRow = {
  id: string
  project_id: string
  name: string
  path: string
  branch: string | null
  head: string | null
  is_main: number
  is_dirty: number
  created_by_app: number
  created_at: string
  updated_at: string
}

function rowToWorktree(row: WorktreeRow): Worktree {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    path: row.path,
    branch: row.branch,
    head: row.head,
    isMain: row.is_main === 1,
    isDirty: row.is_dirty === 1,
    createdByApp: row.created_by_app === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createWorktreeRepository(db: Database.Database) {
  const findByIdStmt = db.prepare('SELECT * FROM worktrees WHERE id = ?')
  const findByProjectIdStmt = db.prepare('SELECT * FROM worktrees WHERE project_id = ? ORDER BY is_main DESC, name ASC')
  const findByPathStmt = db.prepare('SELECT * FROM worktrees WHERE path = ?')
  const upsertStmt = db.prepare(`
    INSERT INTO worktrees (id, project_id, name, path, branch, head, is_main, is_dirty, created_by_app, created_at, updated_at)
    VALUES (@id, @projectId, @name, @path, @branch, @head, @isMain, @isDirty, @createdByApp, @createdAt, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      name = @name,
      path = @path,
      branch = @branch,
      head = @head,
      is_main = @isMain,
      is_dirty = @isDirty,
      updated_at = @updatedAt
  `)
  const deleteStmt = db.prepare('DELETE FROM worktrees WHERE id = ?')
  const deleteMissingStmt = db.prepare(`
    DELETE FROM worktrees 
    WHERE project_id = ? 
    AND id NOT IN (SELECT value FROM json_each(?))
  `)

  return {
    findById(id: string): Worktree | undefined {
      const row = findByIdStmt.get(id) as WorktreeRow | undefined
      return row ? rowToWorktree(row) : undefined
    },

    findByProjectId(projectId: string): Worktree[] {
      const rows = findByProjectIdStmt.all(projectId) as WorktreeRow[]
      return rows.map(rowToWorktree)
    },

    findByPath(path: string): Worktree | undefined {
      const row = findByPathStmt.get(path) as WorktreeRow | undefined
      return row ? rowToWorktree(row) : undefined
    },

    upsert(worktree: Worktree): void {
      upsertStmt.run({
        id: worktree.id,
        projectId: worktree.projectId,
        name: worktree.name,
        path: worktree.path,
        branch: worktree.branch,
        head: worktree.head,
        isMain: worktree.isMain ? 1 : 0,
        isDirty: worktree.isDirty ? 1 : 0,
        createdByApp: worktree.createdByApp ? 1 : 0,
        createdAt: worktree.createdAt,
        updatedAt: worktree.updatedAt,
      })
    },

    delete(id: string): boolean {
      const result = deleteStmt.run(id)
      return result.changes > 0
    },

    deleteMissingForProject(projectId: string, keepIds: string[]): void {
      deleteMissingStmt.run(projectId, JSON.stringify(keepIds))
    },
  }
}
