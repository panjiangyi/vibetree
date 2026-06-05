import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execa } from 'execa'
import type { Project } from '@vibetree/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase } from '../../db/database.js'
import { createProjectRepository } from '../../db/repositories/project.repository.js'
import { createTerminalRepository } from '../../db/repositories/terminal.repository.js'
import { createWorktreeRepository } from '../../db/repositories/worktree.repository.js'
import { WORKTREE_NOT_MERGED, type AppError } from '../../utils/app-error.js'
import { createWorktreeService } from './worktree.service.js'

type TestContext = {
  rootPath: string
  repoPath: string
  worktreeBasePath: string
}

const tempDirs: string[] = []

async function git(repoPath: string, args: string[]) {
  return execa('git', args, {
    cwd: repoPath,
  })
}

async function writeFile(repoPath: string, name: string, content: string) {
  await fs.writeFile(path.join(repoPath, name), content)
}

async function commitFile(repoPath: string, name: string, content: string, message: string) {
  await writeFile(repoPath, name, content)
  await git(repoPath, ['add', name])
  await git(repoPath, ['commit', '-q', '-m', message])
}

async function createRepo(): Promise<TestContext> {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'vibetree-worktree-test-'))
  tempDirs.push(rootPath)

  const repoPath = path.join(rootPath, 'repo')
  const worktreeBasePath = path.join(rootPath, 'worktrees')
  await fs.mkdir(repoPath, { recursive: true })
  await fs.mkdir(worktreeBasePath, { recursive: true })

  await git(repoPath, ['init', '-q', '-b', 'main'])
  await git(repoPath, ['config', 'user.name', 'Test User'])
  await git(repoPath, ['config', 'user.email', 'test@example.com'])
  await commitFile(repoPath, 'README.md', 'base\n', 'init')

  return { rootPath, repoPath, worktreeBasePath }
}

async function createService(ctx: TestContext) {
  const db = createDatabase(path.join(ctx.rootPath, 'app.db'))
  const projectRepo = createProjectRepository(db)
  const worktreeRepo = createWorktreeRepository(db)
  const terminalRepo = createTerminalRepository(db)
  const terminalService = {
    createTerminal: () => {
      throw new Error('Unexpected terminal creation')
    },
    writeToTerminal: () => {},
  } as unknown as Parameters<typeof createWorktreeService>[3]
  const service = createWorktreeService(projectRepo, worktreeRepo, terminalRepo, terminalService)

  const now = new Date().toISOString()
  const project: Project = {
    id: 'proj_test',
    name: 'repo',
    repoPath: ctx.repoPath,
    worktreeBasePath: ctx.worktreeBasePath,
    mainBranch: 'main',
    setupScript: null,
    createdAt: now,
    updatedAt: now,
  }

  projectRepo.insert(project)

  return { db, service }
}

afterEach(async () => {
  const dirs = tempDirs.splice(0)
  await Promise.all(dirs.map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('worktree merge guards', () => {
  it('blocks removing a clean worktree whose branch is not merged', async () => {
    const ctx = await createRepo()
    await git(ctx.repoPath, [
      'worktree',
      'add',
      '-q',
      '-b',
      'unmerged-feature',
      path.join(ctx.worktreeBasePath, 'unmerged-feature'),
      'main',
    ])
    await commitFile(
      path.join(ctx.worktreeBasePath, 'unmerged-feature'),
      'unmerged.txt',
      'unmerged\n',
      'unmerged change'
    )

    const { db, service } = await createService(ctx)
    await service.syncProjectWorktrees('proj_test')
    const worktree = (await service.listWorktrees('proj_test')).find(
      (wt) => wt.branch === 'unmerged-feature'
    )

    expect(worktree?.mergeCheck?.status).toBe('unmerged')
    await expect(service.removeWorktree(worktree!.id)).rejects.toMatchObject({
      code: WORKTREE_NOT_MERGED,
    } satisfies Partial<AppError>)
    await expect(fs.stat(worktree!.path)).resolves.toBeTruthy()

    db.close()
  })

  it('allows removing a clean worktree whose branch has rebase-equivalent patches', async () => {
    const ctx = await createRepo()
    await git(ctx.repoPath, ['switch', '-q', '-c', 'rebased-feature'])
    await commitFile(ctx.repoPath, 'feature.txt', 'feature\n', 'feature change')
    await git(ctx.repoPath, ['switch', '-q', 'main'])
    await commitFile(ctx.repoPath, 'main.txt', 'main advance\n', 'main advance')
    await git(ctx.repoPath, ['cherry-pick', 'rebased-feature'])
    await git(ctx.repoPath, [
      'worktree',
      'add',
      '-q',
      path.join(ctx.worktreeBasePath, 'rebased-feature'),
      'rebased-feature',
    ])

    const { db, service } = await createService(ctx)
    await service.syncProjectWorktrees('proj_test')
    const worktree = (await service.listWorktrees('proj_test')).find(
      (wt) => wt.branch === 'rebased-feature'
    )

    expect(worktree?.mergeCheck?.status).toBe('rebased')
    await service.removeWorktree(worktree!.id)
    await expect(fs.stat(worktree!.path)).rejects.toMatchObject({ code: 'ENOENT' })

    db.close()
  })
})
