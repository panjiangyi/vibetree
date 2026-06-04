import { Header } from './Header.js'
import { Sidebar } from '../sidebar/Sidebar.js'
import { WorktreeTabs } from '../terminal/WorktreeTabs.js'
import { TerminalGrid } from '../terminal/TerminalGrid.js'
import { AddProjectDialog } from '../dialogs/AddProjectDialog.js'
import { CreateWorktreeDialog } from '../dialogs/CreateWorktreeDialog.js'
import { RemoveWorktreeDialog } from '../dialogs/RemoveWorktreeDialog.js'
import { SettingsDialog } from '../dialogs/SettingsDialog.js'
import { ProjectSettingsDialog } from '../dialogs/ProjectSettingsDialog.js'
import { useUiStore } from '../../stores/ui.store.js'

export function AppLayout() {
  const activeDialog = useUiStore((s) => s.activeDialog)

  return (
    <div className="app-root">
      <Header />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <WorktreeTabs />
          <TerminalGrid />
        </main>
      </div>

      {activeDialog === 'addProject' && <AddProjectDialog />}
      {activeDialog === 'createWorktree' && <CreateWorktreeDialog />}
      {activeDialog === 'removeWorktree' && <RemoveWorktreeDialog />}
      {activeDialog === 'settings' && <SettingsDialog />}
      {activeDialog === 'projectSettings' && <ProjectSettingsDialog />}
    </div>
  )
}
