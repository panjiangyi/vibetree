# Web 终端渲染原理与 WorktreeHub 实现说明

更新时间：2026-06-27

## 一句话结论

网页里的“终端”不是浏览器在运行一个真正的系统终端窗口，而是前端用终端模拟器库接收一串终端字节流，解析 ANSI/VT 控制序列，维护一份屏幕缓冲区，再把缓冲区绘制到网页元素上。后端负责把浏览器和真实 shell/命令进程之间的输入输出接起来。

在 WorktreeHub 里，这个终端模拟器是 `@xterm/xterm`，真实终端会话由后端的 `node-pty` 管理，前后端之间通过 WebSocket 传递 JSON 消息。

## 核心概念

### 1. 终端模拟器

终端模拟器负责“看懂终端协议”，不是简单地把字符串放进 `<pre>`。

shell、vim、top、git、pnpm 这些程序输出的不只是普通文本，还会输出控制序列，例如：

```text
\x1b[31mred\x1b[0m
\x1b[2J
\x1b[H
```

这些序列的含义分别可能是设置颜色、清屏、移动光标。终端模拟器需要解析这些字节，更新内部屏幕状态，再决定当前每个字符格应该显示什么字符、什么颜色、什么光标位置、什么选择状态。

xterm.js 官方 API 也体现了这个模型：应用把数据传给 `Terminal.write()`，xterm.js 负责解析和更新终端；用户输入则通过 `Terminal.onData()` 回传给宿主应用。

### 2. PTY

PTY 是 pseudo-terminal，也就是伪终端。它让一个普通后端进程看起来像是在真实终端里运行。

没有 PTY 时，很多命令会认为自己只是在管道里运行，于是不会启用颜色、交互、全屏 UI、光标控制等行为。有了 PTY，shell 和交互式程序可以正常感知：

- `TERM=xterm-256color`
- 当前终端尺寸 `cols x rows`
- 标准输入来自键盘
- 标准输出应该包含终端控制序列
- resize、Ctrl+C、方向键等终端行为

WorktreeHub 后端用 `node-pty` 创建 PTY，会把 `TERM` 设置为 `xterm-256color`，并把 PTY 输出原样发送给浏览器。

### 3. WebSocket

终端输出是持续流，不适合普通 HTTP 请求/响应。WebSocket 提供一条长连接，让前端可以实时发送输入，后端也可以实时推送输出。

WorktreeHub 的 WebSocket 消息不是直接传二进制流，而是 JSON 协议：

- 前端发：`attach`、`input`、`resize`、`paste-image`、`ping`
- 后端发：`attached`、`output`、`exit`、`error`、`pong`

协议定义在 `packages/shared/src/terminal-protocol.ts`。

## 通用渲染链路

一个网页终端通常是这条链路：

```text
用户键盘/粘贴/IME
  -> 浏览器事件
  -> xterm.js 捕获输入
  -> WebSocket input 消息
  -> 后端 pty.write()
  -> shell / 交互式程序
  -> PTY 输出终端字节流
  -> WebSocket output 消息
  -> xterm.write(data)
  -> xterm.js parser 解析 ANSI/VT 序列
  -> xterm.js buffer 更新字符格、颜色、光标、滚屏
  -> xterm.js renderer 绘制到网页
```

重点是最后三步：浏览器收到的是“终端数据流”，不是 HTML。xterm.js 会先解析它，再更新内部 buffer，最后由 renderer 把可见 viewport 画出来。

## xterm.js 在网页里具体做什么

### 1. 捕获输入

xterm.js 会把键盘、鼠标、粘贴、组合输入等浏览器事件转换成终端输入数据。对应用层来说，主要入口是 `term.onData((data) => ...)`。

在 WorktreeHub：

- `apps/web/src/components/terminal/XtermView.tsx:826` 监听 `term.onData`
- 收到输入后调用 `terminalSocket.input({ terminalId, data })`
- 后端收到 `input` 后调用 `ptyManager.write(...)`

