import type { AuthSessionResponse, LoginInput } from '@vibetree/shared'
import { apiFetch } from './client.js'

export async function getSession(): Promise<AuthSessionResponse> {
  return apiFetch('/api/auth/session')
}

export async function login(input: LoginInput): Promise<void> {
  await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function logout(): Promise<void> {
  await apiFetch('/api/auth/logout', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}
