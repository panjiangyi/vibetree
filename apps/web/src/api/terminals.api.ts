import { apiFetch } from './client.js'
import type { TerminalSession, CreateTerminalInput, UpdateTerminalInput } from '@vibetree/shared'

export async function listTerminals(): Promise<TerminalSession[]> {
  return apiFetch('/api/terminals')
}

export async function createTerminal(
  worktreeId: string,
  input: CreateTerminalInput = {}
): Promise<TerminalSession> {
  return apiFetch(`/api/worktrees/${worktreeId}/terminals`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateTerminal(
  terminalId: string,
  input: UpdateTerminalInput
): Promise<TerminalSession> {
  return apiFetch(`/api/terminals/${terminalId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function deleteTerminal(terminalId: string): Promise<void> {
  await apiFetch(`/api/terminals/${terminalId}`, { method: 'DELETE' })
}

export async function restartTerminal(terminalId: string): Promise<TerminalSession> {
  return apiFetch(`/api/terminals/${terminalId}/restart`, { method: 'POST' })
}
