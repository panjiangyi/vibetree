import { useEffect } from 'react'
import { AppLayout } from './components/layout/AppLayout.js'
import { useProjectStore } from './stores/project.store.js'
import { useTerminalStore } from './stores/terminal.store.js'
import { terminalSocket } from './ws/terminal-socket.js'

export default function App() {
  const loadProjects = useProjectStore((s) => s.loadProjects)
  const loadTerminals = useTerminalStore((s) => s.loadTerminals)
  const activeTerminalId = useTerminalStore((s) => s.activeTerminalId)

  useEffect(() => {
    // Load initial data
    loadProjects()
    loadTerminals()

    // Connect WebSocket
    terminalSocket.connect()

    return () => {
      terminalSocket.disconnect()
    }
  }, [])

  useEffect(() => {
    // Auto-attach active terminal on load
    if (activeTerminalId) {
      terminalSocket.attach({
        terminalId: activeTerminalId,
        cols: 120,
        rows: 30,
      })
    }
  }, [activeTerminalId])

  return <AppLayout />
}
