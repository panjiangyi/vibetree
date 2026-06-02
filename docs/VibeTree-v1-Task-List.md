# VibeTree v1 Task List

这份任务清单基于 [VibeTree-Implementation-Doc-v0.1.md](/mnt/data/james/Documents/sidework/vibetree/docs/VibeTree-Implementation-Doc-v0.1.md) 拆解，目标是：按顺序完成这些任务后，VibeTree v1 作为一个本地工具可交付。

## 1. 完成标准

- [ ] 项目可在 Linux/macOS 上以 Node 22 LTS 运行。
- [ ] `pnpm install` 成功。
- [ ] `pnpm dev` 可同时启动前后端。
- [ ] `pnpm --filter @vibetree/server start` 可在生产模式下提供前端静态文件。
- [ ] 用户可添加本地 Git 项目。
- [ ] 用户可查看 main worktree 和已有 worktree。
- [ ] 用户可创建新 worktree。
- [ ] 用户可删除 clean 且无运行 terminal 的非 main worktree。
- [ ] 用户可为任一 worktree 打开一个或多个网页 terminal。
- [ ] terminal 的 `cwd` 始终等于 worktree path。
- [ ] terminal 输入输出、resize、关闭、刷新恢复可用。
- [ ] 后端重启后旧 running terminal 会标记为 `disconnected`。
- [ ] 后端只监听 `127.0.0.1`。
- [ ] 不存在 token 鉴权。
- [ ] 不存在任意命令 HTTP API。
- [ ] `pnpm typecheck`、`pnpm test`、`pnpm build` 通过。
- [ ] 浏览器烟测通过。
- [ ] README 与真实启动方式一致。

## 2. 基础约束

- [ ] 固定 Node 版本为 22 LTS，并在根目录写 `.nvmrc`。
- [ ] 根目录 `package.json` 写 `engines.node` 要求。
- [ ] README 明确当前本机 Node 25 不是验收环境。
- [ ] 目标平台定为 Linux/macOS 优先，Windows 不纳入 v1 交付标准。
- [ ] v1 仅做 localhost 本地工具，不做远程访问能力。
- [ ] v1 不做 CI。
- [ ] v1 不做 Tauri/Electron。
- [ ] v1 不做 terminal output 持久化。
- [ ] v1 不做 force remove worktree。
- [ ] v1 不做复杂 Git GUI。

## 3. Monorepo 初始化

- [ ] 创建根目录 `package.json`。
- [ ] 创建 `pnpm-workspace.yaml`。
- [ ] 创建 `tsconfig.base.json`。
- [ ] 创建 `.gitignore`。
- [ ] 创建 `.nvmrc`。
- [ ] 创建 `README.md`。
- [ ] 创建 `.env.example`。
- [ ] 约定 web build 输出目录与 server 读取路径。
- [ ] 创建 `apps/server`。
- [ ] 创建 `apps/web`。
- [ ] 创建 `packages/shared`。
- [ ] 为三个 package 分别创建 `package.json`。
- [ ] 为三个 package 分别创建 `tsconfig.json`。
- [ ] 配置根脚本：
- [ ] `dev`
- [ ] `dev:web`
- [ ] `dev:server`
- [ ] `build`
- [ ] `typecheck`
- [ ] `test`
- [ ] `lint`
- [ ] `test:e2e`
- [ ] 配置生产 build 串联：
- [ ] 先构建 shared
- [ ] 再构建 web
- [ ] 最后构建 server

## 4. 依赖安装与工具链

- [ ] server 安装：
- [ ] `fastify`
- [ ] `@fastify/cors`
- [ ] `@fastify/websocket`
- [ ] `better-sqlite3`
- [ ] `execa`
- [ ] `node-pty`
- [ ] `nanoid`
- [ ] `zod` 或等价输入校验库
- [ ] web 安装：
- [ ] `react`
- [ ] `react-dom`
- [ ] `zustand`
- [ ] `tailwindcss`
- [ ] `@radix-ui/*` 或 `shadcn/ui` 依赖
- [ ] `lucide-react`
- [ ] `@xterm/xterm`
- [ ] `@xterm/addon-fit`
- [ ] `@xterm/addon-web-links`
- [ ] shared 安装 TypeScript 基础依赖。
- [ ] 安装测试工具：
- [ ] `vitest`
- [ ] `supertest`
- [ ] `playwright`
- [ ] `ws`
- [ ] 安装 lint/format 工具：
- [ ] `eslint`
- [ ] `typescript-eslint`
- [ ] React ESLint 插件
- [ ] `prettier`

