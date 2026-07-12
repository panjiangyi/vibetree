export type VoiceInputPhase = 'idle' | 'interim' | 'cleanup' | 'finalizing'

export type VoiceInputState = {
  phase: VoiceInputPhase
  interimText: string
  finalText: string
  deletionCount: number
}

export function createVoiceInputState(): VoiceInputState {
  return {
    phase: 'idle',
    interimText: '',
    finalText: '',
    deletionCount: 0,
  }
}

export function stageVoiceText(state: VoiceInputState, data: string): VoiceInputState {
  if (!data) return state

  if (state.phase === 'cleanup' || state.phase === 'finalizing') {
    return {
      ...state,
      phase: 'finalizing',
      finalText: state.finalText + data,
      deletionCount: 0,
    }
  }

  return {
    ...state,
    phase: 'interim',
    interimText: state.interimText + data,
    deletionCount: 0,
  }
}

export function stageVoiceFinalText(state: VoiceInputState, data: string): VoiceInputState {
  if (!data) return state

  return {
    ...state,
    phase: 'finalizing',
    finalText: data,
    deletionCount: 0,
  }
}

export function stageVoiceDeletion(state: VoiceInputState): {
  state: VoiceInputState
  consumed: boolean
} {
  if (state.phase === 'idle') {
    return { state, consumed: false }
  }

  if (state.phase === 'finalizing') {
    return {
      consumed: true,
      state: {
        ...state,
        phase: 'cleanup',
        finalText: '',
        deletionCount: 1,
      },
    }
  }

  const deletionCount = state.deletionCount + 1
  return {
    consumed: true,
    state: {
      ...state,
      phase: 'cleanup',
      deletionCount,
    },
  }
}

export function getVoiceDraftText(state: VoiceInputState): string {
  if (state.phase === 'finalizing') return state.finalText
  if (state.phase === 'cleanup') return ''
  return state.interimText
}

export function getVoiceCommitText(state: VoiceInputState): string {
  if (state.phase === 'finalizing') return state.finalText
  if (state.phase === 'interim') return state.interimText
  return ''
}

export function isVoiceTextData(data: string): boolean {
  return Boolean(data) && !/[\u0000-\u001f\u007f-\u009f]/u.test(data)
}

export function getVoiceDeletionCount(data: string): number {
  if (!data) return 0
  const characters = Array.from(data)
  return characters.every((character) => character === '\b' || character === '\x7f')
    ? characters.length
    : 0
}

export function reconcileVoiceInputText(pendingXtermText: string, inputText: string): {
  remainingXtermText: string
  remainingInputText: string
} {
  let commonPrefixLength = 0
  const maxPrefixLength = Math.min(pendingXtermText.length, inputText.length)

  while (
    commonPrefixLength < maxPrefixLength &&
    pendingXtermText[commonPrefixLength] === inputText[commonPrefixLength]
  ) {
    commonPrefixLength += 1
  }

  if (commonPrefixLength === 0) {
    return {
      remainingXtermText: '',
      remainingInputText: inputText,
    }
  }

  return {
    remainingXtermText: pendingXtermText.slice(commonPrefixLength),
    remainingInputText: inputText.slice(commonPrefixLength),
  }
}
