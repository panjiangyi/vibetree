import path from 'node:path'
import fs from 'node:fs'
import { nanoid } from 'nanoid'
import type { Project, CreateProjectInput, UpdateProjectInput } from '@vibetree/shared'
import * as git from '../git/git.service.js'
import { normalizePath } from '../security/path-safety.js'
import { AppError, PROJECT_EXISTS, INVALID_GIT_REPO, PROJECT_NOT_FOUND, PROJECT_HAS_RUNNING_TERMINALS } from '../../utils/app-error.js'
import type { createProjectRepository } from '../../db/repositories/project.repository.js'
import type { createWorktreeRepository } from '../../db/repositories/worktree.repository.js'
import type { createTerminalRepository } from '../../db/repositories/terminal.repository.js'

type ProjectRepo = ReturnType<typeof createProjectRepository>
type WorktreeRepo = ReturnType<typeof createWorktreeRepository>
type TerminalRepo = ReturnType<typeof createTerminalRepository>

function defaultWorktreeBasePath(repoPath: string): string {
  const parent = path.dirname(repoPath)
  const name = path.basename(repoPath)
  return path.join(parent, `${name}-worktrees`)
}

export type ProjectService = ReturnType<typeof createProjectService>

export function createProjectService(
  projectRepo: ProjectRepo,
  worktreeRepo: WorktreeRepo,
  terminalRepo: TerminalRepo,
  syncProjectWorktrees: (projectId: string) => Promise<void>
) {
  return {
    async createProject(input: CreateProjectInput): Promise<Project> {
      if (!fs.existsSync(input.repoPath)) {
        throw new AppError('PROJECT_PATH_NOT_FOUND', 'Path does not exist')
      }

      const isRepo = await git.isGitRepository(input.repoPath)
      if (!isRepo) {
        throw new AppError(INVALID_GIT_REPO, 'Path is not a Git repository')
      }

      const repoRoot = await git.getRepoRoot(input.repoPath)

      const exists = projectRepo.findByRepoPath(repoRoot)
      if (exists) {
        throw new AppError(PROJECT_EXISTS, 'Project already exists')
      }

      const mainBranch = input.mainBranch || await git.detectDefaultBranch(repoRoot)

      const now = new Date().toISOString()
      const project: Project = {
        id: `proj_${nanoid()}`,
        name: input.name ?? path.basename(repoRoot),
        repoPath: normalizePath(repoRoot),
        worktreeBasePath: input.worktreeBasePath ?? defaultWorktreeBasePath(repoRoot),
        mainBranch,
        setupScript: input.setupScript ?? null,
        createdAt: now,
        updatedAt: now,
      }

      projectRepo.insert(project)
      await syncProjectWorktrees(project.id)

      return project
    },

    listProjects(): Project[] {
      return projectRepo.findAll()
    },

    getProject(id: string): Project {
      const project = projectRepo.findById(id)
      if (!project) {
        throw new AppError(PROJECT_NOT_FOUND, 'Project not found')
      }
      return project
    },

    updateProject(id: string, input: UpdateProjectInput): Project {
      const project = projectRepo.findById(id)
      if (!project) {
        throw new AppError(PROJECT_NOT_FOUND, 'Project not found')
      }

      projectRepo.update(id, input)
      return projectRepo.findById(id)!
    },

    async listBranches(id: string): Promise<{ local: string[]; remote: string[] }> {
      const project = projectRepo.findById(id)
      if (!project) {
        throw new AppError(PROJECT_NOT_FOUND, 'Project not found')
      }

      return git.listBranches(project.repoPath)
    },

    async deleteProject(id: string): Promise<void> {
      const project = projectRepo.findById(id)
      if (!project) {
        throw new AppError(PROJECT_NOT_FOUND, 'Project not found')
      }

      const worktrees = worktreeRepo.findByProjectId(id)
      for (const wt of worktrees) {
        const runningCount = terminalRepo.countRunningByWorktreeId(wt.id)
        if (runningCount > 0) {
          throw new AppError(
            PROJECT_HAS_RUNNING_TERMINALS,
            'Close terminals before removing project'
          )
        }
      }

      projectRepo.delete(id)
    },

    async refreshProject(id: string): Promise<Project> {
      const project = projectRepo.findById(id)
      if (!project) {
        throw new AppError(PROJECT_NOT_FOUND, 'Project not found')
      }

      if (!fs.existsSync(project.repoPath)) {
        throw new AppError('PROJECT_PATH_NOT_FOUND', 'Project path no longer exists')
      }

      await syncProjectWorktrees(id)
      return project
    },
  }
}
