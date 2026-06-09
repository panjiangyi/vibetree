import fs from 'node:fs'
import path from 'node:path'
import { nanoid } from 'nanoid'
import type {
  TerminalSession,
  CreateTerminalInput,
  UpdateTerminalInput,
  Project,
  Worktree,
  OpenDirectoryTerminalInput,
  CreateDirectoryTerminalInput,
  OpenDirectoryTerminalResult,
} from '@vibetree/shared'
import {
  AppError,
  WORKTREE_NOT_FOUND,
  PROJECT_NOT_FOUND,
  WORKTREE_PATH_NOT_FOUND,
  TERMINAL_NOT_FOUND,
  INVALID_TERMINAL_STATUS,
} from '../../utils/app-error.js'
import type { createProjectRepository } from '../../db/repositories/project.repository.js'
import type { createWorktreeRepository } from '../../db/repositories/worktree.repository.js'
import type { createTerminalRepository } from '../../db/repositories/terminal.repository.js'
import type { AppConfig } from '../../config.js'
import type { PtyManager } from '../pty/pty.manager.js'
import { normalizePath } from '../security/path-safety.js'

type ProjectRepo = ReturnType<typeof createProjectRepository>
type WorktreeRepo = ReturnType<typeof createWorktreeRepository>
type TerminalRepo = ReturnType<typeof createTerminalRepository>

type DirectoryScope = {
  cwd: string
  scopeId: string
  scopeLabel: string
}

function defaultWorktreeTerminalTitle(
  project: Project,
  worktree: Worktree,
  count: number
): string {
  if (count === 0) {
    return `${project.name}/${worktree.name}`
  }
  return `${project.name}/${worktree.name} #${count + 1}`
}

function defaultDirectoryTerminalTitle(scopeLabel: string, count: number): string {
  if (count === 0) {
    return scopeLabel
  }
  return `${scopeLabel} #${count + 1}`
}

