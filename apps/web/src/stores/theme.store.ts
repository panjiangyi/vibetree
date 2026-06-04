import { create } from 'zustand'

export type ThemeMode = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'vibetree.themeMode'
const MEDIA_QUERY = '(prefers-color-scheme: dark)'

let mediaQueryList: MediaQueryList | null = null

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia(MEDIA_QUERY).matches ? 'dark' : 'light'
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? getSystemTheme() : mode
}

function applyThemeToDom(theme: ResolvedTheme) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

type ThemeStore = {
  themeMode: ThemeMode
  resolvedTheme: ResolvedTheme
  initializeTheme: () => () => void
  setThemeMode: (mode: ThemeMode) => void
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  themeMode: 'system',
  resolvedTheme: 'dark',

  initializeTheme: () => {
    const storedMode = localStorage.getItem(STORAGE_KEY)
    const themeMode: ThemeMode =
      storedMode === 'light' || storedMode === 'dark' || storedMode === 'system'
        ? storedMode
        : 'system'

    const syncResolvedTheme = (mode = get().themeMode) => {
      const resolvedTheme = resolveTheme(mode)
      applyThemeToDom(resolvedTheme)
      set({ resolvedTheme })
    }

    set({ themeMode })
    syncResolvedTheme(themeMode)

    mediaQueryList ??= window.matchMedia(MEDIA_QUERY)
    const handleSystemChange = () => {
      if (get().themeMode === 'system') {
        syncResolvedTheme('system')
      }
    }

    mediaQueryList.addEventListener('change', handleSystemChange)

    return () => {
      mediaQueryList?.removeEventListener('change', handleSystemChange)
    }
  },

  setThemeMode: (mode) => {
    localStorage.setItem(STORAGE_KEY, mode)
    const resolvedTheme = resolveTheme(mode)
    applyThemeToDom(resolvedTheme)
    set({ themeMode: mode, resolvedTheme })
  },
}))
