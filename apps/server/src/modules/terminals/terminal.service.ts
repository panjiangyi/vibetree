import fs from 'node:fs'
import { nanoid } from 'nanoid'
import type { TerminalSession, CreateTerminalInput, UpdateTerminalInput, Project, Worktree } from '@vibetree/shared'
import {
  AppError,
  WORKTREE_NOT_FOUND,
  PROJECT_NOT_FOUND,
  WORKTREE_PATH_NOT_FOUND,
  TERMINAL_NOT_FOUND,
  PTY_NOT_FOUND,
  INVALID_TERMINAL_STATUS,
} from '../../utils/app-error.js'
import type { createProjectRepository } from '../../db/repositories/project.repository.js'
import type { createWorktreeRepository } from '../../db/repositories/worktree.repository.js'
import type { createTerminalRepository } from '../../db/repositories/terminal.repository.js'
import type { AppConfig } from '../../config.js'
import type { PtyManager } from '../pty/pty.manager.js'

type ProjectRepo = ReturnType<typeof createProjectRepository>
type WorktreeRepo = ReturnType<typeof createWorktreeRepository>
type TerminalRepo = ReturnType<typeof createTerminalRepository>

function defaultTerminalTitle(
  project: Project,
  worktree: Worktree,
  count: number
): string {
  if (count === 0) {
    return `${project.name}/${worktree.name}`
  }
  return `${project.name}/${worktree.name} #${count + 1}`
}

function buildTerminalEnv(project: Project, worktree: Worktree): Record<string, string> {
  return {
    VIBETREE_PROJECT_ID: project.id,
    VIBETREE_PROJECT_NAME: project.name,
    VIBETREE_PROJECT_PATH: project.repoPath,
    VIBETREE_WORKTREE_ID: worktree.id,
    VIBETREE_WORKTREE_NAME: worktree.name,
    VIBETREE_WORKTREE_PATH: worktree.path,
    VIBETREE_WORKTREE_BRANCH: worktree.branch ?? '',
  }
}

export type TerminalService = ReturnType<typeof createTerminalService>

export function createTerminalService(
  projectRepo: ProjectRepo,
  worktreeRepo: WorktreeRepo,
  terminalRepo: TerminalRepo,
  ptyManager: PtyManager,
  config: AppConfig
) {
  return {
    reconcileTerminalStatuses(): void {
      const terminals = terminalRepo.findAll()
      for (const terminal of terminals) {
        if (terminal.status === 'running' && !ptyManager.has(terminal.id)) {
          terminalRepo.updateStatus(terminal.id, 'disconnected')
        }
      }
    },

    listTerminals(): TerminalSession[] {
      this.reconcileTerminalStatuses()
      return terminalRepo.findAll()
    },

    getTerminal(id: string): TerminalSession {
      const terminal = terminalRepo.findById(id)
      if (!terminal) {
        throw new AppError(TERMINAL_NOT_FOUND, 'Terminal not found')
      }
      return terminal
    },

    createTerminal(worktreeId: string, input: CreateTerminalInput = {}): TerminalSession {
      const worktree = worktreeRepo.findById(worktreeId)
      if (!worktree) {
        throw new AppError(WORKTREE_NOT_FOUND, 'Worktree not found')
      }

      const project = projectRepo.findById(worktree.projectId)
      if (!project) {
        throw new AppError(PROJECT_NOT_FOUND, 'Project not found')
      }

      if (!fs.existsSync(worktree.path)) {
        throw new AppError(WORKTREE_PATH_NOT_FOUND, 'Worktree path not found')
      }

      const now = new Date().toISOString()
      const terminalId = `term_${nanoid()}`
      const count = terminalRepo.countByWorktreeId(worktreeId)

      const session: TerminalSession = {
        id: terminalId,
        projectId: project.id,
        worktreeId: worktree.id,
        title: input.title ?? defaultTerminalTitle(project, worktree, count),
        shell: input.shell ?? config.defaultShell,
        cwd: worktree.path,
        status: 'running',
        pid: null,
        cols: input.cols ?? config.terminal.cols,
        rows: input.rows ?? config.terminal.rows,
        exitCode: null,
        lastActiveAt: now,
        createdAt: now,
        updatedAt: now,
      }

      terminalRepo.insert(session)

      const runtime = ptyManager.create({
        terminalId,
        shell: session.shell,
        cwd: worktree.path,
        cols: session.cols,
        rows: session.rows,
        env: buildTerminalEnv(project, worktree),
      })

      terminalRepo.updatePidAndStatus(terminalId, runtime.pty.pid, 'running')

      ptyManager.onExit(terminalId, (exitCode) => {
        terminalRepo.markExited(terminalId, exitCode)
      })

      return terminalRepo.findById(terminalId)!
    },

    renameTerminal(id: string, input: UpdateTerminalInput): TerminalSession {
      const terminal = terminalRepo.findById(id)
      if (!terminal) {
        throw new AppError(TERMINAL_NOT_FOUND, 'Terminal not found')
      }

      if (input.title) {
        const now = new Date().toISOString()
        terminalRepo.insert({ ...terminal, title: input.title, updatedAt: now })
      }

      return terminalRepo.findById(id)!
    },

    deleteTerminal(id: string): void {
      const terminal = terminalRepo.findById(id)
      if (!terminal) {
        throw new AppError(TERMINAL_NOT_FOUND, 'Terminal not found')
      }

      if (terminal.status === 'running') {
        ptyManager.kill(id)
      }

      terminalRepo.delete(id)
    },

    restartTerminal(id: string): TerminalSession {
      const terminal = terminalRepo.findById(id)
      if (!terminal) {
        throw new AppError(TERMINAL_NOT_FOUND, 'Terminal not found')
      }

      if (!['exited', 'killed', 'disconnected'].includes(terminal.status)) {
        throw new AppError(
          INVALID_TERMINAL_STATUS,
          `Cannot restart terminal with status: ${terminal.status}`
        )
      }

      const worktree = worktreeRepo.findById(terminal.worktreeId)
      if (!worktree) {
        throw new AppError(WORKTREE_NOT_FOUND, 'Worktree not found')
      }

      const project = projectRepo.findById(terminal.projectId)
      if (!project) {
        throw new AppError(PROJECT_NOT_FOUND, 'Project not found')
      }

      if (!fs.existsSync(worktree.path)) {
        throw new AppError(WORKTREE_PATH_NOT_FOUND, 'Worktree path not found')
      }

      // Create new PTY
      const runtime = ptyManager.create({
        terminalId: id,
        shell: terminal.shell,
        cwd: worktree.path,
        cols: terminal.cols,
        rows: terminal.rows,
        env: buildTerminalEnv(project, worktree),
      })

      terminalRepo.updatePidAndStatus(id, runtime.pty.pid, 'running')

      ptyManager.onExit(id, (exitCode) => {
        terminalRepo.markExited(id, exitCode)
      })

      return terminalRepo.findById(id)!
    },

    writeToTerminal(id: string, data: string): void {
      ptyManager.write(id, data)
    },
  }
}
