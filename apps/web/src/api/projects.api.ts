import { apiFetch } from './client.js'
import type { Project, CreateProjectInput } from '@vibetree/shared'

export async function listProjects(): Promise<Project[]> {
  return apiFetch('/api/projects')
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  return apiFetch('/api/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function deleteProject(projectId: string): Promise<void> {
  await apiFetch(`/api/projects/${projectId}`, { method: 'DELETE' })
}

export async function refreshProject(projectId: string): Promise<Project> {
  return apiFetch(`/api/projects/${projectId}/refresh`, { method: 'POST' })
}
