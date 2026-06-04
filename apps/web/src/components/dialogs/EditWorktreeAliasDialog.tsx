import { useState } from 'react'
import { X } from 'lucide-react'
import type { Worktree } from '@vibetree/shared'
import { useProjectStore } from '../../stores/project.store.js'
import { useUiStore } from '../../stores/ui.store.js'

export function EditWorktreeAliasDialog() {
  const closeDialog = useUiStore((s) => s.closeDialog)
  const activeDialogData = useUiStore((s) => s.activeDialogData)
  const updateWorktreeAlias = useProjectStore((s) => s.updateWorktreeAlias)

  const worktree = activeDialogData?.worktree as Worktree | undefined
  const [alias, setAlias] = useState(worktree?.displayName ?? '')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (!worktree) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await updateWorktreeAlias(worktree.id, { displayName: alias.trim() || null })
      closeDialog()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-dialog-overlay">
      <div className="app-dialog w-[420px]">
        <div className="app-dialog-header">
          <h2 className="text-lg font-medium">Worktree Alias</h2>
          <button onClick={closeDialog} className="app-icon-button">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Alias Name <span className="app-subtle">(optional)</span>
            </label>
            <input
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder={worktree.branch || worktree.name}
              className="app-input"
              autoFocus
            />
            {worktree.branch && (
              <p className="text-xs app-subtle mt-1">
                Branch: <span className="app-muted">{worktree.branch}</span>
              </p>
            )}
          </div>

          {error && (
            <div className="text-sm app-danger app-soft-danger px-3 py-2 rounded">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeDialog}
              className="app-button-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`app-button-primary ${loading ? 'app-disabled' : ''}`}
            >
              {loading ? 'Saving...' : 'Save Alias'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
