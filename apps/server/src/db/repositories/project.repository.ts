import type Database from 'better-sqlite3'
import type { Project, UpdateProjectInput } from '@vibetree/shared'

type ProjectRow = {
  id: string
  name: string
  repo_path: string
  worktree_base_path: string
  main_branch: string
  setup_script: string | null
  created_at: string
  updated_at: string
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    repoPath: row.repo_path,
    worktreeBasePath: row.worktree_base_path,
    mainBranch: row.main_branch,
    setupScript: row.setup_script,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createProjectRepository(db: Database.Database) {
  const findAllStmt = db.prepare('SELECT * FROM projects ORDER BY created_at DESC')
  const findByIdStmt = db.prepare('SELECT * FROM projects WHERE id = ?')
  const findByRepoPathStmt = db.prepare('SELECT * FROM projects WHERE repo_path = ?')
  const insertStmt = db.prepare(`
    INSERT INTO projects (id, name, repo_path, worktree_base_path, main_branch, setup_script, created_at, updated_at)
    VALUES (@id, @name, @repoPath, @worktreeBasePath, @mainBranch, @setupScript, @createdAt, @updatedAt)
  `)
  const updateStmt = db.prepare(`
    UPDATE projects SET name = @name, main_branch = @mainBranch, setup_script = @setupScript, worktree_base_path = @worktreeBasePath, updated_at = @updatedAt WHERE id = @id
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
        mainBranch: project.mainBranch,
        setupScript: project.setupScript,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      })
    },

    update(id: string, input: UpdateProjectInput): void {
      const project = this.findById(id)
      if (!project) return

      updateStmt.run({
        id,
        name: input.name ?? project.name,
        mainBranch: input.mainBranch ?? project.mainBranch,
        setupScript: input.setupScript === undefined ? project.setupScript : input.setupScript,
        worktreeBasePath: input.worktreeBasePath ?? project.worktreeBasePath,
        updatedAt: new Date().toISOString(),
      })
    },

    delete(id: string): boolean {
      const result = deleteStmt.run(id)
      return result.changes > 0
    },
  }
}
