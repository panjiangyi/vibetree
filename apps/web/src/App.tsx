import { useEffect } from 'react'
import { AppLayout } from './components/layout/AppLayout.js'
import { useProjectStore } from './stores/project.store.js'
import { useTerminalStore } from './stores/terminal.store.js'
import { terminalSocket } from './ws/terminal-socket.js'

export default function App() {
  const loadProjects = useProjectStore((s) => s.loadProjects)
  const loadTerminals = useTerminalStore((s) => s.loadTerminals)

  useEffect(() => {
    loadProjects()
    loadTerminals()
    terminalSocket.connect()

    return () => {
      terminalSocket.disconnect()
    }
  }, [])

  return <AppLayout />
}
