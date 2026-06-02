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