## 5. Shared Package

- [ ] 创建共享类型文件。
- [ ] 定义 `Project`。
- [ ] 定义 `Worktree`。
- [ ] 定义 `TerminalSession`。
- [ ] 定义 `TerminalStatus`。
- [ ] 定义 `CreateProjectInput`。
- [ ] 定义 `CreateWorktreeInput`。
- [ ] 定义 `CreateTerminalInput`。
- [ ] 定义 `UpdateTerminalInput`。
- [ ] 定义统一错误响应 `ApiErrorPayload`。
- [ ] 定义 WebSocket client message 类型。
- [ ] 定义 WebSocket server message 类型。
- [ ] 保证所有共享对象对外使用 camelCase。
- [ ] 为共享协议补最小类型测试或编译测试。

## 6. Server 基础骨架

- [ ] 创建 `apps/server/src/index.ts`。
- [ ] 创建 `apps/server/src/app.ts`。
- [ ] 创建 `apps/server/src/config.ts`。
- [ ] 创建 `apps/server/src/types` 或等价目录。
- [ ] 创建 `apps/server/src/utils`。
- [ ] 配置 Fastify logger。
- [ ] 注册 CORS，允许本地前端开发访问。
- [ ] 注册 WebSocket 插件。
- [ ] 注册健康检查路由。
- [ ] 注册 projects 路由。
- [ ] 注册 worktrees 路由。
- [ ] 注册 terminals 路由。
- [ ] 注册 terminal WebSocket 路由。
- [ ] 注册生产静态文件服务。
- [ ] 注册 SPA fallback 路由。
- [ ] 加入统一 error handler。

## 7. 配置系统

- [ ] `host` 默认 `127.0.0.1`。
- [ ] `port` 默认 `3767`。
- [ ] `databasePath` 默认 `~/.vibetree/vibetree.sqlite`。
- [ ] `defaultShell` 按平台推导。
- [ ] `terminal.cols` 默认 `120`。
- [ ] `terminal.rows` 默认 `30`。
- [ ] `terminal.scrollback` 默认 `10000`。
- [ ] Linux 默认 shell 取 `process.env.SHELL || /bin/bash`。
- [ ] macOS 默认 shell 取 `process.env.SHELL || /bin/zsh`。
- [ ] Windows 默认 shell 记为 `powershell.exe`，但不纳入验收。
- [ ] README 写明可用环境变量。

## 8. 数据库

- [ ] 创建 `~/.vibetree` 目录初始化逻辑。
- [ ] 创建 `schema.sql`。
- [ ] 建立 `projects` 表。
- [ ] 建立 `worktrees` 表。
- [ ] 建立 `terminal_sessions` 表。
- [ ] 建立必要索引。
- [ ] 启用 `PRAGMA foreign_keys = ON`。
- [ ] 建立 `database.ts`。
- [ ] 启动时执行 schema 初始化。
- [ ] 启动时执行 `markAllRunningAsDisconnected`。

## 9. Repository 层

- [ ] 创建 `project.repository.ts`。
- [ ] 创建 `worktree.repository.ts`。
- [ ] 创建 `terminal.repository.ts`。
- [ ] 实现 row -> domain mapper。
- [ ] 实现 domain -> row mapper。
- [ ] `projectRepo` 支持：
- [ ] `findAll`
- [ ] `findById`
- [ ] `findByRepoPath`
- [ ] `insert`
- [ ] `delete`
- [ ] `worktreeRepo` 支持：
- [ ] `findById`
- [ ] `findByProjectId`
- [ ] `findByPath`
- [ ] `upsert`
- [ ] `delete`
- [ ] `deleteMissingForProject`
- [ ] `terminalRepo` 支持：
- [ ] `findAll`
- [ ] `findById`
- [ ] `findByWorktreeId`
- [ ] `insert`
- [ ] `updateStatus`
- [ ] `updatePidAndStatus`
- [ ] `markExited`
- [ ] `markRunningAsDisconnected`
- [ ] `countByWorktreeId`
- [ ] `countRunningByWorktreeId`
- [ ] `delete`

## 10. AppError 与错误码

- [ ] 创建 `AppError`。
- [ ] 统一错误 payload 为 `{ error: { code, message } }`。
- [ ] 加入 `PROJECT_*` 错误码。
- [ ] 加入 `WORKTREE_*` 错误码。
- [ ] 加入 `TERMINAL_*` 错误码。
- [ ] 未知错误统一映射为 `INTERNAL_ERROR`。
- [ ] 不向前端暴露堆栈。

