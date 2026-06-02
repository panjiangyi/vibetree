import { create } from 'zustand'

type DialogType = 'addProject' | 'createWorktree' | 'removeWorktree' | 'settings' | null

type UiStore = {
  activeDialog: DialogType
  activeDialogData: Record<string, unknown> | null
  expandedProjectIds: Set<string>
  sidebarWidth: number

  openDialog: (dialog: DialogType, data?: Record<string, unknown>) => void
  closeDialog: () => void
  toggleProjectExpanded: (projectId: string) => void
  setSidebarWidth: (width: number) => void
}

export const useUiStore = create<UiStore>((set) => ({
  activeDialog: null,
  activeDialogData: null,
  expandedProjectIds: new Set(),
  sidebarWidth: 280,

  openDialog: (dialog, data = null) => {
    set({ activeDialog: dialog, activeDialogData: data })
  },

  closeDialog: () => {
    set({ activeDialog: null, activeDialogData: null })
  },

  toggleProjectExpanded: (projectId: string) => {
    set((state) => {
      const expanded = new Set(state.expandedProjectIds)
      if (expanded.has(projectId)) {
        expanded.delete(projectId)
      } else {
        expanded.add(projectId)
      }
      return { expandedProjectIds: expanded }
    })
  },

  setSidebarWidth: (width: number) => {
    set({ sidebarWidth: width })
  },
}))
