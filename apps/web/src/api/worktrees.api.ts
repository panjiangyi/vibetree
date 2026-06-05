import { apiFetch } from './client.js'
import type {
  Worktree,
  CreateWorktreeInput,
  UpdateWorktreeInput,
  CheckMergeInput,
  MergeCheckResult,
} from '@vibetree/shared'

export async function listWorktrees(projectId: string): Promise<Worktree[]> {
  return apiFetch(`/api/projects/${projectId}/worktrees`)
}

export async function createWorktree(
  projectId: string,
  input: CreateWorktreeInput
): Promise<Worktree> {
  return apiFetch(`/api/projects/${projectId}/worktrees`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function deleteWorktree(worktreeId: string): Promise<void> {
  await apiFetch(`/api/worktrees/${worktreeId}`, { method: 'DELETE' })
}

export async function updateWorktree(
  worktreeId: string,
  input: UpdateWorktreeInput
): Promise<Worktree> {
  return apiFetch(`/api/worktrees/${worktreeId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function refreshWorktree(worktreeId: string): Promise<Worktree> {
  return apiFetch(`/api/worktrees/${worktreeId}/refresh`, { method: 'POST' })
}

export async function checkMerge(
  projectId: string,
  input: CheckMergeInput
): Promise<MergeCheckResult> {
  return apiFetch(`/api/projects/${projectId}/merge-check`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
