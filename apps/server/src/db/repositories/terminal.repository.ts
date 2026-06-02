import type Database from 'better-sqlite3'
import type { TerminalSession, TerminalStatus } from '@vibetree/shared'

type TerminalRow = {
  id: string
  project_id: string
  worktree_id: string
  title: string
  shell: string
  cwd: string
  status: string
  pid: number | null
  cols: number
  rows: number
  exit_code: number | null
  last_active_at: string | null
  created_at: string
  updated_at: string
}

function rowToTerminal(row: TerminalRow): TerminalSession {
  return {
    id: row.id,
    projectId: row.project_id,
    worktreeId: row.worktree_id,
    title: row.title,
    shell: row.shell,
    cwd: row.cwd,
    status: row.status as TerminalStatus,
    pid: row.pid,
    cols: row.cols,
    rows: row.rows,
    exitCode: row.exit_code,
    lastActiveAt: row.last_active_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createTerminalRepository(db: Database.Database) {
  const findAllStmt = db.prepare('SELECT * FROM terminal_sessions ORDER BY created_at DESC')
  const findByIdStmt = db.prepare('SELECT * FROM terminal_sessions WHERE id = ?')
  const findByWorktreeIdStmt = db.prepare('SELECT * FROM terminal_sessions WHERE worktree_id = ? ORDER BY created_at DESC')
  const insertStmt = db.prepare(`
    INSERT INTO terminal_sessions (id, project_id, worktree_id, title, shell, cwd, status, pid, cols, rows, exit_code, last_active_at, created_at, updated_at)
    VALUES (@id, @projectId, @worktreeId, @title, @shell, @cwd, @status, @pid, @cols, @rows, @exitCode, @lastActiveAt, @createdAt, @updatedAt)
  `)
  const updateStatusStmt = db.prepare('UPDATE terminal_sessions SET status = ?, updated_at = ? WHERE id = ?')
  const updatePidAndStatusStmt = db.prepare('UPDATE terminal_sessions SET pid = ?, status = ?, updated_at = ? WHERE id = ?')
  const markExitedStmt = db.prepare('UPDATE terminal_sessions SET status = ?, exit_code = ?, updated_at = ? WHERE id = ?')
  const markRunningAsDisconnectedStmt = db.prepare("UPDATE terminal_sessions SET status = 'disconnected', updated_at = ? WHERE status = 'running'")
  const countByWorktreeIdStmt = db.prepare('SELECT COUNT(*) as count FROM terminal_sessions WHERE worktree_id = ?')
  const countRunningByWorktreeIdStmt = db.prepare("SELECT COUNT(*) as count FROM terminal_sessions WHERE worktree_id = ? AND status = 'running'")
  const deleteStmt = db.prepare('DELETE FROM terminal_sessions WHERE id = ?')

  return {
    findAll(): TerminalSession[] {
      const rows = findAllStmt.all() as TerminalRow[]
      return rows.map(rowToTerminal)
    },

    findById(id: string): TerminalSession | undefined {
      const row = findByIdStmt.get(id) as TerminalRow | undefined
      return row ? rowToTerminal(row) : undefined
    },

    findByWorktreeId(worktreeId: string): TerminalSession[] {
      const rows = findByWorktreeIdStmt.all(worktreeId) as TerminalRow[]
      return rows.map(rowToTerminal)
    },

    insert(session: TerminalSession): void {
      insertStmt.run({
        id: session.id,
        projectId: session.projectId,
        worktreeId: session.worktreeId,
        title: session.title,
        shell: session.shell,
        cwd: session.cwd,
        status: session.status,
        pid: session.pid,
        cols: session.cols,
        rows: session.rows,
        exitCode: session.exitCode,
        lastActiveAt: session.lastActiveAt,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      })
    },

    updateStatus(id: string, status: TerminalStatus): void {
      updateStatusStmt.run(status, new Date().toISOString(), id)
    },

    updatePidAndStatus(id: string, pid: number, status: TerminalStatus): void {
      updatePidAndStatusStmt.run(pid, status, new Date().toISOString(), id)
    },

    markExited(id: string, exitCode: number): void {
      markExitedStmt.run('exited', exitCode, new Date().toISOString(), id)
    },

    markRunningAsDisconnected(): void {
      markRunningAsDisconnectedStmt.run(new Date().toISOString())
    },

    countByWorktreeId(worktreeId: string): number {
      const row = countByWorktreeIdStmt.get(worktreeId) as { count: number }
      return row.count
    },

    countRunningByWorktreeId(worktreeId: string): number {
      const row = countRunningByWorktreeIdStmt.get(worktreeId) as { count: number }
      return row.count
    },

    delete(id: string): boolean {
      const result = deleteStmt.run(id)
      return result.changes > 0
    },
  }
}
