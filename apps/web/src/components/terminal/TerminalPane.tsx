import { XtermView } from './XtermView.js'

type Props = {
  terminalId: string
  fontSize?: number
}

export function TerminalPane({ terminalId, fontSize }: Props) {
  return (
    <div className="flex h-full flex-1 min-h-0 flex-col overflow-hidden">
      <XtermView terminalId={terminalId} fontSize={fontSize} />
    </div>
  )
}
