import { Header } from './Header.js'
import { Sidebar } from '../sidebar/Sidebar.js'
import { TerminalMosaic } from '../terminal/TerminalMosaic.js'
import { AddProjectDialog } from '../dialogs/AddProjectDialog.js'
import { CreateWorktreeDialog } from '../dialogs/CreateWorktreeDialog.js'
import { RemoveWorktreeDialog } from '../dialogs/RemoveWorktreeDialog.js'
import { SettingsDialog } from '../dialogs/SettingsDialog.js'
import { ProjectSettingsDialog } from '../dialogs/ProjectSettingsDialog.js'
import { useUiStore } from '../../stores/ui.store.js'

export function AppLayout() {
  const activeDialog = useUiStore((s) => s.activeDialog)

  return (
    <div className="h-screen w-screen bg-neutral-950 text-neutral-100 flex flex-col">
      <Header />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <TerminalMosaic />
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
