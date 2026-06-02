import { apiFetch } from './client.js'
import type { Project, CreateProjectInput, UpdateProjectInput } from '@vibetree/shared'

export async function listProjects(): Promise<Project[]> {
  return apiFetch('/api/projects')
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  return apiFetch('/api/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateProject(projectId: string, input: UpdateProjectInput): Promise<Project> {
  return apiFetch(`/api/projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function listBranches(projectId: string): Promise<{ local: string[]; remote: string[] }> {
  return apiFetch(`/api/projects/${projectId}/branches`)
}

export async function deleteProject(projectId: string): Promise<void> {
  await apiFetch(`/api/projects/${projectId}`, { method: 'DELETE' })
}

export async function refreshProject(projectId: string): Promise<Project> {
  return apiFetch(`/api/projects/${projectId}/refresh`, { method: 'POST' })
}
