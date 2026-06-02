export type TerminalClientMessage =
  | {
      type: 'attach'
      terminalId: string
      cols: number
      rows: number
    }
  | {
      type: 'input'
      terminalId: string
      data: string
    }
  | {
      type: 'resize'
      terminalId: string
      cols: number
      rows: number
    }
  | {
      type: 'close'
      terminalId: string
    }

export type TerminalServerMessage =
  | {
      type: 'attached'
      terminalId: string
    }
  | {
      type: 'output'
      terminalId: string
      data: string
    }
  | {
      type: 'exit'
      terminalId: string
      exitCode: number | null
    }
  | {
      type: 'error'
      terminalId?: string
      code?: string
      message: string
    }
