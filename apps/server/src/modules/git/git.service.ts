import { execa } from 'execa'
import { AppError } from '../../utils/app-error.js'
import { parseWorktreePorcelain } from './git.parser.js'
import type { GitWorktreeInfo } from './git.types.js'

const ALLOWED_COMMANDS = [
  'worktree',
  'status',
  'rev-parse',
  'show-ref',
  'branch',
  'for-each-ref',
  'symbolic-ref',
]

export async function runGit(args: string[], cwd: string): Promise<string> {
  if (!ALLOWED_COMMANDS.includes(args[0])) {
    throw new AppError('INVALID_GIT_COMMAND', `Git command not allowed: ${args[0]}`)
  }

  const result = await execa('git', args, {
    cwd,
    reject: false,
  })

  if (result.exitCode !== 0) {
    throw new AppError(
      'GIT_COMMAND_FAILED',
      result.stderr || result.stdout || 'Git command failed'
    )
  }

  return result.stdout
}

export async function isGitRepository(path: string): Promise<boolean> {
  try {
    const stdout = await runGit(['rev-parse', '--is-inside-work-tree'], path)
    return stdout.trim() === 'true'
  } catch {
    return false
  }
}

export async function getRepoRoot(path: string): Promise<string> {
  const stdout = await runGit(['rev-parse', '--show-toplevel'], path)
  return stdout.trim()
}

export async function listWorktrees(repoPath: string): Promise<GitWorktreeInfo[]> {
  const stdout = await runGit(['worktree', 'list', '--porcelain'], repoPath)
  return parseWorktreePorcelain(stdout)
}

export async function isWorktreeDirty(worktreePath: string): Promise<boolean> {
  const stdout = await runGit(['status', '--porcelain'], worktreePath)
  return stdout.trim().length > 0
}

export async function refExists(repoPath: string, ref: string): Promise<boolean> {
  try {
    await runGit(['rev-parse', '--verify', ref], repoPath)
    return true
  } catch {
    return false
  }
}

export async function branchExists(repoPath: string, branch: string): Promise<boolean> {
  try {
    await runGit(['show-ref', '--verify', `refs/heads/${branch}`], repoPath)
    return true
  } catch {
    return false
  }
}

export async function createWorktree(input: {
  repoPath: string
  branch: string
  path: string
  baseRef: string
}): Promise<void> {
  await runGit(
    ['worktree', 'add', '-b', input.branch, input.path, input.baseRef],
    input.repoPath
  )
}

export async function removeWorktree(input: {
  repoPath: string
  path: string
}): Promise<void> {
  await runGit(['worktree', 'remove', input.path], input.repoPath)
}

export async function listBranches(repoPath: string): Promise<{ local: string[]; remote: string[] }> {
  const stdout = await runGit(
    ['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes'],
    repoPath
  )

  const local: string[] = []
  const remote: string[] = []

  for (const line of stdout.split('\n')) {
    const ref = line.trim()
    if (!ref) continue
    if (ref.startsWith('remotes/')) {
      remote.push(ref.replace('remotes/', ''))
    } else {
      local.push(ref)
    }
  }

  return { local, remote }
}

export async function detectDefaultBranch(repoPath: string): Promise<string> {
  try {
    const stdout = await runGit(['symbolic-ref', 'refs/remotes/origin/HEAD'], repoPath)
    return stdout.trim().replace('refs/remotes/origin/', '')
  } catch {
    if (await branchExists(repoPath, 'main')) return 'main'
    if (await branchExists(repoPath, 'master')) return 'master'

    try {
      const stdout = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath)
      return stdout.trim()
    } catch {
      return 'main'
    }
  }
}
