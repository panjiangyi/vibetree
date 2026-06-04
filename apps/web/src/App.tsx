import { useEffect } from 'react'
import { AppLayout } from './components/layout/AppLayout.js'
import { useProjectStore } from './stores/project.store.js'
import { useTerminalStore } from './stores/terminal.store.js'
import { useThemeStore } from './stores/theme.store.js'
import { terminalSocket } from './ws/terminal-socket.js'

export default function App() {
  const loadProjects = useProjectStore((s) => s.loadProjects)
  const loadTerminals = useTerminalStore((s) => s.loadTerminals)
  const initializeTheme = useThemeStore((s) => s.initializeTheme)

  useEffect(() => {
    const cleanupTheme = initializeTheme()
    loadProjects()
    loadTerminals()
    terminalSocket.connect()

    return () => {
      cleanupTheme()
      terminalSocket.disconnect()
    }
  }, [initializeTheme, loadProjects, loadTerminals])

  return <AppLayout />
}
