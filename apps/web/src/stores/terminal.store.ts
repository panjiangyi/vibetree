import { create } from 'zustand'
import type { TerminalSession, CreateTerminalInput } from '@vibetree/shared'
import * as terminalsApi from '../api/terminals.api.js'
import { useLayoutStore } from './layout.store.js'

type TerminalStore = {
  terminals: TerminalSession[]
  activeWorktreeId: string | null
  loading: boolean
  error: string | null

  loadTerminals: () => Promise<void>
  openTerminalForWorktree: (worktreeId: string) => Promise<void>
  createTerminal: (worktreeId: string, input?: CreateTerminalInput) => Promise<TerminalSession>
  closeTerminal: (terminalId: string) => Promise<void>
  renameTerminal: (terminalId: string, title: string) => Promise<void>
  restartTerminal: (terminalId: string) => Promise<void>
  setActiveWorktree: (worktreeId: string | null) => void
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  terminals: [],
  activeWorktreeId: localStorage.getItem('vibetree.activeWorktreeId'),
  loading: false,
  error: null,

  loadTerminals: async () => {
    set({ loading: true, error: null })
    try {
      const terminals = await terminalsApi.listTerminals()
      set({ terminals, loading: false })
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  openTerminalForWorktree: async (worktreeId: string) => {
    const { terminals } = get()

    get().setActiveWorktree(worktreeId)

    const running = terminals
      .filter((t) => t.worktreeId === worktreeId && t.status === 'running')
      .sort((a, b) => (b.lastActiveAt ?? '').localeCompare(a.lastActiveAt ?? ''))

    if (running[0]) {
      useLayoutStore.getState().addPaneForTerminal(worktreeId, running[0].id, running[0].title)
      return
    }

    const terminal = await get().createTerminal(worktreeId)
    useLayoutStore.getState().addPaneForTerminal(worktreeId, terminal.id, terminal.title)
  },

  createTerminal: async (worktreeId: string, input: CreateTerminalInput = {}) => {
    set({ loading: true, error: null })
    try {
      const terminal = await terminalsApi.createTerminal(worktreeId, input)
      set((state) => ({
        terminals: [...state.terminals, terminal],
        loading: false,
      }))
      return terminal
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
      throw error
    }
  },

  closeTerminal: async (terminalId: string) => {
    try {
      await terminalsApi.deleteTerminal(terminalId)
      set((state) => ({
        terminals: state.terminals.filter((t) => t.id !== terminalId),
      }))

      const terminal = get().terminals.find((t) => t.id === terminalId)
      if (terminal) {
        useLayoutStore.getState().removePane(terminal.worktreeId, terminalId)
      }
    } catch (error) {
      set({ error: (error as Error).message })
      throw error
    }
  },

  renameTerminal: async (terminalId: string, title: string) => {
    try {
      const terminal = await terminalsApi.updateTerminal(terminalId, { title })
      set((state) => ({
        terminals: state.terminals.map((t) => (t.id === terminalId ? terminal : t)),
      }))
      useLayoutStore.getState().setTerminalTitle(terminalId, title)
    } catch (error) {
      set({ error: (error as Error).message })
      throw error
    }
  },

  restartTerminal: async (terminalId: string) => {
    set({ loading: true, error: null })
    try {
      const terminal = await terminalsApi.restartTerminal(terminalId)
      set((state) => ({
        terminals: state.terminals.map((t) => (t.id === terminalId ? terminal : t)),
        loading: false,
      }))
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
      throw error
    }
  },

  setActiveWorktree: (worktreeId: string | null) => {
    set({ activeWorktreeId: worktreeId })
    useLayoutStore.getState().setActiveWorktree(worktreeId)
    if (worktreeId) {
      localStorage.setItem('vibetree.activeWorktreeId', worktreeId)
    } else {
      localStorage.removeItem('vibetree.activeWorktreeId')
    }
  },
}))
