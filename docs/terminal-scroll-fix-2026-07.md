# 终端滚动体验修复说明

更新时间：2026-07-02

## 背景

终端滚动体验一直不好，主要表现为：往上翻看历史输出时会被强行拉回底部、手机上手指甩动滚动很卡（滑一下就停）、断线重连后内容看起来重复/错位。这次针对 `apps/web/src/components/terminal/XtermView.tsx` 排查并修复了三个相互独立的根因，都不是调参数，而是逻辑上的竞态/误判。

## 问题一：输出过程中往上翻页会被拉回底部

### 现象

只要终端（比如 Claude Code）还在持续输出，用户往上滚动查看历史，几乎立刻就会被拽回最底部，完全没法在输出过程中翻看历史。

### 根因

`XtermView.tsx` 里监听了 xterm 的 `onWriteParsed` 事件（每次新内容解析完成后触发），只要 `atBottomRef.current` 为真就调用 `scrollToBottom()`：

```ts
const writeParsedDisposable = term.onWriteParsed(() => {
  if (atBottomRef.current) {
    requestAnimationFrame(scrollToBottom)
  }
  nativeTouchScrollLayer.refresh()
})
```

而 `atBottomRef` 的“是否贴底”判定原来是：

```ts
atBottomRef.current = buf.baseY - buf.viewportY <= 1
```

即“距离底部 1 行以内也算贴底”。这两点叠加就产生了竞态：

1. 用户往上滚一行，此时视口距离底部只有 1 行，仍然被判定为“贴底”。
2. 紧接着下一批输出到达，`onWriteParsed` 触发，看到 `atBottomRef.current === true`，于是强制把视口滚回最底部。
3. 只要输出还在持续（而不是滚很多行），这个过程每次都会发生，用户体感就是“翻不上去”。

### 修复

- 判定“贴底”改为严格相等（`buf.viewportY >= buf.baseY`），不再有 1 行的容差，避免边界抖动导致误判。
- 直接删除了 `onWriteParsed` 里的强制 `scrollToBottom()` 调用。xterm.js 本身已经实现了正确的行为：视口贴底时新内容会自动跟随滚动，视口不在底部时新内容到达不会移动视口。这段手动逻辑是多余的，而且正是竞态的来源，删除后只保留了触摸滚动层尺寸的刷新（`nativeTouchScrollLayer.refresh()`）。

同样的贴底判定问题也出现在鼠标滚轮/按钮触发的 `sendScroll` 和 `onScroll` 回调里，一并做了同步修正。

## 问题二：手机上手指甩动滚动很卡

### 现象

移动端为了让原生触摸滚动（惯性、回弹）体验更好，`XtermView.tsx` 在 xterm 的 viewport 上叠加了一个透明的 `overlay` 元素，实际滚动发生在 overlay 上，再把 overlay 的 `scrollTop` 同步回 xterm 的真实 viewport。这层同步原来是**双向、无条件**的：

```ts
// viewport -> overlay（在 refresh() 里）
if (Math.abs(overlay.scrollTop - viewport.scrollTop) > 1) {
  overlay.scrollTop = viewport.scrollTop
}

// overlay -> viewport（在 syncOverlayToViewport 里）
if (Math.abs(viewport.scrollTop - overlay.scrollTop) > 0.5) {
  viewport.scrollTop = overlay.scrollTop
}
```

### 根因

浏览器的触摸惯性滚动（fling/momentum）是一个由系统合成器驱动的动画。只要在动画进行中通过 JS 给同一个可滚动元素写 `scrollTop`，浏览器会认为“开发者接管了滚动”，立刻**取消掉正在进行的惯性动画**。

而 `term.onScroll` 会在 xterm 内部滚动状态变化时触发 `refresh()`，`refresh()` 又会把 viewport 的 `scrollTop` 写回 overlay —— 这个写入恰好发生在用户手指甩动产生的惯性滚动过程中，于是每一次这样的写入都会打断当前的惯性动画。用户体感就是“滑一下，动画立刻停住”。

### 修复

