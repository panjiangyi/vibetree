import { useState } from 'react'
import { X } from 'lucide-react'
import type { Project } from '@vibetree/shared'
import { useUiStore } from '../../stores/ui.store.js'
import { useProjectStore } from '../../stores/project.store.js'

export function ProjectSettingsDialog() {
  const closeDialog = useUiStore((s) => s.closeDialog)
  const activeDialogData = useUiStore((s) => s.activeDialogData)
  const updateProject = useProjectStore((s) => s.updateProject)

  const project = activeDialogData?.project as Project

  const [name, setName] = useState(project.name)
  const [mainBranch, setMainBranch] = useState(project.mainBranch)
  const [setupScript, setSetupScript] = useState(project.setupScript || '')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await updateProject(project.id, {
        name: name.trim(),
        mainBranch: mainBranch.trim(),
        setupScript: setupScript.trim() || null,
      })
      closeDialog()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-dialog-overlay">
      <div className="app-dialog w-[480px]">
        <div className="app-dialog-header">
          <h2 className="text-lg font-medium">Project Settings</h2>
          <button onClick={closeDialog} className="app-icon-button">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Project Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="app-input"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              Main Branch
            </label>
            <input
              type="text"
              value={mainBranch}
              onChange={(e) => setMainBranch(e.target.value)}
              placeholder="main"
              className="app-input"
            />
            <p className="text-xs app-subtle mt-1">
              Default branch for new worktrees
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
            Worktrees are stored at: <code className="app-muted">~/.worktree/{project.name}/[branch]</code>
          </p>

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
              disabled={loading || !name.trim()}
              className={`app-button-primary ${loading || !name.trim() ? 'app-disabled' : ''}`}
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
