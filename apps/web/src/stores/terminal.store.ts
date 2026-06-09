import { create } from 'zustand'
import type {
  TerminalSession,
  CreateTerminalInput,
  OpenDirectoryTerminalInput,
} from '@vibetree/shared'
import * as terminalsApi from '../api/terminals.api.js'
import { useLayoutStore } from './layout.store.js'
import { terminalSocket } from '../ws/terminal-socket.js'

type TerminalStore = {
  terminals: TerminalSession[]
  activeScopeId: string | null
  loading: boolean
  error: string | null

  loadTerminals: () => Promise<void>
  openTerminalForWorktree: (worktreeId: string) => Promise<void>
  openDirectoryTerminal: (input: OpenDirectoryTerminalInput) => Promise<void>
  createNewTerminalForWorktree: (worktreeId: string) => Promise<void>
  createNewTerminalForScope: (scopeId: string) => Promise<void>
  createTerminal: (worktreeId: string, input?: CreateTerminalInput) => Promise<TerminalSession>
  closeTerminal: (terminalId: string) => Promise<void>
  closeScopeTerminals: (scopeId: string) => Promise<void>
  renameTerminal: (terminalId: string, title: string) => Promise<void>
  restartTerminal: (terminalId: string) => Promise<void>
  setActiveScope: (scopeId: string | null) => void
  handleTerminalExit: (terminalId: string, exitCode: number | null) => void
}