## 11. Git 模块

- [ ] 创建 `git.service.ts`。
- [ ] 创建 `git.parser.ts`。
- [ ] 创建 `git.types.ts`。
- [ ] 封装 `runGit(args, cwd)`。
- [ ] 限制只允许白名单 Git 子命令。
- [ ] 实现 `isGitRepository`。
- [ ] 实现 `getRepoRoot`。
- [ ] 实现 `listWorktrees`。
- [ ] 实现 `parseWorktreePorcelain`。
- [ ] 实现 `isWorktreeDirty`。
- [ ] 实现 `refExists`。
- [ ] 实现 `branchExists`。
- [ ] 实现 `createWorktree`。
- [ ] 实现 `removeWorktree`。
- [ ] 将 Git stderr/stdout 转译为业务错误。

## 12. 路径安全

- [ ] 创建 `path-safety.ts`。
- [ ] 实现 `normalizePath`。
- [ ] 实现 `assertPathInside(parent, child)`。
- [ ] 所有新建 worktree path 都必须经过 `assertPathInside`。
- [ ] 禁止创建到 `worktreeBasePath` 之外。
- [ ] 删除 worktree 前确认 path 来自 Git worktree list。
- [ ] 任何路径删除都不能直接 `rm -rf`。

## 13. Project 模块

- [ ] 创建 `project.service.ts`。
- [ ] 创建 `project.types.ts`。
- [ ] 实现默认 `worktreeBasePath` 计算。
- [ ] 实现项目创建。
- [ ] 实现项目列表查询。
- [ ] 实现项目删除。
- [ ] 实现项目 refresh。
- [ ] 项目创建时自动调用 `syncProjectWorktrees`。
- [ ] 项目删除时若存在 running terminal 则拒绝。
- [ ] 删除项目时不删除磁盘文件。

## 14. Worktree 模块

- [ ] 创建 `worktree.service.ts`。
- [ ] 创建 `worktree.types.ts`。
- [ ] 实现 `syncProjectWorktrees(projectId)`。
- [ ] 通过 `project.repoPath` 判断 `isMain`。
- [ ] 实现 worktree 名称推导。
- [ ] 实现 worktree 列表查询。
- [ ] 实现 create worktree。
- [ ] 实现 remove worktree。
- [ ] 实现 refresh worktree dirty。
- [ ] 新建 worktree 时校验：
- [ ] project 存在
- [ ] path 不存在
- [ ] path 在 `worktreeBasePath` 内
- [ ] `baseRef` 存在
- [ ] branch 不存在
- [ ] 删除 worktree 时校验：
- [ ] 非 main
- [ ] 非 dirty
- [ ] 无 running terminal
- [ ] path 仍存在于 Git worktree list
- [ ] 删除成功后刷新 project worktrees。

## 15. Terminal 持久层与服务层

- [ ] 创建 `terminal.service.ts`。
- [ ] 创建 `terminal.types.ts`。
- [ ] 定义 `TerminalStatus` 流转规则。
- [ ] 实现 `GET /api/terminals` 时的 runtime reconcile。
- [ ] 实现 terminal 创建。
- [ ] 实现 terminal 重命名。
- [ ] 实现 terminal 删除。
- [ ] 实现 terminal restart。
- [ ] 创建 terminal 时固定 `cwd = worktree.path`。
- [ ] 创建 terminal 时 worktree path 不存在要报错。
- [ ] restart 仅允许 `exited|killed|disconnected`。
- [ ] 删除 running terminal 时要先 kill PTY 再删记录。
- [ ] 文档和实现都明确：用户主动关闭后的 terminal 不支持 restart。

## 16. PtyManager

- [ ] 创建 `pty.manager.ts`。
- [ ] 创建 `pty.types.ts`。
- [ ] 创建 `RingBuffer`。
- [ ] `PtyManager` 维护内存 `sessions` map。
- [ ] 实现 `create`。
- [ ] 实现 `get`。
- [ ] 实现 `has`。
- [ ] 实现 `write`。
- [ ] 实现 `resize`。
- [ ] 实现 `kill`。
- [ ] 实现 `attachClient`。
- [ ] 实现 `detachClient`。
- [ ] 实现 `detachClientFromAll`。
- [ ] `onData` 时广播输出并写入 ring buffer。
- [ ] `onExit` 时更新 DB、通知客户端并移除 runtime。
- [ ] 注入 `VIBETREE_*` 环境变量。

