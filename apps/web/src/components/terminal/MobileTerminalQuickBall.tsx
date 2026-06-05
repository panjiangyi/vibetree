import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Draggable from 'react-draggable'
import type { DraggableData, DraggableEvent } from 'react-draggable'
import {
  ChevronDown,
  ChevronUp,
  Clipboard,
  Copy,
  Eraser,
  Plus,
  Send,
  SkipBack,
  Square,
  TextCursorInput,
  Undo2,
} from 'lucide-react'
import { terminalSocket } from '../../ws/terminal-socket.js'
import type { TerminalViewActions } from './XtermView.js'

const QUICK_BALL_STORAGE_KEY = 'vibetree.mobileQuickBall'
const QUICK_BALL_SIZE = 52
const QUICK_ACTION_SIZE = 44
const QUICK_BALL_MARGIN = 12
const QUICK_BALL_TOP_INSET = 56
const QUICK_BALL_BOTTOM_INSET = 20
const QUICK_BALL_INNER_RADIUS = 88
const QUICK_BALL_OUTER_RADIUS = 132
const QUICK_BALL_ANGLES = [-64, -32, 0, 32, 64] as const
const QUICK_ACTION_ANIMATION_MS = 260
const QUICK_BALL_MENU_REACH =
  Math.sin((Math.max(...QUICK_BALL_ANGLES.map((angle) => Math.abs(angle))) * Math.PI) / 180) *
  QUICK_BALL_OUTER_RADIUS

type QuickBallEdge = 'left' | 'right'

type QuickBallPosition = {
  x: number
  y: number
}

type QuickBallSnapshot = {
  edge: QuickBallEdge
  y: number
}

type QuickBallBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

type QuickActionConfig = {
  label: string
  displayLabel: string
  icon: ReactNode
  onClick: () => void
}

type MobileTerminalQuickBallProps = {
  terminalId: string
  terminalActions: TerminalViewActions | null
}

function getViewportSize() {
  const visualViewport = window.visualViewport

  return {
    width: Math.round(visualViewport?.width ?? window.innerWidth),
    height: Math.round(visualViewport?.height ?? window.innerHeight),
  }
}

