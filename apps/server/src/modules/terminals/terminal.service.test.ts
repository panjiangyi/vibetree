import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase } from '../../db/database.js'
import { createProjectRepository } from '../../db/repositories/project.repository.js'
import { createTerminalRepository } from '../../db/repositories/terminal.repository.js'
import { createWorktreeRepository } from '../../db/repositories/worktree.repository.js'
import { createTerminalService } from './terminal.service.js'

const tempDirs: string[] = []

function createMockPtyManager() {
  const exitCallbacks = new Map<string, (exitCode: number | null) => void>()
  const runtimes = new Map<string, { pty: { pid: number } }>()

  return {
    has(terminalId: string) {
      return runtimes.has(terminalId)
    },
    get(terminalId: string) {
      return runtimes.get(terminalId)
    },
    create(input: { terminalId: string }) {
      const runtime = { pty: { pid: 123 } }
      runtimes.set(input.terminalId, runtime)
      return runtime as never
    },
    write() {},
    resize() {},
    kill(terminalId: string) {
      runtimes.delete(terminalId)
      exitCallbacks.get(terminalId)?.(null)
    },
    attachClient() {},
    detachClient() {},
    detachClientFromAll() {},
    onExit(terminalId: string, callback: (exitCode: number | null) => void) {
      exitCallbacks.set(terminalId, callback)
    },
    emitExit(terminalId: string, exitCode: number | null) {
      runtimes.delete(terminalId)
      exitCallbacks.get(terminalId)?.(exitCode)
    },
    dropRuntime(terminalId: string) {
      runtimes.delete(terminalId)
    },
  }
}

function createMockTmuxManager(isAvailable = false) {
  const sessions = new Set<string>()

  return {
    binary: 'tmux',
    isAvailable() {
      return isAvailable
    },
    hasSession(terminalId: string) {
      return sessions.has(terminalId)
    },
    createSession(input: { terminalId: string }) {
      sessions.add(input.terminalId)
    },
    killSession(terminalId: string) {
      sessions.delete(terminalId)
    },
    getAttachSpawnSpec(terminalId: string) {
      return { file: 'tmux', args: ['attach-session', '-t', `vibetree-${terminalId}`] }
    },
    sessionNameForTerminal(terminalId: string) {
      return `vibetree-${terminalId}`
    },
  }
}

async function createContext(options?: { tmuxAvailable?: boolean }) {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'vibetree-terminal-test-'))
  tempDirs.push(rootPath)

  const db = createDatabase(path.join(rootPath, 'app.db'))
  const projectRepo = createProjectRepository(db)
  const worktreeRepo = createWorktreeRepository(db)
  const terminalRepo = createTerminalRepository(db)
  const ptyManager = createMockPtyManager()
  const tmuxManager = createMockTmuxManager(options?.tmuxAvailable ?? false)
  const terminalService = createTerminalService(
    projectRepo,
    worktreeRepo,
    terminalRepo,
    ptyManager as never,
    tmuxManager as never,
    {
      host: '127.0.0.1',
      port: 3767,
      databasePath: path.join(rootPath, 'app.db'),
      trustProxy: true,
      defaultShell: '/bin/bash',
      auth: {
        username: 'test-user',
        password: 'test-pass',
        sessionTtlMs: 60_000,
        ipFailureLimit: 5,
        ipWindowMs: 60_000,
        globalFailureLimit: 10,
        globalCooldownMs: 60_000,
        cookieName: 'vibetree_session',
      },
      terminal: {
        cols: 120,
        rows: 30,
        scrollback: 10000,
      },
    }
  )

  return { rootPath, db, projectRepo, worktreeRepo, terminalService, terminalRepo, ptyManager, tmuxManager }
}

afterEach(async () => {
  const dirs = tempDirs.splice(0)
  await Promise.all(dirs.map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('directory terminals', () => {
  it('reuses the same scope for canonical-equivalent directories', async () => {
    const { rootPath, db, terminalService } = await createContext()
    const actualDir = path.join(rootPath, 'actual')
    const linkDir = path.join(rootPath, 'linked')
    await fs.mkdir(actualDir)
    await fs.symlink(actualDir, linkDir)

    const first = terminalService.openDirectoryTerminal({ cwd: actualDir })
    const second = terminalService.openDirectoryTerminal({ cwd: linkDir })

    expect(first.reused).toBe(false)
    expect(second.reused).toBe(true)
    expect(second.terminal.scopeType).toBe('directory')
    expect(second.terminal.scopeId).toBe(first.terminal.scopeId)
    expect(second.terminal.cwd).toBe(first.terminal.cwd)

    db.close()
  })

  it('can create another terminal in the same directory scope and deletes directory sessions on exit', async () => {
    const { rootPath, db, terminalService, terminalRepo, ptyManager } = await createContext()
    const actualDir = path.join(rootPath, 'workspace')
    await fs.mkdir(actualDir)

    const opened = terminalService.openDirectoryTerminal({ cwd: actualDir })
    const second = terminalService.createDirectoryTerminal({ scopeId: opened.terminal.scopeId })

    expect(second.scopeId).toBe(opened.terminal.scopeId)
    expect(second.title).toBe(`${opened.terminal.scopeLabel} #2`)
    expect(terminalRepo.countByScopeId(opened.terminal.scopeId)).toBe(2)

    ptyManager.emitExit(opened.terminal.id, 0)
    ptyManager.emitExit(second.id, 0)

    expect(terminalService.listTerminals()).toEqual([])

    db.close()
  })
})

describe('worktree terminals with tmux persistence', () => {
  it('restores a disconnected runtime when the tmux session still exists', async () => {
    const { rootPath, db, projectRepo, worktreeRepo, terminalService, ptyManager, terminalRepo } =
      await createContext({ tmuxAvailable: true })
    const repoPath = path.join(rootPath, 'repo')
    const worktreePath = path.join(rootPath, 'repo-wt')
    await fs.mkdir(repoPath)
    await fs.mkdir(worktreePath)

    const now = new Date().toISOString()
    projectRepo.insert({
      id: 'project_1',
      name: 'repo',
      repoPath,
      worktreeBasePath: path.join(rootPath, '.worktree'),
      mainBranch: 'main',
      setupScript: null,
      devServerScript: null,
      createdAt: now,
      updatedAt: now,
    })
    worktreeRepo.upsert({
      id: 'worktree_1',
      projectId: 'project_1',
      name: 'feature-a',
      displayName: 'Feature A',
      path: worktreePath,
      branch: 'feature-a',
      head: null,
      isMain: false,
      isDirty: false,
      createdByApp: true,
      createdAt: now,
      updatedAt: now,
    })

    const created = terminalService.createTerminal('worktree_1')
    ptyManager.dropRuntime(created.id)
    terminalRepo.updatePid(created.id, null)

    const restored = terminalService.ensureTerminalRuntime(created.id)

    expect(restored.status).toBe('running')
    expect(restored.pid).toBe(123)

    db.close()
  })
})
