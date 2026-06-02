import type Database from 'better-sqlite3'
import type { Project } from '@vibetree/shared'

type ProjectRow = {
  id: string
  name: string
  repo_path: string
  worktree_base_path: string
  created_at: string
  updated_at: string
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    repoPath: row.repo_path,
    worktreeBasePath: row.worktree_base_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createProjectRepository(db: Database.Database) {
  const findAllStmt = db.prepare('SELECT * FROM projects ORDER BY created_at DESC')
  const findByIdStmt = db.prepare('SELECT * FROM projects WHERE id = ?')
  const findByRepoPathStmt = db.prepare('SELECT * FROM projects WHERE repo_path = ?')
  const insertStmt = db.prepare(`
    INSERT INTO projects (id, name, repo_path, worktree_base_path, created_at, updated_at)
    VALUES (@id, @name, @repoPath, @worktreeBasePath, @createdAt, @updatedAt)
  `)
  const deleteStmt = db.prepare('DELETE FROM projects WHERE id = ?')

  return {
    findAll(): Project[] {
      const rows = findAllStmt.all() as ProjectRow[]
      return rows.map(rowToProject)
    },

    findById(id: string): Project | undefined {
      const row = findByIdStmt.get(id) as ProjectRow | undefined
      return row ? rowToProject(row) : undefined
    },

    findByRepoPath(repoPath: string): Project | undefined {
      const row = findByRepoPathStmt.get(repoPath) as ProjectRow | undefined
      return row ? rowToProject(row) : undefined
    },

    insert(project: Project): void {
      insertStmt.run({
        id: project.id,
        name: project.name,
        repoPath: project.repoPath,
        worktreeBasePath: project.worktreeBasePath,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      })
    },

    delete(id: string): boolean {
      const result = deleteStmt.run(id)
      return result.changes > 0
    },
  }
}
