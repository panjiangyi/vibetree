export type Project = {
  id: string
  name: string
  repoPath: string
  worktreeBasePath: string
  mainBranch: string
  setupScript: string | null
  createdAt: string
  updatedAt: string
}

export type Worktree = {
  id: string
  projectId: string
  name: string
  displayName: string | null
  path: string
  branch: string | null
  head: string | null
  isMain: boolean
  isDirty: boolean
  createdByApp: boolean
  createdAt: string
  updatedAt: string
}

export type TerminalStatus =
  | 'running'
  | 'exited'
  | 'killed'
  | 'disconnected'

export type TerminalSession = {
  id: string
  projectId: string
  worktreeId: string
  title: string
  shell: string
  cwd: string
  status: TerminalStatus
  pid: number | null
  cols: number
  rows: number
  exitCode: number | null
  lastActiveAt: string | null
  createdAt: string
  updatedAt: string
}

export type CreateProjectInput = {
  repoPath: string
  worktreeBasePath?: string
  name?: string
  mainBranch?: string
  setupScript?: string
}

export type UpdateProjectInput = {
  name?: string
  mainBranch?: string
  setupScript?: string | null
}

export type CreateWorktreeInput = {
  branch: string
  baseRef: string
  path?: string
  name?: string
}

export type UpdateWorktreeInput = {
  displayName?: string | null
}

export type CreateTerminalInput = {
  shell?: string
  title?: string
  cols?: number
  rows?: number
}

export type UpdateTerminalInput = {
  title?: string
}

export type ApiErrorPayload = {
  error: {
    code: string
    message: string
  }
}
