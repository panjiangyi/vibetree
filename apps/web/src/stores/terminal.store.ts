import { create } from 'zustand'
import type { TerminalSession, CreateTerminalInput } from '@vibetree/shared'
import * as terminalsApi from '../api/terminals.api.js'
import { useLayoutStore } from './layout.store.js'

type TerminalStore = {
  terminals: TerminalSession[]
  activeTerminalId: string | null
  loading: boolean
  error: string | null

  loadTerminals: () => Promise<void>
  openTerminalForWorktree: (worktreeId: string) => Promise<void>
  createTerminal: (worktreeId: string, input?: CreateTerminalInput) => Promise<TerminalSession>
  closeTerminal: (terminalId: string) => Promise<void>
  renameTerminal: (terminalId: string, title: string) => Promise<void>
  restartTerminal: (terminalId: string) => Promise<void>
  setActiveTerminal: (terminalId: string | null) => void
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  terminals: [],
  activeTerminalId: localStorage.getItem('vibetree.activeTerminalId'),
  loading: false,
  error: null,

  loadTerminals: async () => {
    set({ loading: true, error: null })
    try {
      const terminals = await terminalsApi.listTerminals()
      set({ terminals, loading: false })

      // Validate active terminal still exists
      const { activeTerminalId } = get()
      if (activeTerminalId && !terminals.some((t) => t.id === activeTerminalId)) {
        const firstTerminal = terminals[0]
        set({ activeTerminalId: firstTerminal?.id ?? null })
        if (firstTerminal) {
          localStorage.setItem('vibetree.activeTerminalId', firstTerminal.id)
        } else {
          localStorage.removeItem('vibetree.activeTerminalId')
        }
      }
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  openTerminalForWorktree: async (worktreeId: string) => {
    const { terminals } = get()

    // Find running terminal for this worktree
    const running = terminals
      .filter((t) => t.worktreeId === worktreeId && t.status === 'running')
      .sort((a, b) => (b.lastActiveAt ?? '').localeCompare(a.lastActiveAt ?? ''))

    if (running[0]) {
      get().setActiveTerminal(running[0].id)
      useLayoutStore.getState().addPaneForTerminal(running[0].id, running[0].title)
      return
    }

    // Create new terminal
    const terminal = await get().createTerminal(worktreeId)
    get().setActiveTerminal(terminal.id)
    useLayoutStore.getState().addPaneForTerminal(terminal.id, terminal.title)
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
      set((state) => {
        const terminals = state.terminals.filter((t) => t.id !== terminalId)
        let activeTerminalId = state.activeTerminalId

        if (activeTerminalId === terminalId) {
          const closedIndex = state.terminals.findIndex((t) => t.id === terminalId)
          const nextTerminal = terminals[closedIndex] || terminals[closedIndex - 1] || terminals[0]
          activeTerminalId = nextTerminal?.id ?? null
          if (activeTerminalId) {
            localStorage.setItem('vibetree.activeTerminalId', activeTerminalId)
          } else {
            localStorage.removeItem('vibetree.activeTerminalId')
          }
        }

        return { terminals, activeTerminalId }
      })

      useLayoutStore.getState().removePane(terminalId)
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
        activeTerminalId: terminalId,
        loading: false,
      }))
      localStorage.setItem('vibetree.activeTerminalId', terminalId)
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
      throw error
    }
  },

  setActiveTerminal: (terminalId: string | null) => {
    set({ activeTerminalId: terminalId })
    if (terminalId) {
      localStorage.setItem('vibetree.activeTerminalId', terminalId)
    } else {
      localStorage.removeItem('vibetree.activeTerminalId')
    }
  },
}))
