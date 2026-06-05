import { create } from 'zustand'

type DialogType =
  | 'addProject'
  | 'createWorktree'
  | 'removeWorktree'
  | 'editWorktreeAlias'
  | 'settings'
  | 'projectSettings'
  | null

type UiStore = {
  activeDialog: DialogType
  activeDialogData: Record<string, unknown> | undefined
  expandedProjectIds: Set<string>
  isMobileSidebarOpen: boolean
  isDesktopSidebarCollapsed: boolean
  sidebarWidth: number

  openDialog: (dialog: DialogType, data?: Record<string, unknown>) => void
  closeDialog: () => void
  openMobileSidebar: () => void
  closeMobileSidebar: () => void
  toggleMobileSidebar: () => void
  toggleDesktopSidebar: () => void
  setDesktopSidebarCollapsed: (collapsed: boolean) => void
  toggleProjectExpanded: (projectId: string) => void
  setSidebarWidth: (width: number) => void
}

export const useUiStore = create<UiStore>((set) => ({
  activeDialog: null,
  activeDialogData: undefined,
  expandedProjectIds: new Set(),
  isMobileSidebarOpen: false,
  isDesktopSidebarCollapsed: false,
  sidebarWidth: 280,

  openDialog: (dialog, data) => {
    set({ activeDialog: dialog, activeDialogData: data })
  },

  closeDialog: () => {
    set({ activeDialog: null, activeDialogData: undefined })
  },

  openMobileSidebar: () => {
    set({ isMobileSidebarOpen: true })
  },

  closeMobileSidebar: () => {
    set({ isMobileSidebarOpen: false })
  },

  toggleMobileSidebar: () => {
    set((state) => ({ isMobileSidebarOpen: !state.isMobileSidebarOpen }))
  },

  toggleDesktopSidebar: () => {
    set((state) => ({ isDesktopSidebarCollapsed: !state.isDesktopSidebarCollapsed }))
  },

  setDesktopSidebarCollapsed: (collapsed) => {
    set({ isDesktopSidebarCollapsed: collapsed })
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
