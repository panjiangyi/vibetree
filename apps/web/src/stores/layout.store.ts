import { create } from 'zustand'
import type { LayoutItem } from 'react-grid-layout'
import type { TerminalSession } from '@vibetree/shared'

const STORAGE_KEY = 'vibetree.gridLayouts'
const MIGRATION_KEY = 'vibetree.gridLayouts.tiled.v1'

// Fixed grid the panes are tiled into. The TerminalGrid sizes a row so that
// exactly GRID_ROWS rows fill the available height, which keeps the grid
// flush with the workspace area (no downward overflow / scrolling).
export const GRID_COLS = 12
export const GRID_ROWS = 12

/**
 * Arrange `ids` into a balanced grid of tiles that completely fills the
 * GRID_COLS x GRID_ROWS area with no gaps or overlaps.
 */
function tileLayout(ids: string[]): LayoutItem[] {
  const n = ids.length
  if (n === 0) return []

  const tileCols = Math.ceil(Math.sqrt(n))
  const tileRows = Math.ceil(n / tileCols)

  const items: LayoutItem[] = []
  for (let idx = 0; idx < n; idx++) {
    const rowIndex = Math.floor(idx / tileCols)
    const colIndex = idx % tileCols
    const isLastRow = rowIndex === tileRows - 1
    const tilesInRow = isLastRow ? n - rowIndex * tileCols : tileCols

    const x = Math.round((colIndex * GRID_COLS) / tilesInRow)
    const xEnd = Math.round(((colIndex + 1) * GRID_COLS) / tilesInRow)
    const y = Math.round((rowIndex * GRID_ROWS) / tileRows)
    const yEnd = Math.round(((rowIndex + 1) * GRID_ROWS) / tileRows)

    items.push({
      i: ids[idx],
      x,
      y,
      w: Math.max(1, xEnd - x),
      h: Math.max(1, yEnd - y),
      minW: 2,
      minH: 2,
    })
  }
  return items
}

/** Order pane ids roughly top-to-bottom, left-to-right by their position. */
function orderedIds(layout: LayoutItem[]): string[] {
  return [...layout]
    .sort((a, b) => (a.y - b.y) || (a.x - b.x))
    .map((item) => item.i)
}

function layoutsEqual(a: readonly LayoutItem[], b: readonly LayoutItem[]): boolean {
  if (a.length !== b.length) return false

  for (let index = 0; index < a.length; index++) {
    const left = a[index]
    const right = b[index]
    if (
      left.i !== right.i ||
      left.x !== right.x ||
      left.y !== right.y ||
      left.w !== right.w ||
      left.h !== right.h ||
      left.minW !== right.minW ||
      left.minH !== right.minH
    ) {
      return false
    }
  }

  return true
}

function loadLayouts(): Record<string, LayoutItem[]> {
  let layouts: Record<string, LayoutItem[]> = {}
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    layouts = stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }

  // One-time migration: older builds stacked panes vertically (x:0, growing y)
  // which overflowed the workspace. Re-tile any existing layouts once so users
  // immediately get the filled grid. Manual adjustments made afterwards persist.
  if (!localStorage.getItem(MIGRATION_KEY)) {
    for (const worktreeId of Object.keys(layouts)) {
      layouts[worktreeId] = tileLayout(orderedIds(layouts[worktreeId]))
    }
    saveLayouts(layouts)
    try {
      localStorage.setItem(MIGRATION_KEY, '1')
    } catch {
      // ignore storage failures
    }
  }

  return layouts
}

function saveLayouts(layouts: Record<string, LayoutItem[]>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts))
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
  reconcileWithTerminals: (terminals: TerminalSession[]) => void
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
      const currentLayout = state.layoutsByWorktreeId[worktreeId] ?? []
      if (layoutsEqual(currentLayout, layout)) {
        return state
      }
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

    // Re-tile all panes (existing + new) so they fill the workspace evenly.
    const newLayout = tileLayout([...orderedIds(currentLayout), terminalId])
    const newLayouts = { ...layoutsByWorktreeId, [worktreeId]: newLayout }
    saveLayouts(newLayouts)
    set({ layoutsByWorktreeId: newLayouts, terminalIdToTitle: newTitleMap })
  },

  removePane: (worktreeId, terminalId) => {
    const { layoutsByWorktreeId } = get()
    const currentLayout = layoutsByWorktreeId[worktreeId]
    if (!currentLayout) return

    const remaining = currentLayout.filter((item) => item.i !== terminalId)
    const newLayouts = { ...layoutsByWorktreeId }
    if (remaining.length > 0) {
      // Re-tile the remaining panes so they expand to fill the freed space.
      newLayouts[worktreeId] = tileLayout(orderedIds(remaining))
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

  reconcileWithTerminals: (terminals) => {
    const terminalIds = new Set(terminals.map((terminal) => terminal.id))
    const titleMap = Object.fromEntries(
      terminals.map((terminal) => [terminal.id, terminal.title])
    )

    set((state) => {
      let changed = false
      const nextLayouts: Record<string, LayoutItem[]> = {}

      for (const [worktreeId, layout] of Object.entries(state.layoutsByWorktreeId)) {
        const filtered = layout.filter((item) => terminalIds.has(item.i))
        if (filtered.length !== layout.length) {
          changed = true
        }

        if (filtered.length === 0) {
          continue
        }

        const tiled = tileLayout(orderedIds(filtered))
        if (!layoutsEqual(filtered, tiled)) {
          changed = true
        }
        nextLayouts[worktreeId] = tiled
      }

      const activeWorktreeId =
        state.activeWorktreeId && nextLayouts[state.activeWorktreeId]
          ? state.activeWorktreeId
          : Object.keys(nextLayouts)[0] ?? null

      if (
        !changed &&
        activeWorktreeId === state.activeWorktreeId &&
        Object.keys(titleMap).length === Object.keys(state.terminalIdToTitle).length &&
        Object.entries(titleMap).every(([id, title]) => state.terminalIdToTitle[id] === title)
      ) {
        return state
      }

      saveLayouts(nextLayouts)
      if (activeWorktreeId) {
        localStorage.setItem('vibetree.activeWorktreeId', activeWorktreeId)
      } else {
        localStorage.removeItem('vibetree.activeWorktreeId')
      }

      return {
        activeWorktreeId,
        layoutsByWorktreeId: nextLayouts,
        terminalIdToTitle: titleMap,
      }
    })
  },
}))
