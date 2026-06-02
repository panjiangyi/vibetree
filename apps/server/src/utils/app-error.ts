export class AppError extends Error {
  public readonly code: string
  public readonly statusCode: number

  constructor(code: string, message: string, statusCode = 400) {
    super(message)
    this.code = code
    this.statusCode = statusCode
    this.name = 'AppError'
  }
}

// Project error codes
export const PROJECT_NOT_FOUND = 'PROJECT_NOT_FOUND'
export const PROJECT_EXISTS = 'PROJECT_EXISTS'
export const INVALID_GIT_REPO = 'INVALID_GIT_REPO'
export const PROJECT_PATH_NOT_FOUND = 'PROJECT_PATH_NOT_FOUND'
export const PROJECT_HAS_RUNNING_TERMINALS = 'PROJECT_HAS_RUNNING_TERMINALS'

// Worktree error codes
export const WORKTREE_NOT_FOUND = 'WORKTREE_NOT_FOUND'
export const WORKTREE_PATH_EXISTS = 'WORKTREE_PATH_EXISTS'
export const WORKTREE_DIRTY = 'WORKTREE_DIRTY'
export const WORKTREE_HAS_RUNNING_TERMINALS = 'WORKTREE_HAS_RUNNING_TERMINALS'
export const CANNOT_REMOVE_MAIN_WORKTREE = 'CANNOT_REMOVE_MAIN_WORKTREE'
export const BASE_REF_NOT_FOUND = 'BASE_REF_NOT_FOUND'
export const BRANCH_EXISTS = 'BRANCH_EXISTS'
export const UNSAFE_PATH = 'UNSAFE_PATH'

// Terminal error codes
export const TERMINAL_NOT_FOUND = 'TERMINAL_NOT_FOUND'
export const PTY_NOT_FOUND = 'PTY_NOT_FOUND'
export const TERMINAL_NOT_RUNNING = 'TERMINAL_NOT_RUNNING'
export const WORKTREE_PATH_NOT_FOUND = 'WORKTREE_PATH_NOT_FOUND'
export const INVALID_TERMINAL_STATUS = 'INVALID_TERMINAL_STATUS'

// Generic
export const INTERNAL_ERROR = 'INTERNAL_ERROR'
