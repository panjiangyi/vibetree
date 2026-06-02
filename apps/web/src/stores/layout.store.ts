import { create } from 'zustand'
import type { LayoutItem } from 'react-grid-layout'

const STORAGE_KEY = 'vibetree.gridLayouts'

function loadLayouts(): Record<string, LayoutItem[]> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

function saveLayouts(layouts: Record<string, LayoutItem[]>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts))
}

function findNextPosition(existingLayout: LayoutItem[]): { x: number; y: number } {
  if (existingLayout.length === 0) return { x: 0, y: 0 }

  let maxY = 0
  for (const item of existingLayout) {
    const bottom = item.y + item.h
    if (bottom > maxY) maxY = bottom
  }

  return { x: 0, y: maxY }
}

type LayoutStore = {
  activeWorktreeId: string | null
  layoutsByWorktreeId: Record<string, LayoutItem[]>
  terminalIdToTitle: Record<string, string>

  setActiveWorktree: (worktreeId: string | null) => void
  getCurrentLayout: () => LayoutItem[]
  setLayoutForWorktree: (worktreeId: string, layout: LayoutItem[]) => void
  addPaneForTerminal: (worktreeId: string, terminalId: string, title: string) => void
  removePane: (worktreeId: string, terminalId: string) => void
  setTerminalTitle: (terminalId: string, title: string) => void
}

export const useLayoutStore = create<LayoutStore>((set, get) => ({
  activeWorktreeId: localStorage.getItem('vibetree.activeWorktreeId'),
  layoutsByWorktreeId: loadLayouts(),
  terminalIdToTitle: {},

  setActiveWorktree: (worktreeId) => {
    set({ activeWorktreeId: worktreeId })
    if (worktreeId) {
      localStorage.setItem('vibetree.activeWorktreeId', worktreeId)
    } else {
      localStorage.removeItem('vibetree.activeWorktreeId')
    }
  },

  getCurrentLayout: () => {
    const { activeWorktreeId, layoutsByWorktreeId } = get()
    if (!activeWorktreeId) return []
    return layoutsByWorktreeId[activeWorktreeId] ?? []
  },

  setLayoutForWorktree: (worktreeId, layout) => {
    set((state) => {
      const newLayouts = { ...state.layoutsByWorktreeId, [worktreeId]: layout }
      saveLayouts(newLayouts)
      return { layoutsByWorktreeId: newLayouts }
    })
  },

  addPaneForTerminal: (worktreeId, terminalId, title) => {
    const { layoutsByWorktreeId, terminalIdToTitle } = get()
    const currentLayout = layoutsByWorktreeId[worktreeId] ?? []
    const newTitleMap = { ...terminalIdToTitle, [terminalId]: title }

    const exists = currentLayout.some((item) => item.i === terminalId)
    if (exists) {
      set({ terminalIdToTitle: newTitleMap })
      return
    }

    const pos = findNextPosition(currentLayout)
    const newItem: LayoutItem = {
      i: terminalId,
      x: pos.x,
      y: pos.y,
      w: 6,
      h: 6,
      minW: 3,
      minH: 3,
    }

    const newLayout = [...currentLayout, newItem]
    const newLayouts = { ...layoutsByWorktreeId, [worktreeId]: newLayout }
    saveLayouts(newLayouts)
    set({ layoutsByWorktreeId: newLayouts, terminalIdToTitle: newTitleMap })
  },

  removePane: (worktreeId, terminalId) => {
    const { layoutsByWorktreeId } = get()
    const currentLayout = layoutsByWorktreeId[worktreeId]
    if (!currentLayout) return

    const newLayout = currentLayout.filter((item) => item.i !== terminalId)
    const newLayouts = { ...layoutsByWorktreeId }
    if (newLayout.length > 0) {
      newLayouts[worktreeId] = newLayout
    } else {
      delete newLayouts[worktreeId]
    }
    saveLayouts(newLayouts)
    set({ layoutsByWorktreeId: newLayouts })
  },

  setTerminalTitle: (terminalId, title) => {
    set((state) => ({
      terminalIdToTitle: { ...state.terminalIdToTitle, [terminalId]: title },
    }))
  },
}))