## 17. WebSocket

- [ ] 创建 `websocket/terminal.ws.ts`。
- [ ] 创建 `websocket/protocol.ts`。
- [ ] 实现 `/ws/terminal`。
- [ ] 支持 `attach`。
- [ ] 支持 `input`。
- [ ] 支持 `resize`。
- [ ] 支持 `close`。
- [ ] `attach` 成功后发送 `attached`。
- [ ] `attach` 成功后回放 ring buffer。
- [ ] runtime 不存在时将 terminal 标记为 `disconnected`。
- [ ] WebSocket 关闭时只 detach client，不 kill PTY。
- [ ] 所有 message 校验失败时返回 `error` 消息。

## 18. HTTP API

- [ ] 创建 `health.routes.ts`。
- [ ] 创建 `projects.routes.ts`。
- [ ] 创建 `worktrees.routes.ts`。
- [ ] 创建 `terminals.routes.ts`。
- [ ] 实现 `GET /health`。
- [ ] 实现 `GET /api/projects`。
- [ ] 实现 `POST /api/projects`。
- [ ] 实现 `DELETE /api/projects/:projectId`。
- [ ] 实现 `POST /api/projects/:projectId/refresh`。
- [ ] 实现 `GET /api/projects/:projectId/worktrees`。
- [ ] 实现 `POST /api/projects/:projectId/worktrees`。
- [ ] 实现 `DELETE /api/worktrees/:worktreeId`。
- [ ] 实现 `POST /api/worktrees/:worktreeId/refresh`。
- [ ] 实现 `GET /api/terminals`。
- [ ] 实现 `POST /api/worktrees/:worktreeId/terminals`。
- [ ] 实现 `PATCH /api/terminals/:terminalId`。
- [ ] 实现 `DELETE /api/terminals/:terminalId`。
- [ ] 实现 `POST /api/terminals/:terminalId/restart`。
- [ ] 所有路由接入输入校验。
- [ ] 生产模式下 server 可返回 web `index.html` 和静态资源。

## 19. Web 前端基础骨架

- [ ] 初始化 Vite React TypeScript 应用。
- [ ] 接入 Tailwind。
- [ ] 接入基础 UI 组件体系。
- [ ] 创建 `App.tsx`。
- [ ] 创建 `main.tsx`。
- [ ] 创建全局样式。
- [ ] 创建 API 模块目录。
- [ ] 创建 store 模块目录。
- [ ] 创建 ws 模块目录。
- [ ] 创建 layout 组件目录。
- [ ] 创建 sidebar 组件目录。
- [ ] 创建 terminal 组件目录。
- [ ] 创建 dialogs 组件目录。
- [ ] 配置 web build 输出可被 server 静态托管。

## 20. API Client 与前端数据访问

- [ ] 实现 `api/client.ts`。
- [ ] 默认 `API_BASE = http://127.0.0.1:3767`。
- [ ] 允许从 localStorage 覆盖 `apiBase`。
- [ ] 删除任何 token 读取逻辑。
- [ ] 生产模式下默认 API_BASE 兼容同源访问。
- [ ] 实现 projects API 封装。
- [ ] 实现 worktrees API 封装。
- [ ] 实现 terminals API 封装。
- [ ] 请求失败时统一抛出服务端错误 message。

## 21. Zustand Stores

- [ ] 实现 `project.store.ts`。
- [ ] 实现 `terminal.store.ts`。
- [ ] 实现 `ui.store.ts`。
- [ ] `projectStore` 支持：
- [ ] `loadProjects`
- [ ] `loadProjectWorktrees`
- [ ] `addProject`
- [ ] `refreshProject`
- [ ] `createWorktree`
- [ ] `removeWorktree`
- [ ] `terminalStore` 支持：
- [ ] `loadTerminals`
- [ ] `openTerminalForWorktree`
- [ ] `createTerminal`
- [ ] `closeTerminal`
- [ ] `renameTerminal`
- [ ] `restartTerminal`
- [ ] `setActiveTerminal`
- [ ] `uiStore` 支持：
- [ ] dialogs open/close
- [ ] sidebar 状态
- [ ] 项目展开状态
- [ ] active terminal 本地持久化

## 22. 应用启动与恢复流程