核心思路：**手势期间（含惯性尾巴）只允许 overlay → viewport 单向同步，禁止 viewport → overlay 的程序化写入**，避免打断浏览器自己的滚动动画。

- 新增 `touchActive` 标记触摸是否按下，`lastUserScrollAt` 记录最近一次用户滚动时间。`isUserScrolling()` 在“正在触摸”或“触摸结束后 150ms（`USER_SCROLL_IDLE_MS`）惯性尾巴期内”都返回 true。
- `refresh()`（viewport → overlay 方向）在 `isUserScrolling()` 为真时跳过写入 `overlay.scrollTop`，只更新尺寸相关的样式（高度、是否显示等），把滚动位置的裁决权交给浏览器自己的惯性动画。
- 新增 `programmaticScrollTop` 标记：`refresh()` 每次程序化写入 overlay 前记一下期望值，`overlay` 的 `scroll` 事件处理函数（`handleOverlayScroll`，原名 `syncOverlayToViewport`）如果发现当前 `scrollTop` 跟这个期望值一致，就判定这是程序化写入触发的回调，不当作“用户又滚动了一次”处理，避免误判打断。
- 手势结束（`touchend`/`touchcancel`）后不能保证 viewport 和 overlay 立刻一致（因为期间跳过了同步），所以新增 `scheduleIdleRefresh()`：在惯性窗口结束后延迟一次 `refresh()`，做最终的位置对账。

## 问题三：断线重连后内容重复/错位

### 现象

WebSocket 断线重连（比如网络抖动、切后台唤醒）后，终端里的内容看起来变多了、滚动条变长，历史内容像是叠加了一份。

### 根因

服务端 `terminal.ws.ts` 在处理 `attach` 消息时，会把该终端的完整输出缓冲区重新发一遍：

```ts
sendWs(ws, { type: 'attached', terminalId: message.terminalId })
const replayOutput = runtime.outputBuffer.toString()
if (replayOutput) {
  sendWs(ws, { type: 'output', terminalId: message.terminalId, data: replayOutput })
}
```

这个设计本身没问题——重连后需要补齐这段时间的输出。但客户端原来完全没有处理 `attached` 消息，只是把它过滤掉：

```ts
if (message.type !== 'output' && message.type !== 'exit' && message.type !== 'error') return
```

于是重连时收到的“重放输出”会被当成普通的新增输出，直接 `term.write()` 追加在已有内容后面，而不是替换。用户看到的就是历史内容被重复渲染了一遍，滚动位置也随之错乱。

### 修复

客户端现在会处理 `attached` 消息：收到时先清空待写入队列，再通过正常的输出写入通道注入一个终端重置转义序列（`ESC c` / `\x1bc`）：

```ts
if (message.type === 'attached') {
  pendingOutput = ''
  enqueueOutput('\x1bc')
  return
}
```

之所以通过 `enqueueOutput` 走正常的写入队列，而不是直接调用 `term.reset()`，是为了保证时序：紧随其后到达的重放 `output` 消息会排在这个重置指令之后依次写入，保证“先清空、再重放”的顺序不会因为 `term.write` 的异步分片写入（`writePendingOutput` 按 `MAX_OUTPUT_CHARS_PER_FRAME` 分帧写入）而错乱。

## 修改文件

- `apps/web/src/components/terminal/XtermView.tsx`

## 验证

- `pnpm -r typecheck` 全部通过（packages/shared、apps/server、apps/web）。
- `pnpm --filter @worktreehub/web build` 构建通过。
- 以上问题均为逻辑竞态/误判，本地类型检查和构建无法覆盖实际交互体验，建议手动验证以下场景：
  - 终端持续输出（如运行 `claude` 或 `pnpm dev` 打印日志）时，尝试用鼠标滚轮/触摸板向上翻页，确认不会被拉回底部。
  - 手机上对着终端手指甩动滑屏，确认惯性滚动顺畅、不会滑一下就停。
  - 手动断开网络或切到后台再切回来，触发 WebSocket 重连，确认终端内容没有重复、滚动条长度正常。
