import { create } from 'zustand'
import type { MosaicNode, MosaicSplitNode } from 'react-mosaic-component'

const STORAGE_KEY = 'vibetree.mosaicLayout'

function loadLayout(): MosaicNode<string> | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

function saveLayout(layout: MosaicNode<string> | null): void {
  if (layout) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
}

function createSplitNode(children: MosaicNode<string>[], splitPercentages?: number[]): MosaicSplitNode<string> {
  return {
    type: 'split',
    direction: 'row',
    children,
    splitPercentages,
  }
}

type LayoutStore = {
  layout: MosaicNode<string> | null
  terminalIdToTitle: Record<string, string>

  setLayout: (layout: MosaicNode<string> | null) => void
  addPaneForTerminal: (terminalId: string, title: string) => void
  removePane: (terminalId: string) => void
  setTerminalTitle: (terminalId: string, title: string) => void
}

export const useLayoutStore = create<LayoutStore>((set, get) => ({
  layout: loadLayout(),
  terminalIdToTitle: {},

  setLayout: (layout) => {
    saveLayout(layout)
    set({ layout })
  },

  addPaneForTerminal: (terminalId, title) => {
    const { layout, terminalIdToTitle } = get()

    const newTitleMap = { ...terminalIdToTitle, [terminalId]: title }

    if (!layout) {
      set({ layout: terminalId, terminalIdToTitle: newTitleMap })
      saveLayout(terminalId)
      return
    }

    if (typeof layout === 'string') {
      if (layout === terminalId) {
        set({ terminalIdToTitle: newTitleMap })
        return
      }
      const newLayout = createSplitNode([layout, terminalId], [50, 50])
      set({ layout: newLayout, terminalIdToTitle: newTitleMap })
      saveLayout(newLayout)
      return
    }

    const containsTerminal = JSON.stringify(layout).includes(`"${terminalId}"`)
    if (containsTerminal) {
      set({ terminalIdToTitle: newTitleMap })
      return
    }

    const newLayout = createSplitNode([layout, terminalId], [70, 30])
    set({ layout: newLayout, terminalIdToTitle: newTitleMap })
    saveLayout(newLayout)
  },

  removePane: (terminalId) => {
    const { layout } = get()
    if (!layout) return

    if (typeof layout === 'string') {
      if (layout === terminalId) {
        set({ layout: null })
        saveLayout(null)
      }
      return
    }

    const newLayout = removeNodeFromTree(layout, terminalId)
    set({ layout: newLayout })
    saveLayout(newLayout)
  },

  setTerminalTitle: (terminalId, title) => {
    set((state) => ({
      terminalIdToTitle: { ...state.terminalIdToTitle, [terminalId]: title },
    }))
  },
}))

function removeNodeFromTree(
  tree: MosaicNode<string>,
  targetId: string
): MosaicNode<string> | null {
  if (typeof tree === 'string') {
    return tree === targetId ? null : tree
  }

  if (tree.type === 'tabs') {
    const newTabs = tree.tabs.filter((t) => t !== targetId)
    if (newTabs.length === 0) return null
    if (newTabs.length === 1) return newTabs[0]
    return { ...tree, tabs: newTabs }
  }

  const newChildren: MosaicNode<string>[] = []
  for (const child of tree.children) {
    const result = removeNodeFromTree(child, targetId)
    if (result !== null) {
      newChildren.push(result)
    }
  }

  if (newChildren.length === 0) return null
  if (newChildren.length === 1) return newChildren[0]

  return { ...tree, children: newChildren }
}
