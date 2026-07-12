import { describe, expect, it } from 'vitest'
import {
  createVoiceInputState,
  getVoiceCommitText,
  getVoiceDeletionCount,
  getVoiceDraftText,
  isVoiceTextData,
  reconcileVoiceInputText,
  stageVoiceDeletion,
  stageVoiceFinalText,
  stageVoiceText,
  type VoiceInputState,
} from './voice-input-state.js'

function deleteVoiceText(state: VoiceInputState, count: number): VoiceInputState {
  let nextState = state
  for (let index = 0; index < count; index += 1) {
    nextState = stageVoiceDeletion(nextState).state
  }
  return nextState
}

describe('voice input state', () => {
  it('replaces Chinese interim numbers with one Arabic final transcript', () => {
    let state = stageVoiceText(createVoiceInputState(), '一二三四五六七八九')
    state = deleteVoiceText(state, 9)
    state = stageVoiceText(state, '123456789')

    expect(state.phase).toBe('finalizing')
    expect(getVoiceDraftText(state)).toBe('123456789')
    expect(getVoiceCommitText(state)).toBe('123456789')
  })

  it('aggregates every final transcript fragment after cleanup', () => {
    let state = stageVoiceText(createVoiceInputState(), '一、二、三、四、五、六、七、八、九。')
    state = deleteVoiceText(state, 10)

    for (const chunk of ['1、2、3、4、5、', '6', '、', '7', '、', '8', '、', '9']) {
      state = stageVoiceText(state, chunk)
    }

    expect(getVoiceCommitText(state)).toBe('1、2、3、4、5、6、7、8、9')
    expect(state.interimText).toBe('一、二、三、四、五、六、七、八、九。')
  })

  it('keeps swallowing cleanup deletions after the visible draft is empty', () => {
    let state = stageVoiceText(createVoiceInputState(), '测试')
    state = deleteVoiceText(state, 2)

    expect(getVoiceDraftText(state)).toBe('')
    expect(getVoiceCommitText(state)).toBe('')
    expect(stageVoiceDeletion(state).consumed).toBe(true)
  })

  it('handles a one-character transcript that produces only one cleanup deletion', () => {
    let state = stageVoiceText(createVoiceInputState(), '一')
    state = stageVoiceDeletion(state).state
    state = stageVoiceText(state, '1')

    expect(state.phase).toBe('finalizing')
    expect(getVoiceCommitText(state)).toBe('1')
  })

  it('classifies only plain text and backspace-only xterm data', () => {
    expect(isVoiceTextData('123中文')).toBe(true)
    expect(isVoiceTextData('\x1b[D')).toBe(false)
    expect(getVoiceDeletionCount('\x7f\x7f')).toBe(2)
    expect(getVoiceDeletionCount('\x1b[D')).toBe(0)
  })

  it('treats a committed composition as an authoritative final transcript', () => {
    const interim = stageVoiceText(createVoiceInputState(), '临时结果')
    const final = stageVoiceFinalText(interim, '最终结果')

    expect(final.phase).toBe('finalizing')
    expect(getVoiceCommitText(final)).toBe('最终结果')
  })

  it('keeps the input suffix when xterm emits only a truncated prefix', () => {
    expect(reconcileVoiceInputText('12345', '123456789')).toEqual({
      remainingXtermText: '',
      remainingInputText: '6789',
    })
  })

  it('carries an xterm suffix across split input events', () => {
    expect(reconcileVoiceInputText('123456789', '12345')).toEqual({
      remainingXtermText: '6789',
      remainingInputText: '',
    })
  })
})
