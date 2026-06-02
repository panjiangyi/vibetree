import { Header } from './Header.js'
import { Sidebar } from '../sidebar/Sidebar.js'
import { TerminalTabs } from '../terminal/TerminalTabs.js'
import { TerminalPane } from '../terminal/TerminalPane.js'
import { AddProjectDialog } from '../dialogs/AddProjectDialog.js'
import { CreateWorktreeDialog } from '../dialogs/CreateWorktreeDialog.js'
import { RemoveWorktreeDialog } from '../dialogs/RemoveWorktreeDialog.js'
import { SettingsDialog } from '../dialogs/SettingsDialog.js'
import { useUiStore } from '../../stores/ui.store.js'
import { useTerminalStore } from '../../stores/terminal.store.js'

export function AppLayout() {
  const activeDialog = useUiStore((s) => s.activeDialog)
  const activeTerminalId = useTerminalStore((s) => s.activeTerminalId)

  return (
    <div className="h-screen w-screen bg-neutral-950 text-neutral-100 flex flex-col">
      <Header />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <TerminalTabs />
          {activeTerminalId ? (
            <TerminalPane terminalId={activeTerminalId} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-neutral-500">
              <div className="text-center">
                <p className="text-lg mb-2">No terminal opened</p>
                <p className="text-sm">Select a worktree from the left sidebar to open a terminal.</p>
              </div>
            </div>
          )}
        </main>
      </div>

      {activeDialog === 'addProject' && <AddProjectDialog />}
      {activeDialog === 'createWorktree' && <CreateWorktreeDialog />}
      {activeDialog === 'removeWorktree' && <RemoveWorktreeDialog />}
      {activeDialog === 'settings' && <SettingsDialog />}
    </div>
  )
}
