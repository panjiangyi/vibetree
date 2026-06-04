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

  return (
    <div className="app-root">
      <Header />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="hidden md:flex">
          <Sidebar />
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
