import { useState, useEffect, useRef } from 'react'
import { X, GitBranch, ChevronDown } from 'lucide-react'
import { useUiStore } from '../../stores/ui.store.js'
import { useProjectStore } from '../../stores/project.store.js'

export function CreateWorktreeDialog() {
  const closeDialog = useUiStore((s) => s.closeDialog)
  const activeDialogData = useUiStore((s) => s.activeDialogData)
  const createWorktree = useProjectStore((s) => s.createWorktree)
  const listBranches = useProjectStore((s) => s.listBranches)
  const projects = useProjectStore((s) => s.projects)

  const projectId = activeDialogData?.projectId as string
  const project = projects.find((p) => p.id === projectId)

  const [branch, setBranch] = useState('')
  const [baseRef, setBaseRef] = useState(project?.mainBranch || 'main')
  const [customName, setCustomName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [branches, setBranches] = useState<{ local: string[]; remote: string[] }>({ local: [], remote: [] })
  const [showBranchDropdown, setShowBranchDropdown] = useState(false)
  const [branchSearch, setBranchSearch] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (projectId) {
      listBranches(projectId).then(setBranches).catch(console.error)
    }
  }, [projectId])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowBranchDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const allBranches = [...branches.local, ...branches.remote]
  const filteredBranches = allBranches.filter((b) =>
    b.toLowerCase().includes(branchSearch.toLowerCase())
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await createWorktree(projectId, {
        branch: branch.trim(),
        baseRef: baseRef.trim(),
        name: customName.trim() || undefined,
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
      <div className="app-dialog app-dialog-mobile max-w-[480px]">
        <div className="app-dialog-header">
          <h2 className="text-lg font-medium">Create Worktree</h2>
          <button onClick={closeDialog} className="app-icon-button">
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
              className="app-input"
              required
            />
          </div>

          <div className="relative" ref={dropdownRef}>
            <label className="block text-sm font-medium mb-1.5">
              Base Ref
            </label>
            <div className="relative">
              <input
                type="text"
                value={showBranchDropdown ? branchSearch : baseRef}
                onChange={(e) => {
                  setBranchSearch(e.target.value)
                  setBaseRef(e.target.value)
                }}
                onFocus={() => {
                  setShowBranchDropdown(true)
                  setBranchSearch('')
                }}
                placeholder="main"
                className="app-input pr-8"
                required
              />
              <button
                type="button"
                onClick={() => setShowBranchDropdown(!showBranchDropdown)}
                className="absolute right-2 top-1/2 -translate-y-1/2 app-icon-button"
              >
                <ChevronDown className="w-4 h-4 app-subtle" />
              </button>
            </div>

            {showBranchDropdown && filteredBranches.length > 0 && (
              <div className="absolute z-10 w-full mt-1 app-panel-strong border rounded-md shadow-lg max-h-48 overflow-auto">
                {filteredBranches.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => {
                      setBaseRef(b)
                      setBranchSearch('')
                      setShowBranchDropdown(false)
                    }}
                    className="w-full text-left px-3 py-2 app-hover flex items-center gap-2 text-sm"
                  >
                    <GitBranch className="w-3 h-3 app-subtle" />
                    {b}
                  </button>
                ))}
              </div>
            )}

            <p className="text-xs app-subtle mt-1">
              The branch or commit to create the new worktree from
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              Custom Name <span className="app-subtle">(optional)</span>
            </label>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="My Feature Branch"
              className="app-input"
            />
            <p className="text-xs app-subtle mt-1">
              Display name shown in sidebar (defaults to branch name)
            </p>
          </div>

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
              disabled={loading || !branch.trim() || !baseRef.trim()}
              className={`app-button-primary ${loading || !branch.trim() || !baseRef.trim() ? 'app-disabled' : ''}`}
            >
              {loading ? 'Creating...' : 'Create Worktree'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