这意味着前端不会直接执行命令。前端只发送“用户在终端里输入了什么”。

### 2. 接收输出

后端 PTY 输出的数据会通过 WebSocket 的 `output` 消息发给前端。

在 WorktreeHub：

- `apps/server/src/modules/pty/pty.manager.ts:67` 监听 `ptyProcess.onData`
- `apps/server/src/modules/pty/pty.manager.ts:71` 把数据包装成 `output`
- `apps/web/src/components/terminal/XtermView.tsx:896` 调用 `term.write(data, callback)`

`term.write()` 不是“把文本 append 到 DOM”。它会把数据交给 xterm.js 的 parser。parser 会识别普通字符和控制序列，然后更新终端 buffer。

### 3. 维护屏幕缓冲区

终端 UI 是按字符格渲染的，不是普通网页流式排版。每个格子通常包含：

- 字符或宽字符的一部分
- 前景色、背景色、粗体、斜体、下划线等属性
- 光标位置
- 是否被选中
- 是否位于普通屏幕或 alternate screen

普通命令输出主要进入 normal buffer，并受 scrollback 限制。vim、less、top 等全屏程序常用 alternate screen；alternate screen 里通常没有浏览器侧 scrollback，滚动由程序自身处理。

WorktreeHub 的普通终端历史滚动交给 xterm.js 本地 viewport/scrollback；浮动滚动按钮也只调用 `term.scrollLines(...)`，不再通过后端命令驱动远端滚动。

相关代码：

- `apps/web/src/components/terminal/XtermView.tsx:209`

### 4. 绘制到网页

xterm.js 的 renderer 根据当前 buffer 和 viewport，把字符格投影到浏览器元素里。应用不应该自己拼 HTML 来渲染终端输出，否则会遇到这些问题：

- ANSI 控制序列无法正确处理
- 光标移动、清屏、覆盖文本会出错
- 全屏程序无法工作
- 宽字符、emoji、CJK、组合输入难处理
- 选择、复制、滚屏、字体测量都要重做
- 不小心把终端输出当 HTML 会引入安全问题

WorktreeHub 前端只做容器、主题、尺寸、输入兼容和流量调度，实际终端解析和绘制交给 xterm.js。

## WorktreeHub 当前实现

### 依赖

前端依赖：

- `@xterm/xterm`
- `@xterm/addon-fit`
- `@xterm/addon-web-links`

后端依赖：

- `node-pty`
- `@fastify/websocket`
- `ws`

版本位置：

- `apps/web/package.json`
- `apps/server/package.json`

### 前端初始化

入口文件是 `apps/web/src/components/terminal/XtermView.tsx`。

关键步骤：

1. 创建 xterm 实例：`new Terminal(...)`
2. 加载 `FitAddon` 和 `WebLinksAddon`
3. 调用 `term.open(containerRef.current)` 挂载到 DOM
4. `fitAddon.fit()` 根据容器尺寸计算 `cols` 和 `rows`
5. 通过 WebSocket 发送 `attach`
6. 后续 `ResizeObserver` 触发时重新 fit，并发送 `resize`

对应代码：

- `apps/web/src/components/terminal/XtermView.tsx:195`
- `apps/web/src/components/terminal/XtermView.tsx:208`
- `apps/web/src/components/terminal/XtermView.tsx:298`
- `apps/web/src/components/terminal/XtermView.tsx:318`

### 后端 attach

前端发送 `attach` 后，后端会：

1. 找到对应 terminal session
2. 确保 PTY runtime 存在
3. 把当前 WebSocket 加入 PTY runtime 的 client 集合
4. 按前端传来的 `cols`、`rows` 调整 PTY 尺寸
5. 发送 `attached`
6. 回放最近的输出 buffer

对应代码：

