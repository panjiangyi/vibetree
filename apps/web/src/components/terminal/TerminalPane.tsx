import { XtermView } from './XtermView.js'
import type { TerminalViewActions } from './XtermView.js'

type Props = {
  terminalId: string
  fontSize?: number
  voiceInputMode?: boolean
  onActionsChange?: (actions: TerminalViewActions | null) => void
  onVoiceDraftChange?: (draft: string) => void
}

export function TerminalPane({ terminalId, fontSize, voiceInputMode, onActionsChange, onVoiceDraftChange }: Props) {
  return (
    <div className="flex h-full flex-1 min-h-0 flex-col overflow-hidden">
      <XtermView
        terminalId={terminalId}
        fontSize={fontSize}
        voiceInputMode={voiceInputMode}
        onActionsChange={onActionsChange}
        onVoiceDraftChange={onVoiceDraftChange}
      />
    </div>
  )
}
