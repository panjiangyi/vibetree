import { XtermView } from './XtermView.js'

type Props = {
  terminalId: string
}

export function TerminalPane({ terminalId }: Props) {
  return (
    <div className="flex-1 min-h-0">
      <XtermView terminalId={terminalId} />
    </div>
  )
}