- `apps/server/src/websocket/terminal.ws.ts:75`
- `apps/server/src/websocket/terminal.ws.ts:98`
- `apps/server/src/websocket/terminal.ws.ts:106`

回放 buffer 很重要：React 组件重新挂载、页面刷新或 WebSocket 重连后，用户还能看到最近一段终端内容。WorktreeHub 当前 buffer 大小是 16 MiB，位置在 `apps/server/src/modules/pty/pty.manager.ts:8`。

### PTY 创建与输出广播

`apps/server/src/modules/pty/pty.manager.ts` 负责管理运行中的 PTY。

创建时：

- 调用 `pty.spawn(...)`
- 传入 shell/command、cwd、env
- 设置 `TERM=xterm-256color`
- 设置 `COLORTERM=truecolor`
- 保存 runtime：PTY、输出回放 buffer、连接的 WebSocket clients

输出时：

- `ptyProcess.onData((data) => ...)` 收到原始终端数据
- 对每个已连接 client 发送 `{ type: 'output', data }`
- 同时把输出写入 replay buffer
- 回放 buffer 会过滤部分 device attribute 序列，避免重新 attach 后 stale 响应污染 shell

相关代码：

- `apps/server/src/modules/pty/pty.manager.ts:41`
- `apps/server/src/modules/pty/pty.manager.ts:57`
- `apps/server/src/modules/pty/pty.manager.ts:67`
- `apps/server/src/modules/pty/pty.manager.ts:80`

### 前端输出调度

终端输出可能非常快，例如 `pnpm install`、`cat large.log`、测试失败堆栈。直接把所有输出同步写入 xterm.js，容易卡住浏览器主线程。

WorktreeHub 的前端做了两层调度：

- 收到 `output` 后先追加到 `pendingOutput`
- 每个 animation frame 最多写入 `64 * 1024` 字符
- 等 `term.write(data, callback)` 完成后再写下一批

相关代码：

- `apps/web/src/components/terminal/XtermView.tsx:883`
- `apps/web/src/components/terminal/XtermView.tsx:892`
- `apps/web/src/components/terminal/XtermView.tsx:896`

这个设计利用了 xterm.js 的异步 `write` callback，避免一次性把大量输出压进 parser。

### 输入、IME 与粘贴

普通英文键盘输入可以直接走 `term.onData`。但中文、日文、韩文等 IME 输入更复杂，因为浏览器会触发 `compositionstart`、`compositionupdate`、`compositionend`、`beforeinput`、`input` 等事件，且不同平台会有回显和重复提交问题。

WorktreeHub 在 `XtermView.tsx` 里额外处理了：

- composition 状态
- committed CJK text
- IME echo suppression
- replayed input suppression
- paste text
- paste image

粘贴图片时，前端把图片转成 base64，通过 `paste-image` 发给后端。后端保存到临时目录，然后把文件路径写入 PTY，相当于在终端里粘贴了图片文件路径。

相关代码：

- `apps/web/src/components/terminal/XtermView.tsx:29`
- `apps/web/src/components/terminal/XtermView.tsx:698`
- `apps/server/src/websocket/terminal.ws.ts:122`

## 为什么必须同步尺寸

终端输出的换行、全屏 UI、光标定位都依赖 `cols` 和 `rows`。如果前端显示尺寸和后端 PTY 尺寸不同，会出现：

- 命令输出提前换行或延迟换行
- vim/top 画面错位
- 进度条覆盖异常
- 复制的文本和视觉内容不一致

所以正确流程是：

```text
容器尺寸变化
  -> FitAddon 计算 cols/rows
  -> 前端发送 resize
  -> 后端调用 pty.resize(cols, rows)
  -> shell/程序按新尺寸重绘
```

WorktreeHub 在 `ResizeObserver` 中做这件事。

## 安全边界

终端输出必须被当作数据流处理，而不是 HTML。

需要注意：

