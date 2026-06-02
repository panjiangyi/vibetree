import { useState } from 'react'
import { X, Info } from 'lucide-react'
import { useUiStore } from '../../stores/ui.store.js'

export function SettingsDialog() {
  const closeDialog = useUiStore((s) => s.closeDialog)

  const [apiBase, setApiBase] = useState(
    localStorage.getItem('vibetree.apiBase') ?? 'http://127.0.0.1:3767'
  )

  const handleSave = () => {
    localStorage.setItem('vibetree.apiBase', apiBase)
    closeDialog()
    // Reload to apply new API base
    window.location.reload()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-neutral-900 rounded-lg w-[420px] shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-neutral-800">
          <h2 className="text-lg font-medium">Settings</h2>
          <button onClick={closeDialog} className="p-1 hover:bg-neutral-800 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              API Base URL
            </label>
            <input
              type="text"
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-800 rounded border border-neutral-700 focus:border-blue-500 focus:outline-none"
            />
            <p className="text-xs text-neutral-500 mt-1">
              Default: http://127.0.0.1:3767
            </p>
          </div>

          <div className="flex items-start gap-2 p-3 bg-neutral-800/50 rounded">
            <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-neutral-400">
              <p>VibeTree is a local-only tool.</p>
              <p className="mt-1">It listens on 127.0.0.1 by default and should not be exposed to the network.</p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={closeDialog}
              className="px-4 py-2 text-sm bg-neutral-800 hover:bg-neutral-700 rounded"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded"
            >
              Save & Reload
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
