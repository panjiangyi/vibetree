# Cross-Device Terminal Sharing

## Problem

When device A creates/closes/renames/restarts a terminal, device B has NO real-time notification. Device B must refresh the page to see changes. The PTY output fan-out and ring buffer already work for terminal content, but the terminal **list** and **status** are not synced.

## Solution

Add a lightweight server→client broadcast layer over the existing WebSocket. After each terminal mutation, the server pushes lifecycle events to ALL connected WS clients. The frontend handles these with idempotent upsert semantics (the originating device's optimistic update makes the broadcast a no-op for itself).

Layout (grid positions) stays per-device — desktop grid vs mobile single-focus are inherently different.

## Changes (6 files, 0 new files)

### 1. `packages/shared/src/terminal-protocol.ts` — Extend protocol

Add 3 new `TerminalServerMessage` variants:

```typescript
| { type: 'terminal-created'; terminal: TerminalSession }
| { type: 'terminal-deleted'; terminalId: string; scopeId: string; scopeType: string }
| { type: 'terminal-updated'; terminal: TerminalSession }
```

Import `TerminalSession` type at the top.

### 2. `apps/server/src/modules/auth/auth.service.ts` — Add `getAllSockets()`

Add one method to the returned object:

```typescript
getAllSockets(): WebSocket[] {
  const result: WebSocket[] = []
  for (const session of sessions.values()) {
    for (const socket of session.sockets) {
      result.push(socket)
    }
  }
  return result
}
```

### 3. `apps/server/src/modules/terminals/terminal.service.ts` — Add broadcast hooks

Add an `onBroadcast` callback to the service return object:

```typescript
onBroadcast: null as ((event: TerminalBroadcastEvent) => void) | null,
```

Call it at these points:
- **`createTerminal`** — after return: `{ type: 'terminal-created', terminal }`
- **`createDirectoryTerminal`** — after return: `{ type: 'terminal-created', terminal }`
- **`deleteTerminal`** — capture `{id, scopeId, scopeType}` before deletion, broadcast after: `{ type: 'terminal-deleted', ... }`
- **`renameTerminal`** — after update: `{ type: 'terminal-updated', terminal }`
- **`restartTerminal`** — after update: `{ type: 'terminal-updated', terminal }`
- **`attachExitHandler`** — on PTY exit: directory → `terminal-deleted`, worktree → `terminal-updated` with exited status

For `attachExitHandler`, use a getter `self.onBroadcast` (where `self` references the returned service object) so the callback is read at exit-time, not registration-time.

### 4. `apps/server/src/websocket/terminal.ws.ts` — Wire up broadcast

In `registerTerminalWebSocket`, set:

```typescript
terminalService.onBroadcast = (event) => {
  const sockets = authService.getAllSockets()
  for (const socket of sockets) {
    sendWs(socket, event)
  }
}
```

### 5. `apps/web/src/ws/terminal-socket.ts` — Add reconnect callback

Add `onReconnect` mechanism so the terminal store can re-sync after WS reconnects:

```typescript
private reconnectListeners = new Set<() => void>()

onReconnect(listener: () => void) {
  this.reconnectListeners.add(listener)
  return () => this.reconnectListeners.delete(listener)
}
```

Call listeners in `onopen` after flushing the queue.

### 6. `apps/web/src/stores/terminal.store.ts` — Handle sync events

Extend the existing `terminalSocket.onMessage` handler with a switch on the 3 new message types:

- **`terminal-created`**: Idempotent check (`terminals.some(t => t.id === terminal.id)`), then add to store. If the terminal's scope is currently active, call `layoutStore.addPaneForTerminal()`.
- **`terminal-deleted`**: Idempotent check, remove from store, call `layoutStore.removePane()`, handle active scope fallback.
- **`terminal-updated`**: Replace in store, update title in layout store.

Also:
- Add `terminalSocket.onReconnect(() => loadTerminals())` for full re-sync after reconnect.
- Make existing optimistic update paths (`createTerminal`, `openDirectoryTerminal`, etc.) use upsert semantics to handle race where WS broadcast arrives before REST response.

## Key Design Decisions

- **Broadcast to ALL clients** (not excluding originator) — simpler, and idempotent checks make it safe
- **Layout stays per-device** — desktop grid layout is meaningless on mobile
- **Existing `exit` WS message stays** — it's a fast path for PTY-attached clients; the new `terminal-updated` provides the list-level notification to ALL clients
- **No database changes** — all sync is in-memory via WebSocket
