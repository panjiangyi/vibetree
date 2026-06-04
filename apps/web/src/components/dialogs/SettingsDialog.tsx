import { useState } from 'react'
import { X, Info, Monitor, Moon, Sun } from 'lucide-react'
import { getApiBase, getDefaultApiBase } from '../../api/client.js'
import { useUiStore } from '../../stores/ui.store.js'
import { type ThemeMode, useThemeStore } from '../../stores/theme.store.js'

export function SettingsDialog() {
  const closeDialog = useUiStore((s) => s.closeDialog)
  const themeMode = useThemeStore((s) => s.themeMode)
  const setThemeMode = useThemeStore((s) => s.setThemeMode)

  const [apiBase, setApiBase] = useState(getApiBase())
  const [selectedThemeMode, setSelectedThemeMode] = useState<ThemeMode>(themeMode)

  const handleSave = () => {
    const previousApiBase = getApiBase()
    const nextApiBase = apiBase.trim()
    setThemeMode(selectedThemeMode)
    if (nextApiBase) {
      localStorage.setItem('vibetree.apiBase', nextApiBase)
    } else {
      localStorage.removeItem('vibetree.apiBase')
    }
    closeDialog()

    if (previousApiBase !== getApiBase()) {
      window.location.reload()
    }
  }

  return (
    <div className="app-dialog-overlay">
      <div className="app-dialog app-dialog-mobile max-w-[420px]">
        <div className="app-dialog-header">
          <h2 className="text-lg font-medium">Settings</h2>
          <button onClick={closeDialog} className="app-icon-button">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Theme
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSelectedThemeMode('system')}
                className={`rounded-md border px-3 py-2 text-sm ${
                  selectedThemeMode === 'system' ? 'app-soft-info app-accent border-[var(--color-accent)]' : 'app-panel-strong app-hover'
                }`}
              >
                <Monitor className="w-4 h-4 mx-auto mb-1" />
                System
              </button>
              <button
                type="button"
                onClick={() => setSelectedThemeMode('light')}
                className={`rounded-md border px-3 py-2 text-sm ${
                  selectedThemeMode === 'light' ? 'app-soft-info app-accent border-[var(--color-accent)]' : 'app-panel-strong app-hover'
                }`}
              >
                <Sun className="w-4 h-4 mx-auto mb-1" />
                Light
              </button>
              <button
                type="button"
                onClick={() => setSelectedThemeMode('dark')}
                className={`rounded-md border px-3 py-2 text-sm ${
                  selectedThemeMode === 'dark' ? 'app-soft-info app-accent border-[var(--color-accent)]' : 'app-panel-strong app-hover'
                }`}
              >
                <Moon className="w-4 h-4 mx-auto mb-1" />
                Dark
              </button>
            </div>
            <p className="app-subtle text-xs mt-1">System follows your OS preference automatically.</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              API Base URL
            </label>
            <input
              type="text"
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
              className="app-input"
            />
            <p className="app-subtle text-xs mt-1">
              Default: {getDefaultApiBase()}
            </p>
          </div>

          <div className="flex items-start gap-2 p-3 app-soft-info rounded">
            <Info className="w-4 h-4 app-accent flex-shrink-0 mt-0.5" />
            <div className="text-xs app-muted">
              <p>VibeTree can be opened from devices on the same network.</p>
              <p className="mt-1">Only use this on a trusted LAN because the app exposes local project terminals.</p>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button
              onClick={closeDialog}
              className="app-button-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="app-button-primary"
            >
              {apiBase.trim() === getApiBase() ? 'Save' : 'Save & Reload'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
