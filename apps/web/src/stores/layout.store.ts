import { create } from 'zustand'
import type { MosaicNode, MosaicSplitNode } from 'react-mosaic-component'

const STORAGE_KEY = 'vibetree.mosaicLayouts'

function loadLayouts(): Record<string, MosaicNode<string>> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

function saveLayouts(layouts: Record<string, MosaicNode<string>>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts))
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
  activeWorktreeId: string | null
  layoutsByWorktreeId: Record<string, MosaicNode<string>>
  terminalIdToTitle: Record<string, string>

  setActiveWorktree: (worktreeId: string | null) => void
  getCurrentLayout: () => MosaicNode<string> | null
  setLayoutForWorktree: (worktreeId: string, layout: MosaicNode<string> | null) => void
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
    if (!activeWorktreeId) return null
    return layoutsByWorktreeId[activeWorktreeId] ?? null
  },

  setLayoutForWorktree: (worktreeId, layout) => {
    set((state) => {
      const newLayouts = { ...state.layoutsByWorktreeId }
      if (layout) {
        newLayouts[worktreeId] = layout
      } else {
        delete newLayouts[worktreeId]
      }
      saveLayouts(newLayouts)
      return { layoutsByWorktreeId: newLayouts }
    })
  },

  addPaneForTerminal: (worktreeId, terminalId, title) => {
    const { layoutsByWorktreeId, terminalIdToTitle } = get()
    const newTitleMap = { ...terminalIdToTitle, [terminalId]: title }

    const currentLayout = layoutsByWorktreeId[worktreeId] ?? null

    if (!currentLayout) {
      const newLayouts = { ...layoutsByWorktreeId, [worktreeId]: terminalId }
      saveLayouts(newLayouts)
      set({ layoutsByWorktreeId: newLayouts, terminalIdToTitle: newTitleMap })
      return
    }

    if (typeof currentLayout === 'string') {
      if (currentLayout === terminalId) {
        set({ terminalIdToTitle: newTitleMap })
        return
      }
      const newLayout = createSplitNode([currentLayout, terminalId], [50, 50])
      const newLayouts = { ...layoutsByWorktreeId, [worktreeId]: newLayout }
      saveLayouts(newLayouts)
      set({ layoutsByWorktreeId: newLayouts, terminalIdToTitle: newTitleMap })
      return
    }

    const containsTerminal = JSON.stringify(currentLayout).includes(`"${terminalId}"`)
    if (containsTerminal) {
      set({ terminalIdToTitle: newTitleMap })
      return
    }

    const newLayout = createSplitNode([currentLayout, terminalId], [70, 30])
    const newLayouts = { ...layoutsByWorktreeId, [worktreeId]: newLayout }
    saveLayouts(newLayouts)
    set({ layoutsByWorktreeId: newLayouts, terminalIdToTitle: newTitleMap })
  },

  removePane: (worktreeId, terminalId) => {
    const { layoutsByWorktreeId } = get()
    const currentLayout = layoutsByWorktreeId[worktreeId]
    if (!currentLayout) return

    if (typeof currentLayout === 'string') {
      if (currentLayout === terminalId) {
        const newLayouts = { ...layoutsByWorktreeId }
        delete newLayouts[worktreeId]
        saveLayouts(newLayouts)
        set({ layoutsByWorktreeId: newLayouts })
      }
      return
    }

    const newLayout = removeNodeFromTree(currentLayout, terminalId)
    const newLayouts = { ...layoutsByWorktreeId }
    if (newLayout) {
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