function getQuickBallBounds(viewport: { width: number; height: number }, includeMenu: boolean): QuickBallBounds {
  const minX = QUICK_BALL_MARGIN
  const maxX = Math.max(minX, viewport.width - QUICK_BALL_SIZE - QUICK_BALL_MARGIN)
  const closedMinY = QUICK_BALL_TOP_INSET
  const closedMaxY = Math.max(closedMinY, viewport.height - QUICK_BALL_SIZE - QUICK_BALL_BOTTOM_INSET)

  if (!includeMenu) {
    return { minX, maxX, minY: closedMinY, maxY: closedMaxY }
  }

  const menuMinY =
    QUICK_BALL_TOP_INSET + QUICK_ACTION_SIZE / 2 - QUICK_BALL_SIZE / 2 + QUICK_BALL_MENU_REACH
  const menuMaxY =
    viewport.height -
    QUICK_BALL_BOTTOM_INSET -
    QUICK_ACTION_SIZE / 2 -
    QUICK_BALL_SIZE / 2 -
    QUICK_BALL_MENU_REACH

  if (menuMaxY < menuMinY) {
    return { minX, maxX, minY: closedMinY, maxY: closedMaxY }
  }

  return { minX, maxX, minY: menuMinY, maxY: menuMaxY }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function clampQuickBallPosition(position: QuickBallPosition, bounds: QuickBallBounds): QuickBallPosition {
  return {
    x: clamp(position.x, bounds.minX, bounds.maxX),
    y: clamp(position.y, bounds.minY, bounds.maxY),
  }
}

function getSnappedQuickBallPosition(
  edge: QuickBallEdge,
  y: number,
  bounds: QuickBallBounds
): QuickBallPosition {
  return {
    x: edge === 'left' ? bounds.minX : bounds.maxX,
    y: clamp(y, bounds.minY, bounds.maxY),
  }
}

function getInitialQuickBallState(): { edge: QuickBallEdge; position: QuickBallPosition } {
  const viewport = getViewportSize()
  const bounds = getQuickBallBounds(viewport, false)
  const defaultEdge: QuickBallEdge = 'right'
  const defaultY = viewport.height - QUICK_BALL_SIZE - 112

  try {
    const raw = localStorage.getItem(QUICK_BALL_STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<QuickBallSnapshot>
      const edge = saved.edge === 'left' || saved.edge === 'right' ? saved.edge : defaultEdge
      const y = typeof saved.y === 'number' ? saved.y : defaultY
      return {
        edge,
        position: getSnappedQuickBallPosition(edge, y, bounds),
      }
    }
  } catch {
    // Ignore corrupt persisted state and fall back to the default position.
  }

  return {
    edge: defaultEdge,
    position: getSnappedQuickBallPosition(defaultEdge, defaultY, bounds),
  }
}

function saveQuickBallState(edge: QuickBallEdge, position: QuickBallPosition) {
  try {
    const snapshot: QuickBallSnapshot = { edge, y: position.y }
    localStorage.setItem(QUICK_BALL_STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // Persisting position is a convenience; the control remains usable without it.
  }
}

function getQuickActionStyle(
  edge: QuickBallEdge,
  ring: 'inner' | 'outer',
  index: number,
  isExpanded: boolean
): CSSProperties {
  const centerX = QUICK_BALL_SIZE / 2 - QUICK_ACTION_SIZE / 2
  const centerY = QUICK_BALL_SIZE / 2 - QUICK_ACTION_SIZE / 2

  if (!isExpanded) {
    return {
      height: QUICK_ACTION_SIZE,
      opacity: 0,
      transform: `translate(${centerX}px, ${centerY}px) scale(0.4)`,
      transition:
        `transform ${QUICK_ACTION_ANIMATION_MS}ms cubic-bezier(0.2, 0.85, 0.2, 1), ` +
        'opacity 160ms ease, background-color 120ms ease, border-color 120ms ease',
      transitionDelay: `${index * 8 + (ring === 'inner' ? 20 : 0)}ms`,
      width: QUICK_ACTION_SIZE,
    }
  }

  const baseAngle = QUICK_BALL_ANGLES[index] ?? 0
  const angle = edge === 'left' ? baseAngle : 180 - baseAngle
  const radians = (angle * Math.PI) / 180
  const radius = ring === 'inner' ? QUICK_BALL_INNER_RADIUS : QUICK_BALL_OUTER_RADIUS
  const x = centerX + Math.cos(radians) * radius
  const y = centerY + Math.sin(radians) * radius

  return {
    height: QUICK_ACTION_SIZE,
    opacity: 1,
    transform: `translate(${x}px, ${y}px) scale(1)`,
    transition:
      `transform ${QUICK_ACTION_ANIMATION_MS}ms cubic-bezier(0.2, 0.85, 0.2, 1), ` +
      'opacity 160ms ease, background-color 120ms ease, border-color 120ms ease',
    transitionDelay: `${index * 18 + (ring === 'outer' ? 50 : 0)}ms`,
    width: QUICK_ACTION_SIZE,
  }
}

export default function MobileTerminalQuickBall({
  terminalId,
  terminalActions,
}: MobileTerminalQuickBallProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isMenuVisible, setIsMenuVisible] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewport, setViewport] = useState(getViewportSize)
  const [ballState, setBallState] = useState(getInitialQuickBallState)
  const nodeRef = useRef<HTMLDivElement>(null)
  const dragDistanceRef = useRef(0)
  const closeTimerRef = useRef<number | null>(null)
  const openFrameRef = useRef<number | null>(null)
  const suppressNextClickRef = useRef(false)
  const pointerStartRef = useRef<{ id: number; x: number; y: number } | null>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const lastDirectToggleAtRef = useRef(0)

  const sendInput = useCallback((data: string) => {
    terminalSocket.input({ terminalId, data })
    terminalActions?.focus()
  }, [terminalActions, terminalId])

  const handleCopy = useCallback(() => {
    terminalActions?.copySelection()
    terminalActions?.focus()
  }, [terminalActions])

  const handlePaste = useCallback(async () => {
    setError(null)
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        sendInput(text)
      }
    } catch {
      setError('Clipboard access denied')
    }
  }, [sendInput])

  const innerActions = useMemo<QuickActionConfig[]>(
    () => [
      {
        label: 'Esc',
        displayLabel: 'Esc',
        icon: <SkipBack className="w-4 h-4" />,
        onClick: () => sendInput('\x1b'),
      },
      {
        label: 'Tab',
        displayLabel: 'Tab',
        icon: <Send className="w-4 h-4" />,
        onClick: () => sendInput('\t'),
      },
      {
        label: '上一条',
        displayLabel: '上条',
        icon: <ChevronUp className="w-4 h-4" />,
        onClick: () => sendInput('\x1b[A'),
      },
      {
        label: '下一条',
        displayLabel: '下条',
        icon: <ChevronDown className="w-4 h-4" />,
        onClick: () => sendInput('\x1b[B'),
      },
      {
        label: '粘贴',
        displayLabel: '粘贴',
        icon: <Clipboard className="w-4 h-4" />,
        onClick: handlePaste,
      },
    ],
    [handlePaste, sendInput]
  )

  const outerActions = useMemo<QuickActionConfig[]>(
    () => [
      {
        label: '终止进程',
        displayLabel: '终止',
        icon: <Square className="w-4 h-4 app-danger" />,
        onClick: () => sendInput('\x03'),
      },
      {
        label: '清屏',
        displayLabel: '清屏',
        icon: <Eraser className="w-4 h-4" />,
        onClick: () => sendInput('\x0c'),
      },
      {
        label: '输入 clear',
        displayLabel: 'clear',
        icon: <TextCursorInput className="w-4 h-4" />,
        onClick: () => sendInput('clear\r'),
      },
      {
        label: '撤销本行',
        displayLabel: '撤销',
        icon: <Undo2 className="w-4 h-4" />,
        onClick: () => sendInput('\x05\x15'),
      },
      {
        label: '复制',
        displayLabel: '复制',
        icon: <Copy className="w-4 h-4" />,
        onClick: handleCopy,
      },
    ],
    [handleCopy, sendInput]
  )

  const clearAnimationTimers = useCallback(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    if (openFrameRef.current != null) {
      window.cancelAnimationFrame(openFrameRef.current)
      openFrameRef.current = null
    }
  }, [])

  const openMenu = useCallback(() => {
    clearAnimationTimers()
    setError(null)
    setIsMenuVisible(true)
    setBallState((state) => {
      const bounds = getQuickBallBounds(viewport, true)
      const position = getSnappedQuickBallPosition(state.edge, state.position.y, bounds)
      saveQuickBallState(state.edge, position)
      return { ...state, position }
    })
    openFrameRef.current = window.requestAnimationFrame(() => {
      setIsOpen(true)
      openFrameRef.current = null
    })
  }, [clearAnimationTimers, viewport])

  const closeMenu = useCallback(() => {
    clearAnimationTimers()
    setError(null)
    setIsOpen(false)
    closeTimerRef.current = window.setTimeout(() => {
      setIsMenuVisible(false)
      closeTimerRef.current = null
    }, QUICK_ACTION_ANIMATION_MS)
  }, [clearAnimationTimers])

  useEffect(() => {
    const handleViewportChange = () => {
      const nextViewport = getViewportSize()
      setViewport(nextViewport)
      setBallState((state) => {
        const bounds = getQuickBallBounds(nextViewport, isOpen || isMenuVisible)
        const position = getSnappedQuickBallPosition(state.edge, state.position.y, bounds)
        saveQuickBallState(state.edge, position)
        return { ...state, position }
      })
    }

    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('orientationchange', handleViewportChange)
    window.visualViewport?.addEventListener('resize', handleViewportChange)
    window.visualViewport?.addEventListener('scroll', handleViewportChange)

    return () => {
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('orientationchange', handleViewportChange)
      window.visualViewport?.removeEventListener('resize', handleViewportChange)
      window.visualViewport?.removeEventListener('scroll', handleViewportChange)
    }
  }, [isMenuVisible, isOpen])

  useEffect(() => {
    if (!isMenuVisible) return

    setBallState((state) => {
      const bounds = getQuickBallBounds(viewport, true)
      const position = getSnappedQuickBallPosition(state.edge, state.position.y, bounds)
      saveQuickBallState(state.edge, position)
      return { ...state, position }
    })
  }, [isMenuVisible, viewport])

  useEffect(() => {
    if (!isMenuVisible) return

    const handlePointerDown = (event: PointerEvent) => {
      if (nodeRef.current?.contains(event.target as Node)) return
      closeMenu()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeMenu, isMenuVisible])

  useEffect(() => {
    clearAnimationTimers()
    setIsOpen(false)
    setIsMenuVisible(false)
    setError(null)
  }, [clearAnimationTimers, terminalId])

  useEffect(() => clearAnimationTimers, [clearAnimationTimers])

  const handleDragStart = () => {
    dragDistanceRef.current = 0
  }

  const handleDrag = (_event: DraggableEvent, data: DraggableData) => {
    dragDistanceRef.current += Math.abs(data.deltaX) + Math.abs(data.deltaY)
    const bounds = getQuickBallBounds(viewport, isOpen || isMenuVisible)
    const position = clampQuickBallPosition({ x: data.x, y: data.y }, bounds)
    setBallState((state) => ({ ...state, position }))
  }

  const handleDragStop = (_event: DraggableEvent, data: DraggableData) => {
    const bounds = getQuickBallBounds(viewport, isOpen || isMenuVisible)
    const edge = data.x + QUICK_BALL_SIZE / 2 < viewport.width / 2 ? 'left' : 'right'
    const position = getSnappedQuickBallPosition(edge, data.y, bounds)

    if (dragDistanceRef.current > 6) {
      suppressNextClickRef.current = true
      window.setTimeout(() => {
        suppressNextClickRef.current = false
      }, 180)
    }

    setBallState({ edge, position })
    saveQuickBallState(edge, position)
  }

  const toggleMenu = useCallback(() => {
    if (isOpen || isMenuVisible) {
      closeMenu()
    } else {
      openMenu()
    }
  }, [closeMenu, isMenuVisible, isOpen, openMenu])

  const handleToggle = () => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      return
    }

    toggleMenu()
  }

  const triggerDirectTapToggle = useCallback(() => {
    const now = Date.now()
    if (now - lastDirectToggleAtRef.current < 260) return

    lastDirectToggleAtRef.current = now
    suppressNextClickRef.current = true
    toggleMenu()
    window.setTimeout(() => {
      suppressNextClickRef.current = false
    }, 420)
  }, [toggleMenu])

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse') return
    pointerStartRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    }
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse') return

    const start = pointerStartRef.current
    pointerStartRef.current = null
    if (!start || start.id !== event.pointerId) return

    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y)
    if (distance > 8 || dragDistanceRef.current > 6) return

    event.preventDefault()
    event.stopPropagation()
    triggerDirectTapToggle()
  }

  const handlePointerCancel = () => {
    pointerStartRef.current = null
  }

  const handleTouchStart = (event: React.TouchEvent<HTMLButtonElement>) => {
    const touch = event.changedTouches[0]
    touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null
  }

  const handleTouchEnd = (event: React.TouchEvent<HTMLButtonElement>) => {
    const touch = event.changedTouches[0]
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!touch || !start) return

    const distance = Math.hypot(touch.clientX - start.x, touch.clientY - start.y)
    if (distance > 8 || dragDistanceRef.current > 6) return

    event.preventDefault()
    event.stopPropagation()
    triggerDirectTapToggle()
  }

  const handleTouchCancel = () => {
    touchStartRef.current = null
  }

  const handleBallKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggleMenu()
    }
  }

  const quickBall = (
    <Draggable
      nodeRef={nodeRef}
      position={ballState.position}
      cancel=".quick-ball-action"
      onStart={handleDragStart}
      onDrag={handleDrag}
      onStop={handleDragStop}
    >
      <div
        ref={nodeRef}
        className="fixed left-0 top-0 z-30 h-[52px] w-[52px] select-none md:hidden"
        style={{ touchAction: 'none' }}
      >
        {isMenuVisible && (
          <div className="pointer-events-none absolute inset-0">
            {innerActions.map((action, index) => (
              <QuickBallActionButton
                key={action.label}
                action={action}
                edge={ballState.edge}
                isExpanded={isOpen}
                index={index}
                ring="inner"
              />
            ))}
            {outerActions.map((action, index) => (
              <QuickBallActionButton
                key={action.label}
                action={action}
                edge={ballState.edge}
                isExpanded={isOpen}
                index={index}
                ring="outer"
              />
            ))}
          </div>
        )}

        {isMenuVisible && error && (
          <div
            className={`pointer-events-auto absolute top-16 w-44 rounded-md border px-3 py-2 text-xs shadow-lg app-soft-danger app-danger ${
              ballState.edge === 'left' ? 'left-0' : 'right-0'
            }`}
          >
            {error}
          </div>
        )}

        <button
          type="button"
          aria-label="快捷操作"
          aria-expanded={isOpen}
          onKeyDown={handleBallKeyDown}
          onClick={handleToggle}
          onPointerCancel={handlePointerCancel}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onTouchCancel={handleTouchCancel}
          onTouchEnd={handleTouchEnd}
          onTouchStart={handleTouchStart}
          className="absolute inset-0 z-20 flex h-[52px] w-[52px] items-center justify-center rounded-full border shadow-xl app-panel-strong app-hover"
          title="快捷操作"
        >
          <Plus
            className={`w-5 h-5 app-accent transition-transform duration-150 ${
              isOpen ? 'rotate-45' : ''
            }`}
          />
        </button>
      </div>
    </Draggable>
  )

  return createPortal(quickBall, document.body)
}

