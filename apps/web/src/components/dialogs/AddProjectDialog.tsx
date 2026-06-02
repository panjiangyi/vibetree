import { useState } from 'react'
import { X, FolderOpen } from 'lucide-react'
import { useUiStore } from '../../stores/ui.store.js'
import { useProjectStore } from '../../stores/project.store.js'
import { DirectoryPicker } from './DirectoryPicker.js'

export function AddProjectDialog() {
  const closeDialog = useUiStore((s) => s.closeDialog)
  const addProject = useProjectStore((s) => s.addProject)

  const [repoPath, setRepoPath] = useState('')
  const [worktreeBasePath, setWorktreeBasePath] = useState('')
  const [mainBranch, setMainBranch] = useState('')
  const [setupScript, setSetupScript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showDirectoryPicker, setShowDirectoryPicker] = useState(false)
  const [directoryPickerTarget, setDirectoryPickerTarget] = useState<'repo' | 'worktree'>('repo')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await addProject({
        repoPath: repoPath.trim(),
        worktreeBasePath: worktreeBasePath.trim() || undefined,
        mainBranch: mainBranch.trim() || undefined,
        setupScript: setupScript.trim() || undefined,
      })
      closeDialog()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleDirectorySelect = (path: string) => {
    if (directoryPickerTarget === 'repo') {
      setRepoPath(path)
    } else {
      setWorktreeBasePath(path)
    }
    setShowDirectoryPicker(false)
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-neutral-900 rounded-lg w-[480px] shadow-xl">
          <div className="flex items-center justify-between p-4 border-b border-neutral-800">
            <h2 className="text-lg font-medium">Add Project</h2>
            <button onClick={closeDialog} className="p-1 hover:bg-neutral-800 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Repository Path
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={repoPath}
                  onChange={(e) => setRepoPath(e.target.value)}
                  placeholder="/path/to/your/git/repo"
                  className="flex-1 px-3 py-2 bg-neutral-800 rounded border border-neutral-700 focus:border-blue-500 focus:outline-none"
                  required
                />
                <button
                  type="button"
                  onClick={() => {
                    setDirectoryPickerTarget('repo')
                    setShowDirectoryPicker(true)
                  }}
                  className="p-2 bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-700"
                  title="Browse directories"
                >
                  <FolderOpen className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">
                Worktree Base Path <span className="text-neutral-500">(optional)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={worktreeBasePath}
                  onChange={(e) => setWorktreeBasePath(e.target.value)}
                  placeholder="/path/to/store/worktrees"
                  className="flex-1 px-3 py-2 bg-neutral-800 rounded border border-neutral-700 focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    setDirectoryPickerTarget('worktree')
                    setShowDirectoryPicker(true)
                  }}
                  className="p-2 bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-700"
                  title="Browse directories"
                >
                  <FolderOpen className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs text-neutral-500 mt-1">
                Defaults to sibling directory: {repoPath ? `${repoPath}-worktrees` : 'repo-worktrees'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">
                Main Branch <span className="text-neutral-500">(optional)</span>
              </label>
              <input
                type="text"
                value={mainBranch}
                onChange={(e) => setMainBranch(e.target.value)}
                placeholder="Leave empty to auto-detect"
                className="w-full px-3 py-2 bg-neutral-800 rounded border border-neutral-700 focus:border-blue-500 focus:outline-none"
              />
              <p className="text-xs text-neutral-500 mt-1">
                Auto-detected from remote HEAD if left empty
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">
                Setup Script <span className="text-neutral-500">(optional)</span>
              </label>
              <textarea
                value={setupScript}
                onChange={(e) => setSetupScript(e.target.value)}
                placeholder="pnpm install"
                rows={3}
                className="w-full px-3 py-2 bg-neutral-800 rounded border border-neutral-700 focus:border-blue-500 focus:outline-none font-mono text-sm"
              />
              <p className="text-xs text-neutral-500 mt-1">
                Runs automatically after creating a new worktree
              </p>
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
                disabled={loading || !repoPath.trim()}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded disabled:opacity-50"
              >
                {loading ? 'Adding...' : 'Add Project'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {showDirectoryPicker && (
        <DirectoryPicker
          onSelect={handleDirectorySelect}
          onClose={() => setShowDirectoryPicker(false)}
        />
      )}
    </>
  )
}
