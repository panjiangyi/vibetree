import { create } from 'zustand'
import * as authApi from '../api/auth.api.js'

type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated'

type AuthStore = {
  status: AuthStatus
  username: string | null
  expiresAt: string | null
  error: string | null
  isSubmitting: boolean
  checkSession: () => Promise<void>
  login: (input: { username: string; password: string }) => Promise<void>
  logout: () => Promise<void>
  resetError: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  status: 'checking',
  username: null,
  expiresAt: null,
  error: null,
  isSubmitting: false,

  checkSession: async () => {
    set({ status: 'checking', error: null })
    try {
      const session = await authApi.getSession()
      if (!session.authenticated) {
        set({ status: 'unauthenticated', username: null, expiresAt: null })
        return
      }
      set({
        status: 'authenticated',
        username: session.username,
        expiresAt: session.expiresAt,
        error: null,
      })
    } catch (error) {
      set({
        status: 'unauthenticated',
        username: null,
        expiresAt: null,
        error: (error as Error).message,
      })
    }
  },

  login: async (input) => {
    set({ isSubmitting: true, error: null })
    try {
      await authApi.login(input)
      const session = await authApi.getSession()
      if (!session.authenticated) {
        throw new Error('Authentication failed')
      }
      set({
        status: 'authenticated',
        username: session.username,
        expiresAt: session.expiresAt,
        isSubmitting: false,
        error: null,
      })
    } catch (error) {
      set({
        status: 'unauthenticated',
        username: null,
        expiresAt: null,
        isSubmitting: false,
        error: (error as Error).message,
      })
      throw error
    }
  },

  logout: async () => {
    set({ isSubmitting: true, error: null })
    try {
      await authApi.logout()
    } finally {
      set({
        status: 'unauthenticated',
        username: null,
        expiresAt: null,
        isSubmitting: false,
        error: null,
      })
    }
  },

  resetError: () => {
    set({ error: null })
  },
}))