type QuickBallActionButtonProps = {
  action: QuickActionConfig
  edge: QuickBallEdge
  isExpanded: boolean
  index: number
  ring: 'inner' | 'outer'
}

function QuickBallActionButton({ action, edge, isExpanded, index, ring }: QuickBallActionButtonProps) {
  const pointerStartRef = useRef<{ id: number; x: number; y: number } | null>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const suppressNextClickRef = useRef(false)
  const lastDirectActionAtRef = useRef(0)

  const triggerDirectAction = useCallback(() => {
    const now = Date.now()
    if (now - lastDirectActionAtRef.current < 240) return

    lastDirectActionAtRef.current = now
    suppressNextClickRef.current = true
    action.onClick()
    window.setTimeout(() => {
      suppressNextClickRef.current = false
    }, 420)
  }, [action])

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      return
    }

    action.onClick()
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (event.pointerType === 'mouse') return

    pointerStartRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    }
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (event.pointerType === 'mouse') return

    const start = pointerStartRef.current
    pointerStartRef.current = null
    if (!start || start.id !== event.pointerId) return

    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y)
    if (distance > 8) return

    event.preventDefault()
    triggerDirectAction()
  }

  const handlePointerCancel = () => {
    pointerStartRef.current = null
  }

  const handleTouchStart = (event: React.TouchEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const touch = event.changedTouches[0]
    touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null
  }

  const handleTouchEnd = (event: React.TouchEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const touch = event.changedTouches[0]
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!touch || !start) return

    const distance = Math.hypot(touch.clientX - start.x, touch.clientY - start.y)
    if (distance > 8) return

    event.preventDefault()
    triggerDirectAction()
  }

  const handleTouchCancel = () => {
    touchStartRef.current = null
  }

  return (
    <button
      type="button"
      aria-label={action.label}
      title={action.label}
      onClick={handleClick}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onTouchCancel={handleTouchCancel}
      onTouchEnd={handleTouchEnd}
      onTouchStart={handleTouchStart}
      className="quick-ball-action pointer-events-auto absolute left-0 top-0 z-10 flex flex-col items-center justify-center rounded-full border px-1 shadow-lg app-panel-strong app-hover"
      style={{ ...getQuickActionStyle(edge, ring, index, isExpanded), touchAction: 'manipulation' }}
    >
      {action.icon}
      <span className="max-w-full truncate text-[8px] font-medium leading-none">
        {action.displayLabel}
      </span>
    </button>
  )
}
