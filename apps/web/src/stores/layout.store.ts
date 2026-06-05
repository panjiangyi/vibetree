import { create } from 'zustand'
import type { LayoutItem } from 'react-grid-layout'
import { getCompactor } from 'react-grid-layout/core'
import type { TerminalSession } from '@vibetree/shared'

const STORAGE_KEY = 'vibetree.gridLayouts.byScope.v1'
const LEGACY_STORAGE_KEY = 'vibetree.gridLayouts'
const ACTIVE_SCOPE_KEY = 'vibetree.activeScopeId'
const LEGACY_ACTIVE_SCOPE_KEY = 'vibetree.activeWorktreeId'
const MIGRATION_KEY = 'vibetree.gridLayouts.tiled.v1'
const STORAGE_MIGRATION_KEY = 'vibetree.gridLayouts.byScope.migrated.v1'

export const GRID_COLS = 12
export const GRID_ROWS = 12
const layoutCompactor = getCompactor('vertical')

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

function normalizeLayout(layout: readonly LayoutItem[]): LayoutItem[] {
  const withDefaults = layout.map((item) => ({
    ...item,
    x: Math.max(0, Math.min(item.x, GRID_COLS - item.w)),
    y: Math.max(0, item.y),
    minW: item.minW ?? 2,
    minH: item.minH ?? 2,
  }))

  return layoutCompactor.compact(withDefaults, GRID_COLS).map((item) => ({ ...item }))
}

function loadLayouts(): Record<string, LayoutItem[]> {
  let layouts: Record<string, LayoutItem[]> = {}
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      layouts = JSON.parse(stored)
    } else if (!localStorage.getItem(STORAGE_MIGRATION_KEY)) {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
      layouts = legacy ? JSON.parse(legacy) : {}
      localStorage.setItem(STORAGE_MIGRATION_KEY, '1')
      saveLayouts(layouts)
    }
  } catch {
    return {}
  }

  if (!localStorage.getItem(MIGRATION_KEY)) {
    for (const scopeId of Object.keys(layouts)) {
      layouts[scopeId] = tileLayout(orderedIds(layouts[scopeId]))
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

function loadActiveScopeId(): string | null {
  return localStorage.getItem(ACTIVE_SCOPE_KEY) ?? localStorage.getItem(LEGACY_ACTIVE_SCOPE_KEY)
}

function saveLayouts(layouts: Record<string, LayoutItem[]>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts))
}

type LayoutStore = {
  activeScopeId: string | null
  layoutsByScopeId: Record<string, LayoutItem[]>
  terminalIdToTitle: Record<string, string>

  setActiveScope: (scopeId: string | null) => void
  getCurrentLayout: () => LayoutItem[]
  setLayoutForScope: (scopeId: string, layout: LayoutItem[]) => void
  addPaneForTerminal: (scopeId: string, terminalId: string, title: string) => void
  removePane: (scopeId: string, terminalId: string) => void
  setTerminalTitle: (terminalId: string, title: string) => void
  reconcileWithTerminals: (terminals: TerminalSession[]) => void
}

export const useLayoutStore = create<LayoutStore>((set, get) => ({
  activeScopeId: loadActiveScopeId(),
  layoutsByScopeId: loadLayouts(),
  terminalIdToTitle: {},

  setActiveScope: (scopeId) => {
    set({ activeScopeId: scopeId })
    if (scopeId) {
      localStorage.setItem(ACTIVE_SCOPE_KEY, scopeId)
    } else {
      localStorage.removeItem(ACTIVE_SCOPE_KEY)
    }
  },

  getCurrentLayout: () => {
    const { activeScopeId, layoutsByScopeId } = get()
    if (!activeScopeId) return []
    return layoutsByScopeId[activeScopeId] ?? []
  },

  setLayoutForScope: (scopeId, layout) => {
    set((state) => {
      const normalized = normalizeLayout(layout)
      const currentLayout = state.layoutsByScopeId[scopeId] ?? []
      if (layoutsEqual(currentLayout, normalized)) {
        return state
      }
      const newLayouts = { ...state.layoutsByScopeId, [scopeId]: normalized }
      saveLayouts(newLayouts)
      return { layoutsByScopeId: newLayouts }
    })
  },

  addPaneForTerminal: (scopeId, terminalId, title) => {
    const { layoutsByScopeId, terminalIdToTitle } = get()
    const currentLayout = layoutsByScopeId[scopeId] ?? []
    const newTitleMap = { ...terminalIdToTitle, [terminalId]: title }

    const exists = currentLayout.some((item) => item.i === terminalId)
    if (exists) {
      set({ terminalIdToTitle: newTitleMap })
      return
    }

    const newLayout = tileLayout([...orderedIds(currentLayout), terminalId])
    const newLayouts = { ...layoutsByScopeId, [scopeId]: newLayout }
    saveLayouts(newLayouts)
    set({ layoutsByScopeId: newLayouts, terminalIdToTitle: newTitleMap })
  },

  removePane: (scopeId, terminalId) => {
    const { layoutsByScopeId } = get()
    const currentLayout = layoutsByScopeId[scopeId]
    if (!currentLayout) return

    const remaining = currentLayout.filter((item) => item.i !== terminalId)
    const newLayouts = { ...layoutsByScopeId }
    if (remaining.length > 0) {
      newLayouts[scopeId] = tileLayout(orderedIds(remaining))
    } else {
      delete newLayouts[scopeId]
    }
    saveLayouts(newLayouts)
    set({ layoutsByScopeId: newLayouts })
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

      for (const [scopeId, layout] of Object.entries(state.layoutsByScopeId)) {
        const filtered = layout.filter((item) => terminalIds.has(item.i))
        if (filtered.length !== layout.length) {
          changed = true
        }

        if (filtered.length === 0) {
          continue
        }

        const normalized = normalizeLayout(filtered)
        if (!layoutsEqual(filtered, normalized)) {
          changed = true
        }
        nextLayouts[scopeId] = normalized
      }

      const activeScopeId =
        state.activeScopeId && nextLayouts[state.activeScopeId]
          ? state.activeScopeId
          : Object.keys(nextLayouts)[0] ?? null

      if (
        !changed &&
        activeScopeId === state.activeScopeId &&
        Object.keys(titleMap).length === Object.keys(state.terminalIdToTitle).length &&
        Object.entries(titleMap).every(([id, title]) => state.terminalIdToTitle[id] === title)
      ) {
        return state
      }

      saveLayouts(nextLayouts)
      if (activeScopeId) {
        localStorage.setItem(ACTIVE_SCOPE_KEY, activeScopeId)
      } else {
        localStorage.removeItem(ACTIVE_SCOPE_KEY)
      }

      return {
        activeScopeId,
        layoutsByScopeId: nextLayouts,
        terminalIdToTitle: titleMap,
      }
    })
  },
}))