- [ ] App mount 时加载 projects。
- [ ] App mount 时逐个加载 worktrees。
- [ ] App mount 时加载 terminals。
- [ ] 恢复 `activeTerminalId`。
- [ ] 初始化 WebSocket 单例连接。
- [ ] 若存在 active terminal，则自动 attach。
- [ ] 若保存的 `activeTerminalId` 已失效，则回退到第一个 terminal 或空状态。
- [ ] 在开发模式和生产同源模式下都验证启动流程。

## 23. Layout 与基础 UI

- [ ] 实现 `AppLayout`。
- [ ] 实现 `Header`。
- [ ] 实现 `Sidebar`。
- [ ] 实现主内容区。
- [ ] Header 显示应用名。
- [ ] Header 提供 Add Project 按钮。
- [ ] Header 提供 Refresh All 按钮。
- [ ] Header 显示 running terminal 数。
- [ ] Header 提供 Settings 按钮。
- [ ] Sidebar 固定宽度并可滚动。
- [ ] 空状态 UI 覆盖：
- [ ] 无项目
- [ ] 有项目无 terminal

## 24. Project / Worktree Sidebar

- [ ] 实现 `ProjectItem`。
- [ ] 实现 `WorktreeItem`。
- [ ] 项目支持展开/折叠。
- [ ] Worktree 显示名称。
- [ ] Worktree 显示 branch 或 main 标识。
- [ ] Worktree 显示 dirty/clean。
- [ ] Worktree 显示 running terminal 数。
- [ ] 点击 worktree 打开 terminal。
- [ ] Worktree 行操作菜单包含：
- [ ] refresh
- [ ] create worktree
- [ ] remove worktree

## 25. Dialogs

- [ ] 实现 `AddProjectDialog`。
- [ ] 字段包含 `repoPath`。
- [ ] 字段包含可选 `worktreeBasePath`。
- [ ] 表单错误做行内提示。
- [ ] 实现 `CreateWorktreeDialog`。
- [ ] 字段包含 `branch`。
- [ ] 字段包含 `baseRef`。
- [ ] 字段包含 `path`。
- [ ] 可选展示 `name` 字段，但服务端以计算值为准。
- [ ] 实现 `RemoveWorktreeDialog`。
- [ ] 根据 main/dirty/running 给出禁用原因。
- [ ] 实现 `SettingsDialog`。
- [ ] 仅提供 `apiBase` 与基础信息，不扩展多余配置。

## 26. Terminal Tabs

- [ ] 实现 `TerminalTabs`。
- [ ] 实现 `TerminalTab`。
- [ ] tab 显示 title。
- [ ] tab 显示 status。
- [ ] tab 可关闭。
- [ ] active tab 可高亮。
- [ ] `disconnected` tab 有明显标记。
- [ ] `exited` tab 有明显标记。
- [ ] 关闭 active tab 后切换到相邻 tab 或空状态。
- [ ] 仅对异常退出或 disconnected terminal 展示 restart 动作。

## 27. Terminal Pane 与 Xterm

- [ ] 实现 `TerminalPane`。
- [ ] 实现 `XtermView`。
- [ ] 集成 `@xterm/xterm`。
- [ ] 集成 `FitAddon`。
- [ ] 可选集成 `WebLinksAddon`。
- [ ] 渲染 active terminal。
- [ ] `term.onData` 发送 WebSocket input。
- [ ] 收到 `output` 时写入 xterm。
- [ ] 收到 `exit` 时写出退出提示。
- [ ] 使用 `ResizeObserver` 做 fit。
- [ ] fit 后发送 resize 到后端。
- [ ] 切换 terminal 时重新 attach。
- [ ] 刷新页面后重新 attach active terminal。

## 28. TerminalSocket

- [ ] 实现 `ws/terminal-socket.ts`。
- [ ] 单例持有一个浏览器 WebSocket。
- [ ] 实现自动重连。
- [ ] 实现 message queue。
- [ ] 实现 `connect()`。
- [ ] 实现 `send()`。
- [ ] 实现 `attach()`。
- [ ] 实现 `input()`。
- [ ] 实现 `resize()`。
- [ ] 实现 `close()`。
- [ ] 实现 `onMessage()` 订阅。
- [ ] 重连后自动 attach 当前 active terminal。
- [ ] 其他 running terminal 仅在切到 active 时 attach。

## 29. 状态与交互细节

