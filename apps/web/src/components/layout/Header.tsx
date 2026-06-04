import { Terminal, Plus, RefreshCw, Settings } from 'lucide-react'
import { useUiStore } from '../../stores/ui.store.js'
import { useTerminalStore } from '../../stores/terminal.store.js'
import { useProjectStore } from '../../stores/project.store.js'

export function Header() {
  const openDialog = useUiStore((s) => s.openDialog)
  const terminals = useTerminalStore((s) => s.terminals)
  const projects = useProjectStore((s) => s.projects)
  const refreshProject = useProjectStore((s) => s.refreshProject)

  const runningCount = terminals.filter((t) => t.status === 'running').length

  const handleRefreshAll = async () => {
    for (const project of projects) {
      await refreshProject(project.id)
    }
  }

  return (
    <header className="h-12 border-b app-panel flex items-center px-4 gap-4">
      <div className="flex items-center gap-2 font-semibold">
        <Terminal className="w-5 h-5 app-success" />
        <span>VibeTree</span>
      </div>

      <button
        onClick={() => openDialog('addProject')}
        className="app-button-secondary flex items-center gap-1 py-1.5"
      >
        <Plus className="w-4 h-4" />
        Add Project
      </button>

      <button
        onClick={handleRefreshAll}
        className="app-button-secondary flex items-center gap-1 py-1.5"
      >
        <RefreshCw className="w-4 h-4" />
        Refresh
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-2 text-sm app-muted">
        <Terminal className="w-4 h-4" />
        <span>Running: {runningCount}</span>
      </div>

      <button
        onClick={() => openDialog('settings')}
        className="app-icon-button p-2"
      >
        <Settings className="w-4 h-4" />
      </button>
    </header>
  )
}