function buildWorktreeEnv(project: Project, worktree: Worktree): Record<string, string> {
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

function buildDirectoryEnv(scope: DirectoryScope): Record<string, string> {
  return {
    VIBETREE_SCOPE_TYPE: 'directory',
    VIBETREE_SCOPE_ID: scope.scopeId,
    VIBETREE_DIRECTORY_PATH: scope.cwd,
  }
}

function resolveDirectoryScope(cwd: string): DirectoryScope {
  if (!path.isAbsolute(cwd)) {
    throw new AppError('INVALID_PATH', 'Path must be absolute')
  }
  if (!fs.existsSync(cwd)) {
    throw new AppError('PATH_NOT_FOUND', 'Path does not exist')
  }

  const realPath = normalizePath(fs.realpathSync.native(cwd))
  const stat = fs.statSync(realPath)
  if (!stat.isDirectory()) {
    throw new AppError('NOT_DIRECTORY', 'Path is not a directory')
  }

  const scopeLabel = path.basename(realPath) || realPath
  return {
    cwd: realPath,
    scopeId: `dir:${realPath}`,
    scopeLabel,
  }
}

import type { TerminalServerMessage } from '@vibetree/shared'

export type TerminalBroadcastEvent = TerminalServerMessage

export type TerminalService = ReturnType<typeof createTerminalService>

export function createTerminalService(
  projectRepo: ProjectRepo,
  worktreeRepo: WorktreeRepo,
  terminalRepo: TerminalRepo,
  ptyManager: PtyManager,
  config: AppConfig
) {
  const attachExitHandler = (session: TerminalSession) => {
    ptyManager.onExit(session.id, (exitCode) => {
      if (session.scopeType === 'directory') {
        const { id, scopeId, scopeType } = session
        terminalRepo.delete(id)
        self.onBroadcast?.({ type: 'terminal-deleted', terminalId: id, scopeId, scopeType })
        return
      }
      terminalRepo.markExited(session.id, exitCode)
      const updated = terminalRepo.findById(session.id)
      if (updated) {
        self.onBroadcast?.({ type: 'terminal-updated', terminal: updated })
      }
    })
  }

  const createStoredSession = (session: TerminalSession, env: Record<string, string>) => {
    terminalRepo.insert(session)

    const runtime = ptyManager.create({
      terminalId: session.id,
      shell: session.shell,
      cwd: session.cwd,
      cols: session.cols,
      rows: session.rows,
      env,
    })

    terminalRepo.updatePidAndStatus(session.id, runtime.pty.pid, 'running')
    attachExitHandler(session)

    return terminalRepo.findById(session.id)!
  }

  const self = {
    onBroadcast: null as ((event: TerminalBroadcastEvent) => void) | null,

    reconcileTerminalStatuses(): void {
      const terminals = terminalRepo.findAll()
      for (const terminal of terminals) {
        if (terminal.status !== 'running' || ptyManager.has(terminal.id)) {
          continue
        }

        if (terminal.scopeType === 'directory') {
          terminalRepo.delete(terminal.id)
        } else {
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
      const scopeLabel = worktree.displayName || worktree.name

      const session: TerminalSession = {
        id: terminalId,
        projectId: project.id,
        worktreeId: worktree.id,
        scopeType: 'worktree',
        scopeId: worktree.id,
        scopeLabel,
        title: input.title ?? defaultWorktreeTerminalTitle(project, worktree, count),
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

      const created = createStoredSession(session, buildWorktreeEnv(project, worktree))
      if (input.initialCommand) {
        ptyManager.write(created.id, `${input.initialCommand}\n`)
      }
      self.onBroadcast?.({ type: 'terminal-created', terminal: created })
      return created
    },

    openDirectoryTerminal(input: OpenDirectoryTerminalInput): OpenDirectoryTerminalResult {
      const scope = resolveDirectoryScope(input.cwd)
      const existing = terminalRepo.findLatestRunningByScopeId(scope.scopeId)
      if (existing) {
        return {
          terminal: existing,
          reused: true,
        }
      }

      return {
        terminal: this.createDirectoryTerminal({
          cwd: scope.cwd,
          shell: input.shell,
          title: input.title,
          cols: input.cols,
          rows: input.rows,
          initialCommand: input.initialCommand,
        }),
        reused: false,
      }
    },

    createDirectoryTerminal(input: CreateDirectoryTerminalInput): TerminalSession {
      const scope = typeof input.scopeId === 'string'
        ? (() => {
            const existing = terminalRepo.findByScopeId(input.scopeId)[0]
            if (!existing || existing.scopeType !== 'directory') {
              throw new AppError('DIRECTORY_SCOPE_NOT_FOUND', 'Directory scope not found')
            }
            return {
              cwd: existing.cwd,
              scopeId: existing.scopeId,
              scopeLabel: existing.scopeLabel,
            }
          })()
        : resolveDirectoryScope(input.cwd)

      const now = new Date().toISOString()
      const terminalId = `term_${nanoid()}`
      const count = terminalRepo.countByScopeId(scope.scopeId)
      const session: TerminalSession = {
        id: terminalId,
        projectId: null,
        worktreeId: null,
        scopeType: 'directory',
        scopeId: scope.scopeId,
        scopeLabel: scope.scopeLabel,
        title: input.title ?? defaultDirectoryTerminalTitle(scope.scopeLabel, count),
        shell: input.shell ?? config.defaultShell,
        cwd: scope.cwd,
        status: 'running',
        pid: null,
        cols: input.cols ?? config.terminal.cols,
        rows: input.rows ?? config.terminal.rows,
        exitCode: null,
        lastActiveAt: now,
        createdAt: now,
        updatedAt: now,
      }

      const created = createStoredSession(session, buildDirectoryEnv(scope))
      if (input.initialCommand) {
        ptyManager.write(created.id, `${input.initialCommand}\n`)
      }
      self.onBroadcast?.({ type: 'terminal-created', terminal: created })
      return created
    },

    renameTerminal(id: string, input: UpdateTerminalInput): TerminalSession {
      const terminal = terminalRepo.findById(id)
      if (!terminal) {
        throw new AppError(TERMINAL_NOT_FOUND, 'Terminal not found')
      }

      if (input.title) {
        terminalRepo.updateTitle(id, input.title)
      }

      const updated = terminalRepo.findById(id)!
      self.onBroadcast?.({ type: 'terminal-updated', terminal: updated })
      return updated
    },

    deleteTerminal(id: string): void {
      const terminal = terminalRepo.findById(id)
      if (!terminal) {
        throw new AppError(TERMINAL_NOT_FOUND, 'Terminal not found')
      }

      const { scopeId, scopeType } = terminal

      if (terminal.status === 'running') {
        ptyManager.kill(id)
      }

      terminalRepo.delete(id)
      self.onBroadcast?.({ type: 'terminal-deleted', terminalId: id, scopeId, scopeType })
    },

    restartTerminal(id: string): TerminalSession {
      const terminal = terminalRepo.findById(id)
      if (!terminal) {
        throw new AppError(TERMINAL_NOT_FOUND, 'Terminal not found')
      }

      if (terminal.scopeType !== 'worktree') {
        throw new AppError(INVALID_TERMINAL_STATUS, 'Directory terminals cannot be restarted')
      }

      if (!['exited', 'killed', 'disconnected'].includes(terminal.status)) {
        throw new AppError(
          INVALID_TERMINAL_STATUS,
          `Cannot restart terminal with status: ${terminal.status}`
        )
      }

      if (!terminal.worktreeId) {
        throw new AppError(WORKTREE_NOT_FOUND, 'Worktree not found')
      }
      const worktree = worktreeRepo.findById(terminal.worktreeId)
      if (!worktree) {
        throw new AppError(WORKTREE_NOT_FOUND, 'Worktree not found')
      }

      if (!terminal.projectId) {
        throw new AppError(PROJECT_NOT_FOUND, 'Project not found')
      }
      const project = projectRepo.findById(terminal.projectId)
      if (!project) {
        throw new AppError(PROJECT_NOT_FOUND, 'Project not found')
      }

      if (!fs.existsSync(worktree.path)) {
        throw new AppError(WORKTREE_PATH_NOT_FOUND, 'Worktree path not found')
      }

      const runtime = ptyManager.create({
        terminalId: id,
        shell: terminal.shell,
        cwd: worktree.path,
        cols: terminal.cols,
        rows: terminal.rows,
        env: buildWorktreeEnv(project, worktree),
      })

      terminalRepo.updatePidAndStatus(id, runtime.pty.pid, 'running')
      attachExitHandler(terminal)

      const updated = terminalRepo.findById(id)!
      self.onBroadcast?.({ type: 'terminal-updated', terminal: updated })
      return updated
    },

    writeToTerminal(id: string, data: string): void {
      ptyManager.write(id, data)
    },
  }

  return self
}
