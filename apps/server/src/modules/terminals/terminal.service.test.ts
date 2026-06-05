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
  }
}

async function createContext() {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'vibetree-terminal-test-'))
  tempDirs.push(rootPath)

  const db = createDatabase(path.join(rootPath, 'app.db'))
  const projectRepo = createProjectRepository(db)
  const worktreeRepo = createWorktreeRepository(db)
  const terminalRepo = createTerminalRepository(db)
  const ptyManager = createMockPtyManager()
  const terminalService = createTerminalService(
    projectRepo,
    worktreeRepo,
    terminalRepo,
    ptyManager as never,
    {
      host: '127.0.0.1',
      port: 3767,
      databasePath: path.join(rootPath, 'app.db'),
      defaultShell: '/bin/bash',
      terminal: {
        cols: 120,
        rows: 30,
        scrollback: 10000,
      },
    }
  )

  return { rootPath, db, terminalService, terminalRepo, ptyManager }
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
