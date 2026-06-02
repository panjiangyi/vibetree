import { create } from 'zustand'
import type { Project, Worktree, CreateProjectInput, CreateWorktreeInput, UpdateProjectInput } from '@vibetree/shared'
import * as projectsApi from '../api/projects.api.js'
import * as worktreesApi from '../api/worktrees.api.js'

type ProjectStore = {
  projects: Project[]
  worktreesByProjectId: Record<string, Worktree[]>
  loading: boolean
  error: string | null

  loadProjects: () => Promise<void>
  loadProjectWorktrees: (projectId: string) => Promise<void>
  addProject: (input: CreateProjectInput) => Promise<void>
  updateProject: (projectId: string, input: UpdateProjectInput) => Promise<void>
  refreshProject: (projectId: string) => Promise<void>
  listBranches: (projectId: string) => Promise<{ local: string[]; remote: string[] }>
  createWorktree: (projectId: string, input: CreateWorktreeInput) => Promise<Worktree>
  removeWorktree: (worktreeId: string) => Promise<void>
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  worktreesByProjectId: {},
  loading: false,
  error: null,

  loadProjects: async () => {
    set({ loading: true, error: null })
    try {
      const projects = await projectsApi.listProjects()
      set({ projects, loading: false })

      // Load worktrees for each project
      for (const project of projects) {
        await get().loadProjectWorktrees(project.id)
      }
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  loadProjectWorktrees: async (projectId: string) => {
    try {
      const worktrees = await worktreesApi.listWorktrees(projectId)
      set((state) => ({
        worktreesByProjectId: {
          ...state.worktreesByProjectId,
          [projectId]: worktrees,
        },
      }))
    } catch (error) {
      console.error('Failed to load worktrees:', error)
    }
  },

  addProject: async (input: CreateProjectInput) => {
    set({ loading: true, error: null })
    try {
      const project = await projectsApi.createProject(input)
      set((state) => ({
        projects: [project, ...state.projects],
        loading: false,
      }))
      await get().loadProjectWorktrees(project.id)
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
      throw error
    }
  },

  updateProject: async (projectId: string, input: UpdateProjectInput) => {
    set({ loading: true, error: null })
    try {
      const project = await projectsApi.updateProject(projectId, input)
      set((state) => ({
        projects: state.projects.map((p) => (p.id === projectId ? project : p)),
        loading: false,
      }))
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
      throw error
    }
  },

  refreshProject: async (projectId: string) => {
    try {
      await projectsApi.refreshProject(projectId)
      await get().loadProjectWorktrees(projectId)
    } catch (error) {
      set({ error: (error as Error).message })
      throw error
    }
  },

  listBranches: async (projectId: string) => {
    return projectsApi.listBranches(projectId)
  },

  createWorktree: async (projectId: string, input: CreateWorktreeInput) => {
    set({ loading: true, error: null })
    try {
      const worktree = await worktreesApi.createWorktree(projectId, input)
      await get().loadProjectWorktrees(projectId)
      set({ loading: false })
      return worktree
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
      throw error
    }
  },

  removeWorktree: async (worktreeId: string) => {
    set({ loading: true, error: null })
    try {
      await worktreesApi.deleteWorktree(worktreeId)
      // Find which project this worktree belongs to
      const { worktreesByProjectId } = get()
      for (const [projectId, worktrees] of Object.entries(worktreesByProjectId)) {
        if (worktrees.some((wt) => wt.id === worktreeId)) {
          await get().loadProjectWorktrees(projectId)
          break
        }
      }
      set({ loading: false })
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
      throw error
    }
  },
}))
