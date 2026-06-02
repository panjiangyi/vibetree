import { useState } from 'react'
import { X, GitBranch } from 'lucide-react'
import { useUiStore } from '../../stores/ui.store.js'
import { useProjectStore } from '../../stores/project.store.js'

export function CreateWorktreeDialog() {
  const closeDialog = useUiStore((s) => s.closeDialog)
  const activeDialogData = useUiStore((s) => s.activeDialogData)
  const createWorktree = useProjectStore((s) => s.createWorktree)

  const projectId = activeDialogData?.projectId as string

  const [branch, setBranch] = useState('')
  const [baseRef, setBaseRef] = useState('main')
  const [path, setPath] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await createWorktree(projectId, {
        branch: branch.trim(),
        baseRef: baseRef.trim(),
        path: path.trim(),
      })
      closeDialog()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-neutral-900 rounded-lg w-[480px] shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-neutral-800">
          <h2 className="text-lg font-medium">Create Worktree</h2>
          <button onClick={closeDialog} className="p-1 hover:bg-neutral-800 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Branch Name
            </label>
            <input
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="feature-login"
              className="w-full px-3 py-2 bg-neutral-800 rounded border border-neutral-700 focus:border-blue-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              Base Ref
            </label>
            <input
              type="text"
              value={baseRef}
              onChange={(e) => setBaseRef(e.target.value)}
              placeholder="main"
              className="w-full px-3 py-2 bg-neutral-800 rounded border border-neutral-700 focus:border-blue-500 focus:outline-none"
              required
            />
            <p className="text-xs text-neutral-500 mt-1">
              The branch or commit to create the new worktree from
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              Path
            </label>
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/path/to/worktree"
              className="w-full px-3 py-2 bg-neutral-800 rounded border border-neutral-700 focus:border-blue-500 focus:outline-none"
              required
            />
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-400/10 px-3 py-2 rounded">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeDialog}
              className="px-4 py-2 text-sm bg-neutral-800 hover:bg-neutral-700 rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !branch.trim() || !baseRef.trim() || !path.trim()}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Worktree'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
