import { useEffect } from 'react'
import { LoginScreen } from './components/auth/LoginScreen.js'
import { AppLayout } from './components/layout/AppLayout.js'
import { useAuthStore } from './stores/auth.store.js'
import { useProjectStore } from './stores/project.store.js'
import { useTerminalStore } from './stores/terminal.store.js'
import { useThemeStore } from './stores/theme.store.js'
import { useMobileViewportGuard } from './hooks/useMobileViewportGuard.js'
import { terminalSocket } from './ws/terminal-socket.js'

export default function App() {
  const authStatus = useAuthStore((s) => s.status)
  const checkSession = useAuthStore((s) => s.checkSession)
  const loadProjects = useProjectStore((s) => s.loadProjects)
  const loadTerminals = useTerminalStore((s) => s.loadTerminals)
  const initializeTheme = useThemeStore((s) => s.initializeTheme)

  useMobileViewportGuard()

  useEffect(() => {
    const cleanupTheme = initializeTheme()

    return () => {
      cleanupTheme()
      terminalSocket.disconnect()
    }
  }, [initializeTheme])

  useEffect(() => {
    void checkSession()
  }, [checkSession])

  useEffect(() => {
    if (authStatus !== 'authenticated') {
      terminalSocket.disconnect()
      return
    }

    void loadProjects()
    void loadTerminals()
    terminalSocket.connect()

    return () => {
      terminalSocket.disconnect()
    }
  }, [authStatus, loadProjects, loadTerminals])

  if (authStatus !== 'authenticated') {
    return <LoginScreen />
  }

  return <AppLayout />
}
