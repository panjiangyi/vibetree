import { useState } from 'react'
import { X, FolderOpen } from 'lucide-react'
import { useUiStore } from '../../stores/ui.store.js'
import { useProjectStore } from '../../stores/project.store.js'
import { DirectoryPicker } from './DirectoryPicker.js'

export function AddProjectDialog() {
  const closeDialog = useUiStore((s) => s.closeDialog)
  const addProject = useProjectStore((s) => s.addProject)

  const [repoPath, setRepoPath] = useState('')
  const [mainBranch, setMainBranch] = useState('')
  const [setupScript, setSetupScript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showDirectoryPicker, setShowDirectoryPicker] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await addProject({
        repoPath: repoPath.trim(),
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
    setRepoPath(path)
    setShowDirectoryPicker(false)
  }

  return (
    <>
      <div className="app-dialog-overlay">
        <div className="app-dialog app-dialog-mobile max-w-[480px]">
          <div className="app-dialog-header">
            <h2 className="text-lg font-medium">Add Project</h2>
            <button onClick={closeDialog} className="app-icon-button">
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
                  className="app-input flex-1"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowDirectoryPicker(true)}
                  className="app-button-secondary px-2 py-2"
                  title="Browse directories"
                >
                  <FolderOpen className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">
                Main Branch <span className="app-subtle">(optional)</span>
              </label>
              <input
                type="text"
                value={mainBranch}
                onChange={(e) => setMainBranch(e.target.value)}
                placeholder="Leave empty to auto-detect"
                className="app-input"
              />
              <p className="text-xs app-subtle mt-1">
                Auto-detected from remote HEAD if left empty
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">
                Setup Script <span className="app-subtle">(optional)</span>
              </label>
              <textarea
                value={setupScript}
                onChange={(e) => setSetupScript(e.target.value)}
                placeholder="pnpm install"
                rows={3}
                className="app-input font-mono text-sm"
              />
              <p className="text-xs app-subtle mt-1">
                Runs automatically after creating a new worktree
              </p>
            </div>

            <p className="text-xs app-subtle">
              Worktrees will be created at: <code className="app-muted">~/.worktree/[project-name]/[branch]</code>
            </p>

            {error && (
              <div className="text-sm app-danger app-soft-danger px-3 py-2 rounded">
                {error}
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                type="button"
                onClick={closeDialog}
                className="app-button-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !repoPath.trim()}
                className={`app-button-primary ${loading || !repoPath.trim() ? 'app-disabled' : ''}`}
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
