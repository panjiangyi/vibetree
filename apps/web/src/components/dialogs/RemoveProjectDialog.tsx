import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import type { Project } from '@vibetree/shared'
import { useProjectStore } from '../../stores/project.store.js'
import { useTerminalStore } from '../../stores/terminal.store.js'
import { useUiStore } from '../../stores/ui.store.js'

export function RemoveProjectDialog() {
  const closeDialog = useUiStore((state) => state.closeDialog)
  const activeDialogData = useUiStore((state) => state.activeDialogData)
  const removeProject = useProjectStore((state) => state.removeProject)
  const terminals = useTerminalStore((state) => state.terminals)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const project = activeDialogData?.project as Project | undefined
  if (!project) return null

  const runningCount = terminals.filter(
    (terminal) => terminal.projectId === project.id && terminal.status === 'running'
  ).length

  const handleRemove = async () => {
    if (runningCount > 0) return

    setLoading(true)
    setError(null)
    try {
      await removeProject(project.id)
      closeDialog()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-dialog-overlay">
      <div className="app-dialog app-dialog-mobile max-w-[420px]">
        <div className="app-dialog-header">
          <h2 className="text-lg font-medium">Remove Project</h2>
          <button onClick={closeDialog} className="app-icon-button" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 app-warning flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">{project.name}</p>
              <p className="text-sm app-muted mt-1 break-all">{project.repoPath}</p>
            </div>
          </div>

          <p className="text-sm app-muted">
            This only removes the project from Vibetree. Its repository, worktrees, branches, and files will remain unchanged.
          </p>

          {runningCount > 0 && (
            <div className="text-sm app-warning app-soft-warning px-3 py-2 rounded">
              Close {runningCount} running terminal{runningCount === 1 ? '' : 's'} before removing this project.
            </div>
          )}

          {error && (
            <div className="text-sm app-danger app-soft-danger px-3 py-2 rounded">
              {error}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button onClick={closeDialog} className="app-button-secondary">Cancel</button>
            <button
              onClick={handleRemove}
              disabled={runningCount > 0 || loading}
              className={`app-button-danger ${runningCount > 0 || loading ? 'app-disabled' : ''}`}
            >
              {loading ? 'Removing...' : 'Remove from Vibetree'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
