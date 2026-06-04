import { XtermView } from './XtermView.js'
import type { TerminalViewActions } from './XtermView.js'

type Props = {
  terminalId: string
  fontSize?: number
  onActionsChange?: (actions: TerminalViewActions | null) => void
}

export function TerminalPane({ terminalId, fontSize, onActionsChange }: Props) {
  return (
    <div className="flex h-full flex-1 min-h-0 flex-col overflow-hidden">
      <XtermView
        terminalId={terminalId}
        fontSize={fontSize}
        onActionsChange={onActionsChange}
      />
    </div>
  )
}
