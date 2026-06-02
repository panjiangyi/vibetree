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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-neutral-900 rounded-lg w-[420px] shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-neutral-800">
          <h2 className="text-lg font-medium">Remove Worktree</h2>
          <button onClick={closeDialog} className="p-1 hover:bg-neutral-800 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">{worktree.name}</p>
              <p className="text-sm text-neutral-400 mt-1">{worktree.path}</p>
            </div>
          </div>

          {isDisabled ? (
            <div className="text-sm text-yellow-400 bg-yellow-400/10 px-3 py-2 rounded">
              {disabledReason}
            </div>
          ) : (
            <p className="text-sm text-neutral-400">
              This will remove the worktree from Git and delete the directory. This action cannot be undone.
            </p>
          )}

          {error && (
            <div className="text-sm text-red-400 bg-red-400/10 px-3 py-2 rounded">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={closeDialog}
              className="px-4 py-2 text-sm bg-neutral-800 hover:bg-neutral-700 rounded"
            >
              Cancel
            </button>
            <button
              onClick={handleRemove}
              disabled={isDisabled || loading}
              className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 rounded disabled:opacity-50"
            >
              {loading ? 'Removing...' : 'Remove'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
