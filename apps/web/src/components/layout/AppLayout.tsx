import { useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Header } from './Header.js'
import { Sidebar } from '../sidebar/Sidebar.js'
import { WorktreeTabs } from '../terminal/WorktreeTabs.js'
import { TerminalGrid } from '../terminal/TerminalGrid.js'
import { AddProjectDialog } from '../dialogs/AddProjectDialog.js'
import { CreateWorktreeDialog } from '../dialogs/CreateWorktreeDialog.js'
import { EditWorktreeAliasDialog } from '../dialogs/EditWorktreeAliasDialog.js'
import { RemoveWorktreeDialog } from '../dialogs/RemoveWorktreeDialog.js'
import { SettingsDialog } from '../dialogs/SettingsDialog.js'
import { ProjectSettingsDialog } from '../dialogs/ProjectSettingsDialog.js'
import { useUiStore } from '../../stores/ui.store.js'

export function AppLayout() {
  const activeDialog = useUiStore((s) => s.activeDialog)
  const isMobileSidebarOpen = useUiStore((s) => s.isMobileSidebarOpen)
  const closeMobileSidebar = useUiStore((s) => s.closeMobileSidebar)
  const sidebarWidth = useUiStore((s) => s.sidebarWidth)
  const setSidebarWidth = useUiStore((s) => s.setSidebarWidth)
  const isDesktopSidebarCollapsed = useUiStore((s) => s.isDesktopSidebarCollapsed)
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null)

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current
      if (!dragState) return

      const nextWidth = dragState.startWidth + (event.clientX - dragState.startX)
      const clampedWidth = Math.min(Math.max(nextWidth, 220), 520)
      setSidebarWidth(clampedWidth)
    }

    const handlePointerUp = () => {
      dragStateRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [setSidebarWidth])

  const handleSidebarResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragStateRef.current = {
      startX: event.clientX,
      startWidth: sidebarWidth,
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  return (
    <div className="app-root">
      <Header />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div
          className="hidden md:flex relative shrink-0 min-h-0"
          style={{ width: isDesktopSidebarCollapsed ? 52 : sidebarWidth }}
        >
          <Sidebar collapsed={isDesktopSidebarCollapsed} />
          {!isDesktopSidebarCollapsed && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
              className="absolute top-0 right-0 h-full w-2 cursor-col-resize"
              onPointerDown={handleSidebarResizeStart}
            />
          )}
        </div>
        <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
          <WorktreeTabs />
          <TerminalGrid />
        </main>
      </div>

      {isMobileSidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close projects menu"
            className="absolute inset-0 bg-black/50"
            onClick={closeMobileSidebar}
          />
          <div className="relative h-full w-[min(88vw,22rem)] shadow-2xl">
            <Sidebar mobile onWorktreeSelected={closeMobileSidebar} />
          </div>
        </div>
      )}

      {activeDialog === 'addProject' && <AddProjectDialog />}
      {activeDialog === 'createWorktree' && <CreateWorktreeDialog />}
      {activeDialog === 'editWorktreeAlias' && <EditWorktreeAliasDialog />}
      {activeDialog === 'removeWorktree' && <RemoveWorktreeDialog />}
      {activeDialog === 'settings' && <SettingsDialog />}
      {activeDialog === 'projectSettings' && <ProjectSettingsDialog />}
    </div>
  )
}