function pickFallbackScopeId(terminals: TerminalSession[], removedScopeId: string): string | null {
  const visibleScopeIds = Array.from(new Set(terminals.map((terminal) => terminal.scopeId)))
  const currentIndex = visibleScopeIds.indexOf(removedScopeId)
  return visibleScopeIds[currentIndex + 1] ?? visibleScopeIds[currentIndex - 1] ?? null
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  terminals: [],
  activeScopeId: localStorage.getItem('vibetree.activeScopeId') ?? localStorage.getItem('vibetree.activeWorktreeId'),
  loading: false,
  error: null,

  loadTerminals: async () => {
    set({ loading: true, error: null })
    try {
      const terminals = await terminalsApi.listTerminals()
      useLayoutStore.getState().reconcileWithTerminals(terminals)
      set({ terminals, loading: false })
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  openTerminalForWorktree: async (worktreeId: string) => {
    const { terminals } = get()

    get().setActiveScope(worktreeId)

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

  openDirectoryTerminal: async (input) => {
    set({ loading: true, error: null })
    try {
      const result = await terminalsApi.openDirectoryTerminal(input)
      const { terminal } = result
      set((state) => ({
        terminals: state.terminals.some((item) => item.id === terminal.id)
          ? state.terminals.map((item) => (item.id === terminal.id ? terminal : item))
          : [...state.terminals, terminal],
        loading: false,
      }))
      get().setActiveScope(terminal.scopeId)
      useLayoutStore.getState().addPaneForTerminal(terminal.scopeId, terminal.id, terminal.title)
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
      throw error
    }
  },

  createNewTerminalForWorktree: async (worktreeId: string) => {
    get().setActiveScope(worktreeId)
    const terminal = await get().createTerminal(worktreeId)
    useLayoutStore.getState().addPaneForTerminal(worktreeId, terminal.id, terminal.title)
  },

  createNewTerminalForScope: async (scopeId: string) => {
    const existing = get().terminals.find((terminal) => terminal.scopeId === scopeId)
    if (!existing) {
      throw new Error('Scope not found')
    }

    get().setActiveScope(scopeId)

    let terminal: TerminalSession
    if (existing.scopeType === 'directory') {
      terminal = await terminalsApi.createDirectoryTerminal({ scopeId })
      set((state) => ({
        terminals: state.terminals.some(t => t.id === terminal.id)
          ? state.terminals.map(t => t.id === terminal.id ? terminal : t)
          : [...state.terminals, terminal],
      }))
    } else {
      if (!existing.worktreeId) {
        throw new Error('Worktree not found')
      }
      terminal = await get().createTerminal(existing.worktreeId)
    }

    useLayoutStore.getState().addPaneForTerminal(scopeId, terminal.id, terminal.title)
  },

  createTerminal: async (worktreeId: string, input: CreateTerminalInput = {}) => {
    set({ loading: true, error: null })
    try {
      const terminal = await terminalsApi.createTerminal(worktreeId, input)
      set((state) => ({
        terminals: state.terminals.some(t => t.id === terminal.id)
          ? state.terminals.map(t => t.id === terminal.id ? terminal : t)
          : [...state.terminals, terminal],
        loading: false,
      }))
      return terminal
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
      throw error
    }
  },

  closeTerminal: async (terminalId: string) => {
    const terminal = get().terminals.find((t) => t.id === terminalId)
    const scopeId = terminal?.scopeId ?? get().activeScopeId

    try {
      await terminalsApi.deleteTerminal(terminalId)
    } catch (error) {
      set({ error: (error as Error).message })
    }

    set((state) => ({
      terminals: state.terminals.filter((t) => t.id !== terminalId),
    }))

    if (scopeId) {
      useLayoutStore.getState().removePane(scopeId, terminalId)
      const remaining = get().terminals.filter((item) => item.scopeId === scopeId)
      if (remaining.length === 0 && get().activeScopeId === scopeId) {
        get().setActiveScope(pickFallbackScopeId(get().terminals, scopeId))
      }
    }
  },

  closeScopeTerminals: async (scopeId: string) => {
    const { terminals, activeScopeId } = get()
    const terminalIds = terminals
      .filter((terminal) => terminal.scopeId === scopeId)
      .map((terminal) => terminal.id)

    if (activeScopeId === scopeId) {
      get().setActiveScope(pickFallbackScopeId(terminals, scopeId))
    }

    await Promise.all(terminalIds.map((terminalId) => get().closeTerminal(terminalId)))
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

  setActiveScope: (scopeId: string | null) => {
    set({ activeScopeId: scopeId })
    useLayoutStore.getState().setActiveScope(scopeId)
    if (scopeId) {
      localStorage.setItem('vibetree.activeScopeId', scopeId)
    } else {
      localStorage.removeItem('vibetree.activeScopeId')
    }
  },

  handleTerminalExit: (terminalId, exitCode) => {
    const terminal = get().terminals.find((item) => item.id === terminalId)
    if (!terminal) {
      return
    }

    if (terminal.scopeType === 'directory') {
      set((state) => ({
        terminals: state.terminals.filter((item) => item.id !== terminalId),
      }))
      useLayoutStore.getState().removePane(terminal.scopeId, terminalId)
      const remaining = get().terminals.filter((item) => item.scopeId === terminal.scopeId)
      if (remaining.length === 0 && get().activeScopeId === terminal.scopeId) {
        get().setActiveScope(pickFallbackScopeId(get().terminals, terminal.scopeId))
      }
      return
    }

    set((state) => ({
      terminals: state.terminals.map((item) => item.id === terminalId
        ? { ...item, status: 'exited', exitCode }
        : item),
    }))
  },
}))

terminalSocket.onMessage((message) => {
  switch (message.type) {
    case 'exit':
      useTerminalStore.getState().handleTerminalExit(message.terminalId, message.exitCode)
      break

    case 'terminal-created': {
      const { terminal } = message
      const store = useTerminalStore.getState()
      if (store.terminals.some(t => t.id === terminal.id)) break

      useTerminalStore.setState(state => ({
        terminals: [...state.terminals, terminal],
      }))

      const layoutStore = useLayoutStore.getState()
      if (layoutStore.activeScopeId === terminal.scopeId) {
        layoutStore.addPaneForTerminal(terminal.scopeId, terminal.id, terminal.title)
      }
      break
    }

    case 'terminal-deleted': {
      const { terminalId, scopeId } = message
      const store = useTerminalStore.getState()
      if (!store.terminals.some(t => t.id === terminalId)) break

      useTerminalStore.setState(state => ({
        terminals: state.terminals.filter(t => t.id !== terminalId),
      }))

      useLayoutStore.getState().removePane(scopeId, terminalId)

      const remaining = useTerminalStore.getState().terminals.filter(t => t.scopeId === scopeId)
      if (remaining.length === 0 && useTerminalStore.getState().activeScopeId === scopeId) {
        useTerminalStore.getState().setActiveScope(
          pickFallbackScopeId(useTerminalStore.getState().terminals, scopeId)
        )
      }
      break
    }

    case 'terminal-updated': {
      const { terminal } = message
      useTerminalStore.setState(state => ({
        terminals: state.terminals.map(t => t.id === terminal.id ? terminal : t),
      }))
      useLayoutStore.getState().setTerminalTitle(terminal.id, terminal.title)
      break
    }
  }
})

terminalSocket.onReconnect(() => {
  useTerminalStore.getState().loadTerminals()
})
