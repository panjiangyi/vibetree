import { useTerminalStore } from '../../stores/terminal.store.js'
import { TerminalTab } from './TerminalTab.js'

export function TerminalTabs() {
  const terminals = useTerminalStore((s) => s.terminals)
  const activeTerminalId = useTerminalStore((s) => s.activeTerminalId)
  const setActiveTerminal = useTerminalStore((s) => s.setActiveTerminal)
  const closeTerminal = useTerminalStore((s) => s.closeTerminal)
  const restartTerminal = useTerminalStore((s) => s.restartTerminal)

  if (terminals.length === 0) return null

  return (
    <div className="flex border-b border-neutral-800 bg-neutral-900 overflow-x-auto">
      {terminals.map((terminal) => (
        <TerminalTab
          key={terminal.id}
          terminal={terminal}
          isActive={terminal.id === activeTerminalId}
          onClick={() => setActiveTerminal(terminal.id)}
          onClose={() => closeTerminal(terminal.id)}
          onRestart={() => restartTerminal(terminal.id)}
        />
      ))}
    </div>
  )
}
