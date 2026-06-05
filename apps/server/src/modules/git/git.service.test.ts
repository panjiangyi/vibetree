import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execa } from 'execa'
import { afterEach, describe, expect, it } from 'vitest'
import { checkBranchMergedToTarget } from './git.service.js'

const tempDirs: string[] = []

async function git(repoPath: string, args: string[], reject = true) {
  return execa('git', args, {
    cwd: repoPath,
    reject,
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

async function createRepo() {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'vibetree-git-test-'))
  tempDirs.push(repoPath)

  await git(repoPath, ['init', '-q', '-b', 'main'])
  await git(repoPath, ['config', 'user.name', 'Test User'])
  await git(repoPath, ['config', 'user.email', 'test@example.com'])
  await commitFile(repoPath, 'README.md', 'base\n', 'init')

  return repoPath
}

afterEach(async () => {
  const dirs = tempDirs.splice(0)
  await Promise.all(dirs.map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('checkBranchMergedToTarget', () => {
  it('detects a branch merged through a merge commit', async () => {
    const repoPath = await createRepo()

    await git(repoPath, ['switch', '-q', '-c', 'merged-via-merge-commit'])
    await commitFile(repoPath, 'merged.txt', 'merged\n', 'feature change')
    await git(repoPath, ['switch', '-q', 'main'])
    await git(repoPath, [
      'merge',
      '--no-ff',
      '-q',
      'merged-via-merge-commit',
      '-m',
      'Merge branch merged-via-merge-commit',
    ])

    const result = await checkBranchMergedToTarget(
      repoPath,
      'merged-via-merge-commit',
      'main'
    )

    expect(result.status).toBe('merged')
    expect(result.method).toBe('ancestor')
    expect(result.isMergedToTarget).toBe(true)
  })

  it('detects a rebase-equivalent branch that git branch -d rejects', async () => {
    const repoPath = await createRepo()

    await git(repoPath, ['switch', '-q', '-c', 'rebased-feature'])
    await commitFile(repoPath, 'feature.txt', 'feature\n', 'feature change')
    await git(repoPath, ['switch', '-q', 'main'])
    await commitFile(repoPath, 'main.txt', 'main advance\n', 'main advance')
    await git(repoPath, ['cherry-pick', 'rebased-feature'])

    const deleteResult = await git(repoPath, ['branch', '-d', 'rebased-feature'], false)
    const result = await checkBranchMergedToTarget(repoPath, 'rebased-feature', 'main')

    expect(deleteResult.exitCode).toBe(1)
    expect(result.status).toBe('rebased')
    expect(result.method).toBe('patch_equivalent')
    expect(result.isMergedToTarget).toBe(true)
    expect(result.equivalentCommitCount).toBe(1)
    expect(result.unmergedCommitCount).toBe(0)
  })

  it('rejects a branch with commits not present in the target branch', async () => {
    const repoPath = await createRepo()

    await git(repoPath, ['switch', '-q', '-c', 'unmerged-feature'])
    await commitFile(repoPath, 'unmerged.txt', 'unmerged\n', 'unmerged change')

    const result = await checkBranchMergedToTarget(repoPath, 'unmerged-feature', 'main')

    expect(result.status).toBe('unmerged')
    expect(result.method).toBe('none')
    expect(result.isMergedToTarget).toBe(false)
    expect(result.unmergedCommitCount).toBe(1)
  })

  it('returns unknown when refs cannot be resolved', async () => {
    const repoPath = await createRepo()

    const missingBranch = await checkBranchMergedToTarget(repoPath, 'missing-feature', 'main')
    const missingTarget = await checkBranchMergedToTarget(repoPath, 'main', 'missing-target')

    expect(missingBranch.status).toBe('unknown')
    expect(missingBranch.isMergedToTarget).toBe(false)
    expect(missingTarget.status).toBe('unknown')
    expect(missingTarget.isMergedToTarget).toBe(false)
  })
})
