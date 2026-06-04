import { useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import type { Worktree } from '@vibetree/shared'
import { useUiStore } from '../../stores/ui.store.js'
import { useProjectStore } from '../../stores/project.store.js'
import { useTerminalStore } from '../../stores/terminal.store.js'

export function RemoveWorktreeDialog() {
  const closeDialog = useUiStore((s) => s.closeDialog)
  const activeDialogData = useUiStore((s) => s.activeDialogData)
  const removeWorktree = useProjectStore((s) => s.removeWorktree)
  const terminals = useTerminalStore((s) => s.terminals)

  const worktree = activeDialogData?.worktree as Worktree | undefined
  if (!worktree) return null

  const runningCount = terminals.filter(
    (t) => t.worktreeId === worktree.id && t.status === 'running'
  ).length

  const isDisabled = worktree.isMain || worktree.isDirty || runningCount > 0
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRemove = async () => {
    if (isDisabled) return

    setLoading(true)
    setError(null)

    try {
      await removeWorktree(worktree.id)
      closeDialog()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  let disabledReason = ''
  if (worktree.isMain) {
    disabledReason = 'Main worktree cannot be removed.'
  } else if (worktree.isDirty) {
    disabledReason = 'Dirty worktree cannot be removed in v1.'
  } else if (runningCount > 0) {
    disabledReason = 'Close running terminals before removing this worktree.'
  }

  return (
    <div className="app-dialog-overlay">
      <div className="app-dialog app-dialog-mobile max-w-[420px]">
        <div className="app-dialog-header">
          <h2 className="text-lg font-medium">Remove Worktree</h2>
          <button onClick={closeDialog} className="app-icon-button">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 app-warning flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">{worktree.name}</p>
              <p className="text-sm app-muted mt-1 break-all">{worktree.path}</p>
            </div>
          </div>

          {isDisabled ? (
            <div className="text-sm app-warning app-soft-warning px-3 py-2 rounded">
              {disabledReason}
            </div>
          ) : (
            <p className="text-sm app-muted">
              This will remove the worktree from Git and delete the directory. This action cannot be undone.
            </p>
          )}

          {error && (
            <div className="text-sm app-danger app-soft-danger px-3 py-2 rounded">
              {error}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button
              onClick={closeDialog}
              className="app-button-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleRemove}
              disabled={isDisabled || loading}
              className={`app-button-danger ${isDisabled || loading ? 'app-disabled' : ''}`}
            >
              {loading ? 'Removing...' : 'Remove'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