- [ ] `openTerminalForWorktree` 优先复用最近活跃的 running terminal。
- [ ] 没有 running terminal 时自动创建新的 terminal。
- [ ] worktree 创建成功后刷新项目列表。
- [ ] worktree 删除成功后关闭相关 terminal tab。
- [ ] terminal rename 立即更新 tab 标题。
- [ ] terminal restart 成功后自动激活。
- [ ] 所有 mutation 操作给出 loading 状态。
- [ ] 所有失败操作给出 toast。
- [ ] 不做后台高频轮询。

## 30. 本地安全边界

- [ ] 不实现 token。
- [ ] 不实现 auth middleware。
- [ ] 不实现 `/api/exec`。
- [ ] 默认仅监听 `127.0.0.1`。
- [ ] README 明确这是本地工具，不适合暴露到局域网或公网。
- [ ] 所有 worktree 删除都经由 `git worktree remove`。
- [ ] 所有路径校验保守失败。

## 31. 日志与可观测性

- [ ] 记录 HTTP 请求。
- [ ] 记录项目创建/删除。
- [ ] 记录 worktree 创建/删除。
- [ ] 记录 terminal 创建/退出。
- [ ] 记录 ws attach/detach。
- [ ] 记录 Git 命令失败。
- [ ] 不记录 terminal 输入内容。
- [ ] 不记录 terminal 输出内容。

## 32. 边界条件处理

- [ ] Git repo 被外部删除时，project refresh 返回明确错误。
- [ ] worktree 被外部删除时，refresh 后从列表移除。
- [ ] 被外部删除的 worktree 对应 terminal 标记 `disconnected`。
- [ ] 浏览器刷新不影响 PTY 存活。
- [ ] 后端重启时所有 running terminal 标记为 `disconnected`。
- [ ] attach 一个不存在的 terminal 返回 `TERMINAL_NOT_FOUND`。
- [ ] attach 一个无 runtime 的 running terminal 返回 `PTY_NOT_FOUND`。

## 33. 测试

### 单元测试

- [ ] `parseWorktreePorcelain`
- [ ] `assertPathInside`
- [ ] `defaultWorktreeBasePath`
- [ ] `getWorktreeName`
- [ ] repository mappers
- [ ] error serialization
- [ ] terminal status reconcile

### 集成测试

- [ ] 使用临时 Git repo 进行测试。
- [ ] 测试添加 project。
- [ ] 测试列出 main worktree。
- [ ] 测试创建新 worktree。
- [ ] 测试 dirty 检测。
- [ ] 测试删除 clean worktree。
- [ ] 测试 main/dirty/running worktree 删除失败。
- [ ] 测试创建 terminal 后 `pwd` 输出正确。
- [ ] 测试 `echo $VIBETREE_WORKTREE_PATH` 输出正确。
- [ ] 测试 ws attach/input/output/resize。
- [ ] 测试 server boot 后 `running -> disconnected`。

### 浏览器烟测

- [ ] 启动前后端。
- [ ] 打开首页。
- [ ] 添加本地测试 repo。
- [ ] 看到 main worktree。
- [ ] 点击 worktree 打开 terminal。
- [ ] 执行 `pwd`。
- [ ] 断言输出为 worktree path。

## 34. README 与文档

- [ ] README 写项目简介。
- [ ] README 写功能范围。
- [ ] README 写非目标。
- [ ] README 写 Node 版本要求。
- [ ] README 写 `node-pty` 原生依赖要求。
- [ ] README 写启动命令。
- [ ] README 写测试命令。
- [ ] README 写生产构建与 `server start` 启动方式。
- [ ] README 写已知限制。
- [ ] README 写手动验收步骤。
- [ ] docs 下补一份简版架构说明或数据流说明。

## 35. 最终验收

- [ ] 本地 `pnpm install` 通过。
- [ ] 本地 `pnpm typecheck` 通过。
- [ ] 本地 `pnpm test` 通过。
- [ ] 本地 `pnpm build` 通过。
- [ ] 本地 `pnpm test:e2e` 通过。
- [ ] 本地 `pnpm --filter @vibetree/server start` 后可直接从 `127.0.0.1:3767` 打开应用。
- [ ] 手动验收以下命令链路：
- [ ] `pwd`
- [ ] `git branch --show-current`
- [ ] `echo $VIBETREE_WORKTREE_PATH`
- [ ] 验证一个 worktree 开多个 terminal。
- [ ] 验证浏览器刷新后可恢复 attach。
- [ ] 验证后端重启后 terminal 变 `disconnected`。
- [ ] 验证删除 clean worktree 成功。
- [ ] 验证删除 main/dirty/running worktree 被拒绝。