- 不要把 PTY 输出 `dangerouslySetInnerHTML`
- 不要用自写正则把 ANSI 直接转 HTML，除非明确覆盖完整语义和转义
- shell 本身有执行能力，WebSocket 必须受认证保护
- 粘贴图片、文件路径、OSC 链接等功能要有大小限制和类型限制
- replay buffer 不能无限增长
- 多 client attach 同一个 PTY 时，要明确会话隔离和权限边界

WorktreeHub 当前有这些保护点：

- WebSocket attach 前调用 `authService.requireSession(...)`
- clipboard image 限制 MIME 和最大 20 MiB
- replay buffer 限制为 16 MiB
- 输出交给 xterm.js 解析，不作为 HTML 插入

## 性能与稳定性要点

### 1. 输出背压

WebSocket 和 xterm.js parser 都可能成为瓶颈。当前 WorktreeHub 已经在前端按 frame 分片写入 xterm.js，但还没有显式根据 `WebSocket.bufferedAmount` 或 PTY 输出速度做端到端背压。

如果后续遇到大输出卡顿，可以考虑：

- 监控前端 pending output 长度
- 监控 WebSocket `bufferedAmount`
- 后端按 client 状态降采样或断开慢 client
- 对历史输出只保留 replay buffer，不对离线 client 积压完整流

### 2. 字符宽度

CJK、emoji、组合字符不是单字节、单列宽。终端渲染必须依赖成熟库处理字符宽度、光标列、选择范围。自写 `<span>` 渲染很容易在这些场景出错。

### 3. alternate screen

全屏程序通常使用 alternate screen。浏览器侧 scrollback 和全屏程序内部历史不是同一件事。WorktreeHub 不再用后端 copy-mode 模拟滚动；普通 shell 历史由 xterm.js 本地滚动，全屏程序历史由程序自身处理。

### 4. reconnect 与 replay

重连时 replay buffer 会重新写入 xterm.js。需要避免回放会触发终端应答的控制序列，所以 WorktreeHub 过滤了 device attribute 序列。以后如果引入更多终端查询序列，也要评估它们是否适合进入 replay buffer。

## 排查问题时看哪里

### 页面不显示输出

先看：

- WebSocket 是否连上：`apps/web/src/ws/terminal-socket.ts`
- 后端是否发送 `output`：`apps/server/src/modules/pty/pty.manager.ts`
- 前端是否收到并进入 `enqueueOutput`：`apps/web/src/components/terminal/XtermView.tsx`
- `term.write` 是否被调用

### 输入没有进入 shell

先看：

- `term.onData` 是否触发
- `terminalSocket.input(...)` 是否发送
- 后端 `terminal.ws.ts` 是否收到 `input`
- `ptyManager.write(...)` 是否找到 runtime

### resize 后 UI 错位

先看：

- `FitAddon.fit()` 后的 `term.cols`、`term.rows`
- 前端是否发送 `resize`
- 后端是否调用 `runtime.pty.resize(cols, rows)`

### 中文输入重复或丢字

先看：

- `composition*` 事件日志
- `beforeinput` / `input` 提交顺序
- `imeEchoDataRef`
- `recentInputTextChunksRef`

WorktreeHub 已经有 `apps/web/src/debug/input-event-logger.ts`，可以用来定位不同浏览器和输入法的事件差异。

## 参考资料

- xterm.js Terminal API：<https://xtermjs.org/docs/api/terminal/classes/terminal/>
- xterm.js Addons 指南：<https://xtermjs.org/docs/guides/using-addons/>
- xterm.js Parser Hooks 指南：<https://xtermjs.org/docs/guides/hooks/>
- node-pty 官方仓库：<https://github.com/microsoft/node-pty>
- Linux PTY man page：<https://man7.org/linux/man-pages/man7/pty.7.html>
- WHATWG WebSocket 标准：<https://websockets.spec.whatwg.org/>
