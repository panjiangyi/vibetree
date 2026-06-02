# VibeTree Implementation Doc v0.1

## 0. 文档目标

本文档用于指导 **VibeTree v1** 的工程实现。

VibeTree 的核心目标是：

> 构建一个本地运行的 Web 应用，用于管理 Git worktree，并为每个 worktree 创建、恢复、关闭和删除网页 terminal session。

工程实现需要保证以下核心约束：

1. Terminal 必须 attach 到某个 Worktree。
2. Terminal 的 cwd 必须等于 Worktree.path。
3. 后端通过 node-pty 启动真实 shell。
4. 前端通过 xterm.js 渲染 terminal。
5. Terminal I/O 通过 WebSocket 实时传输。
6. Git worktree 操作只通过受控 API 暴露，不提供任意命令执行 HTTP API。

## 1. 技术栈选择

### 1.1 总体技术栈

推荐第一版采用 TypeScript 全栈，减少上下文切换。

| 层级 | 技术 | 说明 |
|---|---|---|
| Frontend | React + Vite + TypeScript | 单页应用 |
| UI | Tailwind CSS + Radix UI / shadcn/ui | 快速构建桌面感 UI |
| Terminal UI | xterm.js | 浏览器 terminal 渲染 |
| Backend | Node.js + Fastify + TypeScript | HTTP API |
| WebSocket | ws 或 @fastify/websocket | Terminal I/O |
| PTY | node-pty | 启动真实 shell |
| DB | SQLite | 本地状态存储 |
| ORM / Query | better-sqlite3 或 Drizzle | 第一版建议 better-sqlite3 |
| Git | child_process / execa | 调用 Git CLI |
| Package Manager | pnpm | monorepo 友好 |
| Desktop 包装，P1 | Tauri / Electron | v1 可先不做 |

### 1.2 推荐版本

```txt
Node.js >= 20
pnpm >= 9
TypeScript >= 5
React >= 18
Vite >= 5
Fastify >= 4
xterm >= 5
node-pty >= 1
better-sqlite3 >= 9
```

### 1.3 为什么不用复杂架构

VibeTree 是 **Local First DevTool**，第一版不要引入：

- Kubernetes
- Redis
- MQ
- 多服务拆分
- 云端账号系统
- 复杂权限系统
- GraphQL
- Electron 主进程复杂通信

第一版只需要：

```txt
一个 Node 后端
一个 React 前端
一个 SQLite 数据库
一个 WebSocket 通道
多个 PTY 进程
```

## 2. 仓库结构

### 2.1 推荐 Monorepo 结构

```txt
vibetree/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── README.md
├── .gitignore
├── .env.example
│
├── apps/
│   ├── web/
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── index.html
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── App.tsx
│   │       ├── styles/
│   │       │   └── globals.css
│   │       ├── components/
│   │       │   ├── layout/
│   │       │   ├── sidebar/
│   │       │   ├── terminal/
│   │       │   ├── dialogs/
│   │       │   └── ui/
│   │       ├── hooks/
│   │       ├── stores/
│   │       ├── api/
│   │       ├── ws/
│   │       ├── types/
│   │       └── utils/
│   │
│   └── server/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── app.ts
│           ├── config.ts
│           ├── db/
│           │   ├── database.ts
│           │   ├── schema.sql
│           │   ├── migrations/
│           │   └── repositories/
│           ├── modules/
│           │   ├── projects/
│           │   ├── worktrees/
│           │   ├── terminals/
│           │   ├── git/
│           │   ├── pty/
│           │   └── security/
│           ├── routes/
│           │   ├── projects.routes.ts
│           │   ├── worktrees.routes.ts
│           │   ├── terminals.routes.ts
│           │   └── health.routes.ts
│           ├── websocket/
│           │   ├── terminal.ws.ts
│           │   └── protocol.ts
│           ├── utils/
│           └── types/
│
└── packages/
    └── shared/
        ├── package.json
        ├── tsconfig.json
        └── src/
            ├── types.ts
            ├── api.ts
            └── terminal-protocol.ts
```

### 2.2 package.json 示例

根目录：

```json
{
  "name": "vibetree",
  "private": true,
  "scripts": {
    "dev": "pnpm -r --parallel dev",
    "dev:web": "pnpm --filter @vibetree/web dev",
    "dev:server": "pnpm --filter @vibetree/server dev",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint"
  },
  "packageManager": "pnpm@9.0.0"
}
```

`pnpm-workspace.yaml`：

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

## 3. 运行模型

### 3.1 本地运行模式

第一版运行方式：

```bash
pnpm install
pnpm dev
```

启动后：

```txt
Frontend: http://127.0.0.1:5173
Backend:  http://127.0.0.1:3767
WebSocket: ws://127.0.0.1:3767/ws/terminal
```

### 3.2 生产运行模式

构建：

```bash
pnpm build
```

运行：

```bash
pnpm --filter @vibetree/server start
```

生产模式中，后端可以 serve 前端静态文件：

```txt
http://127.0.0.1:3767
```

要让这个模式真实可用，工程实现还需要补上：

- Web 前端产物输出目录约定
- 后端静态文件服务
- SPA history fallback
- 生产模式下前端 API / WebSocket 基址处理

### 3.3 数据存储位置

建议使用用户目录下的应用数据目录。

macOS：

```txt
~/Library/Application Support/VibeTree/vibetree.sqlite
```

Linux：

```txt
~/.local/share/vibetree/vibetree.sqlite
```

Windows：

```txt
%APPDATA%/VibeTree/vibetree.sqlite
```

第一版也可以简单放在：

```txt
~/.vibetree/vibetree.sqlite
~/.vibetree/config.json
```

推荐第一版：

```txt
~/.vibetree/
├── vibetree.sqlite
├── config.json
└── logs/
```

## 4. 后端架构

### 4.1 后端模块划分

```txt
server/src/
├── modules/
│   ├── projects/
│   │   ├── project.service.ts
│   │   ├── project.repository.ts
│   │   └── project.types.ts
│   │
│   ├── worktrees/
│   │   ├── worktree.service.ts
│   │   ├── worktree.repository.ts
│   │   └── worktree.types.ts
│   │
│   ├── terminals/
│   │   ├── terminal.service.ts
│   │   ├── terminal.repository.ts
│   │   └── terminal.types.ts
│   │
│   ├── git/
│   │   ├── git.service.ts
│   │   ├── git.parser.ts
│   │   └── git.types.ts
│   │
│   ├── pty/
│   │   ├── pty.manager.ts
│   │   ├── pty.session.ts
│   │   └── pty.types.ts
│   │
│   └── security/
│       └── path-safety.ts
```

### 4.2 Fastify 初始化

`server/src/index.ts`：

```ts
import { buildApp } from './app'
import { getConfig } from './config'

async function main() {
  const config = getConfig()
  const app = await buildApp(config)

  await app.listen({
    host: config.host,
    port: config.port
  })

  console.log(`VibeTree server running at http://${config.host}:${config.port}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

`server/src/app.ts`：

```ts
import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import cors from '@fastify/cors'
import { registerProjectRoutes } from './routes/projects.routes'
import { registerWorktreeRoutes } from './routes/worktrees.routes'
import { registerTerminalRoutes } from './routes/terminals.routes'
import { registerHealthRoutes } from './routes/health.routes'
import { registerTerminalWebSocket } from './websocket/terminal.ws'

export async function buildApp(config: AppConfig) {
  const app = Fastify({
    logger: true
  })

  await app.register(cors, {
    origin: true
  })

  await app.register(websocket)

  await registerHealthRoutes(app)
  await registerProjectRoutes(app)
  await registerWorktreeRoutes(app)
  await registerTerminalRoutes(app)

  registerTerminalWebSocket(app)

  return app
}
```

## 5. 配置系统

### 5.1 Config 类型

```ts
export type AppConfig = {
  host: string
  port: number
  databasePath: string
  defaultShell: string
  terminal: {
    cols: number
    rows: number
    scrollback: number
  }
}
```

### 5.2 默认配置

```ts
export function getConfig(): AppConfig {
  return {
    host: process.env.VIBETREE_HOST ?? '127.0.0.1',
    port: Number(process.env.VIBETREE_PORT ?? 3767),
    databasePath: process.env.VIBETREE_DB ?? getDefaultDbPath(),
    defaultShell: getPlatformDefaultShell(),
    terminal: {
      cols: 120,
      rows: 30,
      scrollback: 10000
    }
  }
}
```

### 5.3 默认 Shell

```ts
function getPlatformDefaultShell() {
  if (process.platform === 'win32') {
    return 'powershell.exe'
  }

  if (process.platform === 'darwin') {
    return process.env.SHELL || '/bin/zsh'
  }

  return process.env.SHELL || '/bin/bash'
}
```

macOS 默认可用：

```txt
/bin/zsh
```

Linux 默认可用：

```txt
/bin/bash
```

Windows 第一版可先支持：

```txt
powershell.exe
```

node-pty 在 Windows 需要额外注意 conpty 支持。

## 6. 数据库设计

### 6.1 使用 SQLite

推荐：

```ts
better-sqlite3
```

原因：

- 简单。
- 同步 API 易用。
- 本地应用性能足够。
- 不需要连接池。

### 6.2 Schema

`server/src/db/schema.sql`：

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  repo_path TEXT NOT NULL UNIQUE,
  worktree_base_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS worktrees (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  branch TEXT,
  head TEXT,
  is_main INTEGER NOT NULL DEFAULT 0,
  is_dirty INTEGER NOT NULL DEFAULT 0,
  created_by_app INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS terminal_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  worktree_id TEXT NOT NULL,
  title TEXT NOT NULL,
  shell TEXT NOT NULL,
  cwd TEXT NOT NULL,
  status TEXT NOT NULL,
  pid INTEGER,
  cols INTEGER NOT NULL DEFAULT 120,
  rows INTEGER NOT NULL DEFAULT 30,
  exit_code INTEGER,
  last_active_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (worktree_id) REFERENCES worktrees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_worktrees_project_id
ON worktrees(project_id);

CREATE INDEX IF NOT EXISTS idx_terminal_sessions_worktree_id
ON terminal_sessions(worktree_id);

CREATE INDEX IF NOT EXISTS idx_terminal_sessions_status
ON terminal_sessions(status);
```

### 6.3 为什么 terminal_sessions 不 cascade 物理进程

数据库删除只是数据层行为。PTY 是内存进程，必须由 `PtyManager` 显式 kill。

所以删除 Project 或 Worktree 前要：

1. 查找关联 running terminal。
2. 如果存在，阻止删除。
3. 不允许数据库 cascade 间接删除 running session。

### 6.4 DB 初始化

```ts
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

export function createDatabase(databasePath: string) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true })

  const db = new Database(databasePath)
  db.pragma('foreign_keys = ON')

  const schema = fs.readFileSync(
    path.join(__dirname, 'schema.sql'),
    'utf8'
  )

  db.exec(schema)

  return db
}
```

## 7. 类型定义

建议 `packages/shared/src/types.ts` 放共享类型。

```ts
export type Project = {
  id: string
  name: string
  repoPath: string
  worktreeBasePath: string
  createdAt: string
  updatedAt: string
}

export type Worktree = {
  id: string
  projectId: string
  name: string
  path: string
  branch: string | null
  head: string | null
  isMain: boolean
  isDirty: boolean
  createdByApp: boolean
  createdAt: string
  updatedAt: string
}

export type TerminalStatus =
  | 'running'
  | 'exited'
  | 'killed'
  | 'disconnected'

export type TerminalSession = {
  id: string
  projectId: string
  worktreeId: string
  title: string
  shell: string
  cwd: string
  status: TerminalStatus
  pid: number | null
  cols: number
  rows: number
  exitCode: number | null
  lastActiveAt: string | null
  createdAt: string
  updatedAt: string
}
```

## 8. Git 模块实现

### 8.1 GitService 职责

`GitService` 只负责 Git 相关操作：

- 校验 Git repo。
- 读取 worktree list。
- 创建 worktree。
- 删除 worktree。
- 获取 dirty 状态。
- 校验 ref 是否存在。
- 获取当前 branch/head。

不要在 GitService 里操作数据库。数据库同步由 WorktreeService 负责。

### 8.2 执行命令封装

推荐使用 `execa`。

```ts
import { execa } from 'execa'

export async function runGit(args: string[], cwd: string) {
  const result = await execa('git', args, {
    cwd,
    reject: false
  })

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || 'Git command failed')
  }

  return result.stdout
}
```

### 8.3 校验 Git 仓库

```ts
export async function isGitRepository(path: string): Promise<boolean> {
  try {
    const stdout = await runGit(['rev-parse', '--is-inside-work-tree'], path)
    return stdout.trim() === 'true'
  } catch {
    return false
  }
}
```

### 8.4 获取 repo root

```ts
export async function getRepoRoot(path: string): Promise<string> {
  return runGit(['rev-parse', '--show-toplevel'], path)
}
```

### 8.5 读取 worktree list

命令：

```bash
git worktree list --porcelain
```

输出示例：

```txt
worktree /Users/me/code/my-app
HEAD a1b2c3d4
branch refs/heads/main

worktree /Users/me/code/my-app-worktrees/feature-login
HEAD e5f6g7h8
branch refs/heads/feature-login
```

解析函数：

```ts
export type GitWorktreeInfo = {
  path: string
  head: string | null
  branch: string | null
  detached: boolean
  bare: boolean
}

export function parseWorktreePorcelain(output: string): GitWorktreeInfo[] {
  const blocks = output
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean)

  return blocks.map((block) => {
    const info: GitWorktreeInfo = {
      path: '',
      head: null,
      branch: null,
      detached: false,
      bare: false
    }

    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) {
        info.path = line.slice('worktree '.length)
      } else if (line.startsWith('HEAD ')) {
        info.head = line.slice('HEAD '.length)
      } else if (line.startsWith('branch ')) {
        const ref = line.slice('branch '.length)
        info.branch = ref.replace(/^refs\/heads\//, '')
      } else if (line === 'detached') {
        info.detached = true
      } else if (line === 'bare') {
        info.bare = true
      }
    }

    return info
  })
}
```

### 8.6 判断 dirty

```ts
export async function isWorktreeDirty(worktreePath: string): Promise<boolean> {
  const stdout = await runGit(['status', '--porcelain'], worktreePath)
  return stdout.trim().length > 0
}
```

注意：

- `git status --porcelain` 对大仓库可能较慢。
- v1 可以手动刷新。
- 后续可以加节流和后台定时刷新。

### 8.7 创建 worktree

```ts
export async function createWorktree(input: {
  repoPath: string
  branch: string
  path: string
  baseRef: string
}) {
  await runGit(
    ['worktree', 'add', '-b', input.branch, input.path, input.baseRef],
    input.repoPath
  )
}
```

如果支持使用已有分支，命令变为：

```bash
git worktree add <path> <branch>
```

v1 先只支持创建新分支，逻辑更简单。

### 8.8 删除 worktree

```ts
export async function removeWorktree(input: {
  repoPath: string
  path: string
}) {
  await runGit(['worktree', 'remove', input.path], input.repoPath)
}
```

v1 不提供 force remove。

### 8.9 校验 base ref

```ts
export async function refExists(repoPath: string, ref: string): Promise<boolean> {
  try {
    await runGit(['rev-parse', '--verify', ref], repoPath)
    return true
  } catch {
    return false
  }
}
```

## 9. Project 模块实现

### 9.1 ProjectService 职责

- 添加 Project。
- 校验 repo path。
- 创建默认 worktree base path。
- 保存 Project。
- 初始化同步 worktree。
- 删除 Project 记录。
- 刷新 Project worktrees。

### 9.2 添加 Project 流程

```txt
POST /api/projects
  ↓
校验 repoPath 存在
  ↓
校验 repoPath 是 Git repo
  ↓
获取 repo root
  ↓
检查 repo root 未重复添加
  ↓
生成 Project name
  ↓
生成 worktreeBasePath
  ↓
保存 Project
  ↓
syncProjectWorktrees(projectId)
  ↓
返回 Project
```

### 9.3 添加 Project 伪代码

```ts
async function createProject(input: CreateProjectInput): Promise<Project> {
  const repoRoot = await git.getRepoRoot(input.repoPath)

  const exists = projectRepo.findByRepoPath(repoRoot)
  if (exists) {
    throw new AppError('PROJECT_EXISTS', 'Project already exists')
  }

  const isRepo = await git.isGitRepository(repoRoot)
  if (!isRepo) {
    throw new AppError('INVALID_GIT_REPO', 'Path is not a Git repository')
  }

  const now = new Date().toISOString()

  const project: Project = {
    id: createId('proj'),
    name: input.name ?? path.basename(repoRoot),
    repoPath: repoRoot,
    worktreeBasePath:
      input.worktreeBasePath ?? defaultWorktreeBasePath(repoRoot),
    createdAt: now,
    updatedAt: now
  }

  projectRepo.insert(project)

  await worktreeService.syncProjectWorktrees(project.id)

  return project
}
```

### 9.4 默认 worktree base path

```ts
function defaultWorktreeBasePath(repoPath: string) {
  const parent = path.dirname(repoPath)
  const name = path.basename(repoPath)
  return path.join(parent, `${name}-worktrees`)
}
```

## 10. Worktree 模块实现

### 10.1 WorktreeService 职责

- 同步 Git worktree 到 DB。
- 创建 worktree。
- 删除 worktree。
- 刷新 dirty 状态。
- 校验删除安全性。
- 提供 worktree 查询。

### 10.2 同步 Project Worktrees

同步逻辑：

```txt
读取 git worktree list
  ↓
对每个 git worktree:
    计算 name
    判断是否 main
    获取 dirty
    upsert 到 DB
  ↓
DB 中不存在于 git list 的 worktree:
    如果没有 running terminal，则删除或标记失效
```

v1 建议：直接删除 DB 中已不存在的 worktree，但前提是没有 running terminal。

### 10.3 main worktree 判断

Git worktree list 第一个通常是 main worktree，但不要完全依赖顺序。
更可靠方式：

```txt
main worktree path === project.repoPath
```

```ts
const isMain = normalizePath(gitWorktree.path) === normalizePath(project.repoPath)
```

### 10.4 Worktree name 生成

优先级：

1. 如果是 main worktree：`main`
2. 如果有 branch：取 branch 最后一段或完整 branch
3. 否则取 path basename

示例：

```ts
function getWorktreeName(info: GitWorktreeInfo, project: Project) {
  if (normalizePath(info.path) === normalizePath(project.repoPath)) {
    return 'main'
  }

  if (info.branch) {
    return info.branch.replace(/[\/\\]/g, '-')
  }

  return path.basename(info.path)
}
```

### 10.5 创建 Worktree 流程

```txt
POST /api/projects/:projectId/worktrees
  ↓
读取 Project
  ↓
校验 name / branch / baseRef / path
  ↓
校验 path 不存在
  ↓
校验 baseRef 存在
  ↓
校验 branch 不存在
  ↓
确保 path 在 worktreeBasePath 下
  ↓
git worktree add -b branch path baseRef
  ↓
syncProjectWorktrees
  ↓
返回新 Worktree
```

### 10.6 branch 是否存在

```ts
async function branchExists(repoPath: string, branch: string) {
  try {
    await runGit(['show-ref', '--verify', `refs/heads/${branch}`], repoPath)
    return true
  } catch {
    return false
  }
}
```

### 10.7 path 安全校验

必须防止用户输入：

```txt
/
~/Desktop
../../somewhere
```

v1 规则：

> 创建 worktree 时，path 必须位于 project.worktreeBasePath 内。

```ts
function assertPathInside(parent: string, child: string) {
  const resolvedParent = path.resolve(parent)
  const resolvedChild = path.resolve(child)

  const relative = path.relative(resolvedParent, resolvedChild)

  if (
    relative.startsWith('..') ||
    path.isAbsolute(relative)
  ) {
    throw new AppError('UNSAFE_PATH', 'Path is outside allowed directory')
  }
}
```

### 10.8 删除 Worktree 流程

```txt
DELETE /api/worktrees/:worktreeId
  ↓
读取 Worktree
  ↓
读取 Project
  ↓
如果 isMain，拒绝
  ↓
检查 dirty，dirty 拒绝
  ↓
检查 running terminals，存在则拒绝
  ↓
检查 path 存在于 git worktree list
  ↓
git worktree remove path
  ↓
删除 DB worktree 记录
  ↓
刷新 Project worktrees
```

### 10.9 删除安全检查代码草案

```ts
async function removeWorktree(worktreeId: string) {
  const wt = worktreeRepo.findById(worktreeId)
  if (!wt) throw new AppError('WORKTREE_NOT_FOUND', 'Worktree not found')

  if (wt.isMain) {
    throw new AppError('CANNOT_REMOVE_MAIN_WORKTREE', 'Cannot remove main worktree')
  }

  const runningCount = terminalRepo.countRunningByWorktreeId(worktreeId)
  if (runningCount > 0) {
    throw new AppError(
      'WORKTREE_HAS_RUNNING_TERMINALS',
      'Close terminals before removing worktree'
    )
  }

  const dirty = await git.isWorktreeDirty(wt.path)
  if (dirty) {
    throw new AppError('WORKTREE_DIRTY', 'Cannot remove dirty worktree')
  }

  const project = projectRepo.findById(wt.projectId)
  if (!project) throw new AppError('PROJECT_NOT_FOUND', 'Project not found')

  await git.removeWorktree({
    repoPath: project.repoPath,
    path: wt.path
  })

  worktreeRepo.delete(worktreeId)

  await syncProjectWorktrees(project.id)
}
```

## 11. Terminal / PTY 模块实现

### 11.1 关键设计

Terminal 分为两层：

| 层 | 说明 |
|---|---|
| TerminalSession DB Record | 持久化元数据 |
| PTY Process | 内存中的真实 shell 进程 |

`TerminalSession.status = running` 不一定代表 PTY 还活着。
页面恢复时必须通过 `PtyManager` 检查。

### 11.2 PtyManager 结构

```ts
import type { IPty } from 'node-pty'

type PtyRuntimeSession = {
  terminalId: string
  pty: IPty
  outputBuffer: RingBuffer<string>
  clients: Set<WebSocket>
  createdAt: string
}

export class PtyManager {
  private sessions = new Map<string, PtyRuntimeSession>()

  has(terminalId: string) {
    return this.sessions.has(terminalId)
  }

  get(terminalId: string) {
    return this.sessions.get(terminalId)
  }

  create(input: CreatePtyInput): PtyRuntimeSession {
    // ...
  }

  write(terminalId: string, data: string) {
    // ...
  }

  resize(terminalId: string, cols: number, rows: number) {
    // ...
  }

  kill(terminalId: string) {
    // ...
  }

  attachClient(terminalId: string, ws: WebSocket) {
    // ...
  }

  detachClient(terminalId: string, ws: WebSocket) {
    // ...
  }
}
```

### 11.3 TerminalService 职责

- 创建 TerminalSession。
- 校验 Worktree。
- 启动 PTY。
- 更新 session 状态。
- 关闭 session。
- 重启 session。
- 查询 sessions。
- 与 PtyManager 协作。

### 11.4 创建 Terminal 流程

```txt
POST /api/worktrees/:worktreeId/terminals
  ↓
读取 Worktree
  ↓
读取 Project
  ↓
校验 worktree path 存在
  ↓
创建 TerminalSession DB record
  ↓
PtyManager.create
  ↓
更新 pid/status
  ↓
返回 TerminalSession
```

### 11.5 创建 Terminal 代码草案

```ts
async function createTerminal(worktreeId: string, input: CreateTerminalInput) {
  const wt = worktreeRepo.findById(worktreeId)
  if (!wt) {
    throw new AppError('WORKTREE_NOT_FOUND', 'Worktree not found')
  }

  const project = projectRepo.findById(wt.projectId)
  if (!project) {
    throw new AppError('PROJECT_NOT_FOUND', 'Project not found')
  }

  if (!fs.existsSync(wt.path)) {
    throw new AppError('WORKTREE_PATH_NOT_FOUND', 'Worktree path not found')
  }

  const now = new Date().toISOString()
  const terminalId = createId('term')

  const session: TerminalSession = {
    id: terminalId,
    projectId: project.id,
    worktreeId: wt.id,
    title: input.title || defaultTerminalTitle(project, wt),
    shell: input.shell || config.defaultShell,
    cwd: wt.path,
    status: 'running',
    pid: null,
    cols: input.cols ?? 120,
    rows: input.rows ?? 30,
    exitCode: null,
    lastActiveAt: now,
    createdAt: now,
    updatedAt: now
  }

  terminalRepo.insert(session)

  const runtime = ptyManager.create({
    terminalId,
    shell: session.shell,
    cwd: wt.path,
    cols: session.cols,
    rows: session.rows,
    env: buildTerminalEnv(project, wt)
  })

  terminalRepo.updatePidAndStatus(terminalId, runtime.pty.pid, 'running')

  return terminalRepo.findById(terminalId)
}
```

### 11.6 默认 Terminal Title

```ts
function defaultTerminalTitle(project: Project, wt: Worktree) {
  const existingCount = terminalRepo.countByWorktreeId(wt.id)

  if (existingCount === 0) {
    return `${project.name}/${wt.name}`
  }

  return `${project.name}/${wt.name} #${existingCount + 1}`
}
```

### 11.7 PTY 启动

```ts
import pty from 'node-pty'

create(input: CreatePtyInput) {
  const ptyProcess = pty.spawn(input.shell, [], {
    name: 'xterm-256color',
    cols: input.cols,
    rows: input.rows,
    cwd: input.cwd,
    env: {
      ...process.env,
      ...input.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      VIBETREE: '1',
      VIBETREE_TERMINAL_ID: input.terminalId
    }
  })

  const runtime: PtyRuntimeSession = {
    terminalId: input.terminalId,
    pty: ptyProcess,
    outputBuffer: new RingBuffer<string>(5000),
    clients: new Set(),
    createdAt: new Date().toISOString()
  }

  ptyProcess.onData((data) => {
    runtime.outputBuffer.push(data)

    for (const client of runtime.clients) {
      sendWs(client, {
        type: 'output',
        terminalId: input.terminalId,
        data
      })
    }
  })

  ptyProcess.onExit(({ exitCode }) => {
    terminalRepo.markExited(input.terminalId, exitCode)
    this.sessions.delete(input.terminalId)

    for (const client of runtime.clients) {
      sendWs(client, {
        type: 'exit',
        terminalId: input.terminalId,
        exitCode
      })
    }
  })

  this.sessions.set(input.terminalId, runtime)

  return runtime
}
```

### 11.8 注入环境变量

```ts
function buildTerminalEnv(project: Project, wt: Worktree) {
  return {
    VIBETREE_PROJECT_ID: project.id,
    VIBETREE_PROJECT_NAME: project.name,
    VIBETREE_PROJECT_PATH: project.repoPath,
    VIBETREE_WORKTREE_ID: wt.id,
    VIBETREE_WORKTREE_NAME: wt.name,
    VIBETREE_WORKTREE_PATH: wt.path,
    VIBETREE_WORKTREE_BRANCH: wt.branch ?? ''
  }
}
```

这可以让用户在 shell 脚本中识别当前上下文。

### 11.9 输出 Buffer

v1 可以只做内存 buffer。

```ts
class RingBuffer<T> {
  private items: T[] = []

  constructor(private maxSize: number) {}

  push(item: T) {
    this.items.push(item)

    if (this.items.length > this.maxSize) {
      this.items.shift()
    }
  }

  toArray() {
    return [...this.items]
  }

  clear() {
    this.items = []
  }
}
```

Attach 时可以先发送历史输出：

```ts
for (const chunk of runtime.outputBuffer.toArray()) {
  sendWs(ws, {
    type: 'output',
    terminalId,
    data: chunk
  })
}
```

## 12. WebSocket 协议

### 12.1 WebSocket 路径

```txt
/ws/terminal
```

v1 只作为 localhost 本地工具运行，不做 token 或 header 鉴权。
安全边界依赖：

- 后端默认仅监听 `127.0.0.1`
- 不提供任意命令 HTTP API
- 所有 Git 和路径操作都走受控白名单

### 12.2 Client Message

```ts
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
```

### 12.3 Server Message

```ts
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
```

### 12.4 WebSocket attach 逻辑

```txt
收到 attach
  ↓
检查 terminal session 是否存在
  ↓
如果 DB status 是 running，但 PtyManager 无 runtime：
    标记为 disconnected
    返回 error 或 exit
  ↓
如果 runtime 存在：
    attach client
    resize
    发送 attached
    发送 outputBuffer
```

### 12.5 WebSocket handler 草案

```ts
export function registerTerminalWebSocket(app: FastifyInstance) {
  app.get('/ws/terminal', { websocket: true }, (connection, req) => {
    const ws = connection.socket

    ws.on('message', async (raw) => {
      try {
        const message = JSON.parse(raw.toString())

        switch (message.type) {
          case 'attach':
            await handleAttach(ws, message)
            break

          case 'input':
            await handleInput(ws, message)
            break

          case 'resize':
            await handleResize(ws, message)
            break

          case 'close':
            await handleClose(ws, message)
            break

          default:
            sendWs(ws, {
              type: 'error',
              message: 'Unknown message type'
            })
        }
      } catch (error) {
        sendWs(ws, {
          type: 'error',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    ws.on('close', () => {
      ptyManager.detachClientFromAll(ws)
    })
  })
}
```

### 12.6 handleAttach

```ts
async function handleAttach(ws: WebSocket, message: AttachMessage) {
  const session = terminalRepo.findById(message.terminalId)

  if (!session) {
    sendWs(ws, {
      type: 'error',
      terminalId: message.terminalId,
      code: 'TERMINAL_NOT_FOUND',
      message: 'Terminal not found'
    })
    return
  }

  const runtime = ptyManager.get(message.terminalId)

  if (!runtime) {
    terminalRepo.updateStatus(message.terminalId, 'disconnected')

    sendWs(ws, {
      type: 'error',
      terminalId: message.terminalId,
      code: 'PTY_NOT_FOUND',
      message: 'PTY process not found'
    })

    return
  }

  ptyManager.attachClient(message.terminalId, ws)
  ptyManager.resize(message.terminalId, message.cols, message.rows)

  sendWs(ws, {
    type: 'attached',
    terminalId: message.terminalId
  })

  for (const chunk of runtime.outputBuffer.toArray()) {
    sendWs(ws, {
      type: 'output',
      terminalId: message.terminalId,
      data: chunk
    })
  }
}
```

## 13. HTTP API 实现

### 13.1 统一响应格式

建议 v1 简单直接返回资源对象。错误统一：

```json
{
  "error": {
    "code": "WORKTREE_DIRTY",
    "message": "Cannot remove dirty worktree"
  }
}
```

### 13.2 AppError

```ts
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode = 400
  ) {
    super(message)
  }
}
```

Fastify error handler：

```ts
app.setErrorHandler((error, request, reply) => {
  if (error instanceof AppError) {
    reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message
      }
    })
    return
  }

  request.log.error(error)

  reply.status(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    }
  })
})
```

### 13.3 Project APIs

#### GET /api/projects

返回：

```json
[
  {
    "id": "proj_123",
    "name": "my-app",
    "repoPath": "/Users/me/code/my-app",
    "worktreeBasePath": "/Users/me/code/my-app-worktrees",
    "createdAt": "2026-06-02T12:00:00.000Z",
    "updatedAt": "2026-06-02T12:00:00.000Z"
  }
]
```

#### POST /api/projects

请求：

```json
{
  "repoPath": "/Users/me/code/my-app",
  "worktreeBasePath": "/Users/me/code/my-app-worktrees"
}
```

返回：

```json
{
  "id": "proj_123",
  "name": "my-app",
  "repoPath": "/Users/me/code/my-app",
  "worktreeBasePath": "/Users/me/code/my-app-worktrees",
  "createdAt": "2026-06-02T12:00:00.000Z",
  "updatedAt": "2026-06-02T12:00:00.000Z"
}
```

#### DELETE /api/projects/:projectId

规则：

- 如果 Project 下存在 running terminal，拒绝删除。
- 删除 Project 只删除 VibeTree 内记录。
- 不删除磁盘文件。

错误：

```json
{
  "error": {
    "code": "PROJECT_HAS_RUNNING_TERMINALS",
    "message": "Close terminals before removing project"
  }
}
```

#### POST /api/projects/:projectId/refresh

动作：

- 同步 worktree list。
- 刷新 dirty status。
- 返回最新 worktrees。

### 13.4 Worktree APIs

#### GET /api/projects/:projectId/worktrees

返回：

```json
[
  {
    "id": "wt_123",
    "projectId": "proj_123",
    "name": "main",
    "path": "/Users/me/code/my-app",
    "branch": "main",
    "head": "abc123",
    "isMain": true,
    "isDirty": false,
    "createdByApp": false,
    "createdAt": "2026-06-02T12:00:00.000Z",
    "updatedAt": "2026-06-02T12:00:00.000Z"
  }
]
```

#### POST /api/projects/:projectId/worktrees

请求：

```json
{
  "name": "feature-login",
  "branch": "feature-login",
  "baseRef": "main",
  "path": "/Users/me/code/my-app-worktrees/feature-login"
}
```

返回：

```json
{
  "id": "wt_456",
  "projectId": "proj_123",
  "name": "feature-login",
  "path": "/Users/me/code/my-app-worktrees/feature-login",
  "branch": "feature-login",
  "head": "abc123",
  "isMain": false,
  "isDirty": false,
  "createdByApp": true
}
```

#### DELETE /api/worktrees/:worktreeId

规则：

- main worktree 不可删。
- dirty worktree 不可删。
- 有 running terminal 不可删。

#### POST /api/worktrees/:worktreeId/refresh

动作：

- 刷新该 worktree dirty 状态。
- 返回最新 worktree。

### 13.5 Terminal APIs

#### GET /api/terminals

返回所有 terminal sessions：

```json
[
  {
    "id": "term_123",
    "projectId": "proj_123",
    "worktreeId": "wt_123",
    "title": "my-app/main",
    "shell": "zsh",
    "cwd": "/Users/me/code/my-app",
    "status": "running",
    "pid": 12345,
    "cols": 120,
    "rows": 30,
    "exitCode": null,
    "lastActiveAt": "2026-06-02T12:00:00.000Z",
    "createdAt": "2026-06-02T12:00:00.000Z",
    "updatedAt": "2026-06-02T12:00:00.000Z"
  }
]
```

重要：

- GET 时可以顺便 reconcile 一次 status。
- 如果 DB 是 running，但 PtyManager 没有 runtime，则改为 disconnected。

#### POST /api/worktrees/:worktreeId/terminals

请求：

```json
{
  "shell": "zsh",
  "title": "dev server",
  "cols": 120,
  "rows": 30
}
```

返回 TerminalSession。

#### PATCH /api/terminals/:terminalId

用于重命名或更新尺寸。

请求：

```json
{
  "title": "test watcher"
}
```

#### DELETE /api/terminals/:terminalId

规则：

- 如果 running：kill PTY，然后删除或标记 killed。
- 如果 exited/killed/disconnected：删除 DB record。

v1 推荐行为：

```txt
DELETE running terminal:
  kill PTY
  delete DB record

DELETE inactive terminal:
  delete DB record
```

如果想保留历史，改成 mark killed，不删记录。
为了 UI 简单，v1 可以“关闭即删除”。

这意味着：

- 用户主动关闭 terminal 后，不再保留可 restart 的 session record。
- `restart` 主要用于处理异常退出或后端重启后留下的 `exited` / `killed` / `disconnected` session。

#### POST /api/terminals/:terminalId/restart

规则：

- 只允许 exited/killed/disconnected。
- 使用相同 worktree。
- 使用相同 shell/title。
- 重新启动 PTY。
- 状态改为 running。

## 14. 安全设计

### 14.1 默认监听本机

配置：

```txt
host = 127.0.0.1
```

不要默认监听：

```txt
0.0.0.0
```

### 14.2 Localhost Only 模型

v1 只监听：

```txt
127.0.0.1
```

不做：

- token 鉴权
- HTTP 认证中间件
- WebSocket 鉴权

这意味着 VibeTree v1 的定位是：

> 仅供当前机器当前用户使用的本地开发工具。

README 必须明确说明：

- 不适合监听到 `0.0.0.0`
- 不适合暴露到局域网或公网

### 14.3 禁止任意命令 API

不要设计这种 API：

```txt
POST /api/exec
```

这是危险入口。

允许执行的操作必须是白名单：

- `git worktree list`
- `git worktree add`
- `git worktree remove`
- `git status`
- `git rev-parse`
- `git show-ref`

用户需要执行任意命令时，只能在 terminal 内执行。
这至少确保命令执行发生在用户显式打开的 PTY 中。

### 14.4 路径安全

所有文件系统操作必须基于：

- 已添加 Project 的 repoPath
- Git worktree list 返回的 path
- Project 的 worktreeBasePath

创建 worktree 时：

```txt
path 必须在 worktreeBasePath 下
```

删除 worktree 时：

```txt
path 必须存在于 git worktree list
并且不是 main worktree
并且没有 running terminal
并且不是 dirty
```

## 15. 前端架构

### 15.1 前端模块结构

```txt
web/src/
├── App.tsx
├── main.tsx
├── api/
│   ├── client.ts
│   ├── projects.api.ts
│   ├── worktrees.api.ts
│   └── terminals.api.ts
├── stores/
│   ├── project.store.ts
│   ├── terminal.store.ts
│   └── ui.store.ts
├── ws/
│   ├── terminal-socket.ts
│   └── protocol.ts
├── components/
│   ├── layout/
│   │   ├── AppLayout.tsx
│   │   ├── Header.tsx
│   │   └── Sidebar.tsx
│   ├── sidebar/
│   │   ├── ProjectTree.tsx
│   │   ├── ProjectItem.tsx
│   │   └── WorktreeItem.tsx
│   ├── terminal/
│   │   ├── TerminalTabs.tsx
│   │   ├── TerminalTab.tsx
│   │   ├── TerminalPane.tsx
│   │   └── XtermView.tsx
│   ├── dialogs/
│   │   ├── AddProjectDialog.tsx
│   │   ├── CreateWorktreeDialog.tsx
│   │   ├── RemoveWorktreeDialog.tsx
│   │   └── SettingsDialog.tsx
│   └── ui/
└── utils/
```

### 15.2 状态管理

推荐 Zustand。
需要三个 store：

| Store | 职责 |
|---|---|
| projectStore | projects + worktrees |
| terminalStore | terminal sessions + active tab |
| uiStore | dialogs/settings/sidebar 状态 |

### 15.3 projectStore

```ts
type ProjectStore = {
  projects: Project[]
  worktreesByProjectId: Record<string, Worktree[]>
  loadProjects: () => Promise<void>
  addProject: (input: AddProjectInput) => Promise<void>
  refreshProject: (projectId: string) => Promise<void>
  createWorktree: (
    projectId: string,
    input: CreateWorktreeInput
  ) => Promise<Worktree>
  removeWorktree: (worktreeId: string) => Promise<void>
}
```

### 15.4 terminalStore

```ts
type TerminalStore = {
  terminals: TerminalSession[]
  activeTerminalId: string | null

  loadTerminals: () => Promise<void>
  openTerminalForWorktree: (worktreeId: string) => Promise<void>
  createTerminal: (worktreeId: string) => Promise<TerminalSession>
  closeTerminal: (terminalId: string) => Promise<void>
  renameTerminal: (terminalId: string, title: string) => Promise<void>
  restartTerminal: (terminalId: string) => Promise<void>
  setActiveTerminal: (terminalId: string) => void
}
```

### 15.5 API Client

```ts
const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:3767'

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error?.message ?? 'Request failed')
  }

  return res.json()
}
```

## 16. 前端 UI 实现细节

### 16.1 AppLayout

```tsx
export function AppLayout() {
  return (
    <div className="h-screen w-screen bg-neutral-950 text-neutral-100 flex flex-col">
      <Header />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <TerminalTabs />
          <TerminalPane />
        </main>
      </div>
    </div>
  )
}
```

### 16.2 Header

内容：

```txt
VibeTree | Add Project | Refresh | Running: N | Settings
```

行为：

- Add Project 打开 dialog。
- Refresh 调用所有 project refresh。
- Running 统计 terminal status 为 running 的数量。
- Settings 打开设置。

### 16.3 Sidebar

Sidebar 需要：

- 固定宽度，比如 280px。
- 支持项目展开折叠。
- worktree item 点击打开 terminal。
- worktree item 右键菜单。

```tsx
export function Sidebar() {
  const { projects, worktreesByProjectId } = useProjectStore()

  return (
    <aside className="w-72 border-r border-neutral-800 flex flex-col">
      <div className="px-3 py-2 text-xs uppercase text-neutral-500">
        Projects
      </div>

      <div className="flex-1 overflow-auto">
        {projects.map((project) => (
          <ProjectItem
            key={project.id}
            project={project}
            worktrees={worktreesByProjectId[project.id] ?? []}
          />
        ))}
      </div>
    </aside>
  )
}
```

### 16.4 WorktreeItem 点击逻辑

```ts
async function handleClick() {
  await terminalStore.openTerminalForWorktree(worktree.id)
}
```

`openTerminalForWorktree` 行为：

```ts
const running = terminals
  .filter(t => t.worktreeId === worktreeId && t.status === 'running')
  .sort(byLastActiveDesc)

if (running[0]) {
  setActiveTerminal(running[0].id)
  return
}

const terminal = await createTerminal(worktreeId)
setActiveTerminal(terminal.id)
```

## 17. xterm.js 接入

### 17.1 安装依赖

```bash
pnpm --filter @vibetree/web add @xterm/xterm @xterm/addon-fit @xterm/addon-web-links
```

如果包名仍使用旧版：

```bash
pnpm add xterm xterm-addon-fit xterm-addon-web-links
```

### 17.2 XtermView 组件

关键要求：

- 每个 terminalId 对应一个 xterm 实例。
- 切换 tab 时不要销毁所有终端。
- v1 可以只渲染 active terminal，并依赖后端 buffer 恢复。
- 更好的体验：缓存 terminal instances。

第一版先实现简单版：

```tsx
import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

export function XtermView({ terminalId }: { terminalId: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
      theme: {
        background: '#0a0a0a',
        foreground: '#e5e5e5'
      },
      scrollback: 10000
    })

    const fitAddon = new FitAddon()

    term.loadAddon(fitAddon)
    term.open(containerRef.current)

    requestAnimationFrame(() => {
      fitAddon.fit()

      terminalSocket.attach({
        terminalId,
        cols: term.cols,
        rows: term.rows
      })
    })

    const disposable = term.onData((data) => {
      terminalSocket.input({
        terminalId,
        data
      })
    })

    termRef.current = term
    fitAddonRef.current = fitAddon

    const handleResize = () => {
      fitAddon.fit()
      terminalSocket.resize({
        terminalId,
        cols: term.cols,
        rows: term.rows
      })
    }

    window.addEventListener('resize', handleResize)

    const unsubscribe = terminalSocket.onMessage((message) => {
      if (message.terminalId !== terminalId) return

      if (message.type === 'output') {
        term.write(message.data)
      }

      if (message.type === 'exit') {
        term.writeln('')
        term.writeln(`Terminal exited with code ${message.exitCode ?? ''}`)
      }
    })

    term.focus()

    return () => {
      unsubscribe()
      window.removeEventListener('resize', handleResize)
      disposable.dispose()
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
    }
  }, [terminalId])

  return <div ref={containerRef} className="h-full w-full" />
}
```

### 17.3 ResizeObserver

比 window resize 更准确：

```ts
const resizeObserver = new ResizeObserver(() => {
  fitAddon.fit()
  terminalSocket.resize({
    terminalId,
    cols: term.cols,
    rows: term.rows
  })
})

resizeObserver.observe(containerRef.current)
```

需要做节流：

```ts
const resize = debounce(() => {
  fitAddon.fit()
  terminalSocket.resize({
    terminalId,
    cols: term.cols,
    rows: term.rows
  })
}, 100)
```

### 17.4 快捷键处理

xterm 默认会处理大部分 terminal 快捷键。
需要注意浏览器冲突：

- Ctrl+W：浏览器关闭标签页
- Ctrl+T：浏览器新标签页
- Ctrl+R：浏览器刷新
- Cmd+W / Cmd+T：macOS 浏览器快捷键

v1 不强制拦截全部。
如果要拦截：

```ts
term.attachCustomKeyEventHandler((event) => {
  const isMac = navigator.platform.toLowerCase().includes('mac')
  const meta = isMac ? event.metaKey : event.ctrlKey

  if (meta && event.key.toLowerCase() === 'w') {
    event.preventDefault()
    return false
  }

  return true
})
```

注意：过度拦截会让浏览器行为变奇怪。第一版谨慎处理。

## 18. TerminalSocket 前端封装

### 18.1 设计目标

前端只维护一个 WebSocket 连接，所有 terminal 通过消息中的 `terminalId` 区分。

### 18.2 TerminalSocket 类

```ts
type Listener = (message: TerminalServerMessage) => void

class TerminalSocket {
  private ws: WebSocket | null = null
  private listeners = new Set<Listener>()
  private queue: TerminalClientMessage[] = []

  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return

    const url = `ws://127.0.0.1:3767/ws/terminal`

    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      for (const message of this.queue) {
        this.send(message)
      }
      this.queue = []
    }

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data)
      for (const listener of this.listeners) {
        listener(message)
      }
    }

    this.ws.onclose = () => {
      setTimeout(() => this.connect(), 1000)
    }
  }

  send(message: TerminalClientMessage) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.queue.push(message)
      this.connect()
      return
    }

    this.ws.send(JSON.stringify(message))
  }

  attach(input: AttachMessage) {
    this.send({ type: 'attach', ...input })
  }

  input(input: InputMessage) {
    this.send({ type: 'input', ...input })
  }

  resize(input: ResizeMessage) {
    this.send({ type: 'resize', ...input })
  }

  close(terminalId: string) {
    this.send({ type: 'close', terminalId })
  }

  onMessage(listener: Listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

export const terminalSocket = new TerminalSocket()
```

### 18.3 断线重连策略

v1 简单策略：

- WebSocket close 后 1 秒重连。
- 重连后 active terminal 重新 attach。
- 所有 running terminal tab 在切换到 active 时重新 attach。

更完善策略：

- terminalStore 监听 socket connected。
- 对所有 visible / running terminal 重新 attach。

## 19. 页面恢复流程

### 19.1 App 启动时

```txt
App mounted
  ↓
GET /api/projects
  ↓
GET /api/projects/:id/worktrees
  ↓
GET /api/terminals
  ↓
恢复 activeTerminalId
  ↓
连接 WebSocket
  ↓
attach active terminal
```

### 19.2 activeTerminalId 持久化

可以存 localStorage：

```ts
localStorage.setItem('vibetree.activeTerminalId', terminalId)
```

启动时：

```ts
const saved = localStorage.getItem('vibetree.activeTerminalId')
if (saved && terminals.some(t => t.id === saved)) {
  setActiveTerminal(saved)
} else {
  setActiveTerminal(terminals[0]?.id ?? null)
}
```

## 20. UI 状态与交互细节

### 20.1 空状态

没有 project：

```txt
Welcome to VibeTree

Add your first Git project to start managing worktrees and terminals.

[Add Project]
```

有 project 但没有 terminal：

```txt
No terminal opened

Select a worktree from the left sidebar to open a terminal.
```

### 20.2 Worktree 状态展示

```tsx
function DirtyBadge({ dirty }: { dirty: boolean }) {
  return (
    <span className={dirty ? 'text-yellow-400' : 'text-neutral-500'}>
      {dirty ? 'dirty' : 'clean'}
    </span>
  )
}
```

### 20.3 Running terminal 数

```ts
const runningCountByWorktreeId = terminals.reduce((acc, t) => {
  if (t.status === 'running') {
    acc[t.worktreeId] = (acc[t.worktreeId] ?? 0) + 1
  }
  return acc
}, {} as Record<string, number>)
```

### 20.4 Remove Worktree Dialog

删除按钮禁用条件：

```ts
const disabled =
  worktree.isMain ||
  worktree.isDirty ||
  runningTerminalCount > 0
```

文案：

- main：`Main worktree cannot be removed.`
- dirty：`Dirty worktree cannot be removed in v1.`
- running：`Close running terminals before removing this worktree.`

## 21. 关键边界条件

### 21.1 Git repo 被外部删除

表现：

- Project refresh 失败。
- UI 显示 Project error 状态。
- 不自动删除 Project。

错误：

```txt
PROJECT_PATH_NOT_FOUND
```

### 21.2 Worktree 被外部删除

refresh 后：

- 如果没有 running terminal：从 DB 删除 worktree。
- 如果有 running terminal：标记异常，不允许继续创建新 terminal。

v1 简化：

- refresh 时如果 path 不存在，worktree 从列表移除。
- 相关 terminal 标记 disconnected。

### 21.3 PTY 进程异常退出

node-pty onExit：

- status 改为 exited。
- exitCode 写入 DB。
- 通知所有 WebSocket clients。
- 从 PtyManager 删除 runtime。

### 21.4 浏览器刷新

后端 PTY 不应受到影响。
刷新只会断开 WebSocket client。

流程：

```txt
browser reload
  ↓
ws close
  ↓
PtyManager detach client
  ↓
PTY continues running
  ↓
new page load
  ↓
GET /api/terminals
  ↓
WS attach
```

### 21.5 后端重启

后端重启后，所有 PTY 都会消失。

启动时需要：

```txt
把 DB 中 running terminal 标记为 disconnected
```

实现：

```ts
terminalRepo.markAllRunningAsDisconnected()
```

在 server boot 时执行。

## 22. 启动时恢复策略

### 22.1 Server Boot

```txt
server start
  ↓
init database
  ↓
mark all running sessions as disconnected
  ↓
start fastify
```

因为 PTY 是内存进程，后端重启后无法恢复旧 shell。

代码：

```ts
terminalRepo.markRunningAsDisconnected()
```

## 23. 错误码设计

### 23.1 Project 错误码

| 错误码 | 说明 |
|---|---|
| PROJECT_NOT_FOUND | 项目不存在 |
| PROJECT_EXISTS | 项目已添加 |
| INVALID_GIT_REPO | 不是 Git 仓库 |
| PROJECT_PATH_NOT_FOUND | 项目路径不存在 |
| PROJECT_HAS_RUNNING_TERMINALS | 项目下有运行终端 |

### 23.2 Worktree 错误码

| 错误码 | 说明 |
|---|---|
| WORKTREE_NOT_FOUND | worktree 不存在 |
| WORKTREE_PATH_EXISTS | 路径已存在 |
| WORKTREE_DIRTY | worktree 有未提交变更 |
| WORKTREE_HAS_RUNNING_TERMINALS | 有运行中的 terminal |
| CANNOT_REMOVE_MAIN_WORKTREE | 不能删除 main worktree |
| BASE_REF_NOT_FOUND | base ref 不存在 |
| BRANCH_EXISTS | 分支已存在 |
| UNSAFE_PATH | 不安全路径 |

### 23.3 Terminal 错误码

| 错误码 | 说明 |
|---|---|
| TERMINAL_NOT_FOUND | terminal 不存在 |
| PTY_NOT_FOUND | PTY 进程不存在 |
| TERMINAL_NOT_RUNNING | terminal 未运行 |
| WORKTREE_PATH_NOT_FOUND | worktree 路径不存在 |
| INVALID_TERMINAL_STATUS | terminal 状态不允许该操作 |

## 24. 日志设计

### 24.1 后端日志

Fastify logger 输出：

- HTTP 请求。
- API 错误。
- Git 命令错误。
- PTY exit。
- WebSocket attach/detach。

不要记录：

- terminal 输入内容。
- terminal 输出内容。
- 本地环境中的敏感路径或用户私有信息。

### 24.2 示例日志

```txt
[info] project.created proj_123 /Users/me/code/my-app
[info] worktree.created wt_456 feature-login
[info] terminal.created term_789 cwd=/Users/me/code/my-app-worktrees/feature-login
[info] terminal.exited term_789 code=0
[warn] terminal.disconnected term_123 pty_missing
```

## 25. 测试策略

### 25.1 单元测试

优先测试：

- `parseWorktreePorcelain`
- `assertPathInside`
- `defaultWorktreeBasePath`
- `getWorktreeName`
- repository mapper
- error handling

### 25.2 集成测试

可创建临时 Git repo：

```bash
mkdir /tmp/vibetree-test
cd /tmp/vibetree-test
git init
touch README.md
git add .
git commit -m "init"
git worktree add -b feature-login ../vibetree-test-feature-login main
```

测试：

- 添加 project。
- list worktrees。
- create worktree。
- remove worktree。
- detect dirty。

### 25.3 PTY 测试

可测试：

- 创建 terminal。
- 写入 `echo hello\n`。
- 收到 output。
- resize 不报错。
- kill 后 status 更新。

PTY 测试可能受平台影响，CI 中可减少覆盖，主要本地验证。

## 26. 开发里程碑

### 26.1 Milestone 1：基础后端

目标：跑通 API + DB + Git list。

任务：

1. 初始化 monorepo。
2. 初始化 Fastify。
3. 初始化 SQLite。
4. 实现 Project CRUD。
5. 实现 Git repo 校验。
6. 实现 git worktree list parser。
7. 实现 worktree sync。
8. 实现 GET projects/worktrees。

验收：

```txt
添加一个 Git repo 后，可以通过 API 看到 main worktree。
```

### 26.2 Milestone 2：Worktree 管理

目标：创建/删除 worktree。

任务：

1. 实现 create worktree API。
2. 实现 branch/baseRef/path 校验。
3. 实现 dirty 检测。
4. 实现 remove worktree API。
5. 实现删除保护。
6. 实现 refresh worktree。

验收：

```txt
可以通过 API 创建 feature-login worktree。
可以删除 clean 且无 terminal 的 worktree。
dirty/main/running worktree 删除会被拒绝。
```

### 26.3 Milestone 3：PTY + WebSocket

目标：浏览器之外先用 WebSocket 客户端跑通 terminal。

任务：

1. 集成 node-pty。
2. 实现 PtyManager。
3. 实现 terminal session DB。
4. 实现 create terminal API。
5. 实现 /ws/terminal。
6. 实现 attach/input/output/resize/close。
7. 实现 PTY exit 状态同步。

验收：

```txt
通过 WebSocket attach terminal 后，发送 "pwd\n"，输出必须是 worktree path。
```

### 26.4 Milestone 4：前端基础 UI

目标：看到项目树和 terminal tab。

任务：

1. 初始化 React + Vite。
2. 实现 AppLayout。
3. 实现 Header。
4. 实现 Sidebar。
5. 实现 Add Project dialog。
6. 实现 Project/Worktree store。
7. 实现 Terminal tabs。
8. 实现空状态。

验收：

```txt
前端可以添加 project，并展示 worktree tree。
点击 worktree 会创建 terminal tab。
```

### 26.5 Milestone 5：xterm.js 集成

目标：网页中可用 terminal。

任务：

1. 集成 xterm.js。
2. 实现 XtermView。
3. 实现 terminalSocket。
4. attach active terminal。
5. 输入输出联通。
6. resize 联通。
7. close tab 联通。
8. 页面刷新恢复 tabs。

验收：

```txt
点击 worktree 后打开网页 terminal。
执行 pwd 显示该 worktree path。
执行 vim/less/top 等 TUI 基本可用。
刷新页面后 terminal 仍可 attach。
```

### 26.6 Milestone 6：打磨与安全

目标：达到 v1 可用。

任务：

1. Localhost only 配置。
2. 路径安全。
3. 错误提示。
4. Remove Worktree dialog。
5. Settings 基础项。
6. Running count。
7. UI 状态优化。
8. 后端重启时 mark disconnected。
9. README 和启动脚本。

验收：

```txt
默认只监听 127.0.0.1。
没有 token 或 auth middleware。
不会误删 main/dirty/running worktree。
```

## 27. 推荐实现顺序

最稳的实现顺序如下：

```txt
1. server scaffold
2. db schema
3. project API
4. git worktree parser
5. worktree sync
6. create/remove worktree
7. terminal DB model
8. PtyManager
9. websocket terminal protocol
10. web scaffold
11. project/worktree sidebar
12. terminal tabs
13. xterm.js
14. refresh/restore
15. localhost-only safety
16. UI polish
```

不要先做 UI 大而全。
先把 **Git + PTY + WebSocket** 打通，这是系统骨架。

## 28. MVP 验收 Checklist

### 28.1 Project

- [ ] 可以添加 Git repo。
- [ ] 非 Git repo 会被拒绝。
- [ ] 重复 repo 会被拒绝。
- [ ] 可以列出 projects。
- [ ] 可以移除 project 记录。
- [ ] 有 running terminal 的 project 不可移除。

### 28.2 Worktree

- [ ] 可以列出 main worktree。
- [ ] 可以列出已有 worktree。
- [ ] 可以创建新 worktree。
- [ ] 可以刷新 dirty 状态。
- [ ] dirty 状态显示正确。
- [ ] main worktree 不可删除。
- [ ] dirty worktree 不可删除。
- [ ] 有 running terminal 的 worktree 不可删除。
- [ ] clean 且安全的 worktree 可以删除。

### 28.3 Terminal

- [ ] 点击 worktree 创建 terminal。
- [ ] terminal cwd 是 worktree path。
- [ ] 可以输入命令。
- [ ] 可以看到输出。
- [ ] Ctrl+C 可用。
- [ ] Tab 补全可用。
- [ ] 方向键可用。
- [ ] resize 可用。
- [ ] close terminal 可用。
- [ ] 一个 worktree 可创建多个 terminal。
- [ ] 页面刷新后 terminal 可恢复 attach。
- [ ] 后端重启后 running terminal 标记 disconnected。

### 28.4 Security

- [ ] 默认监听 `127.0.0.1`。
- [ ] 不存在 token 鉴权。
- [ ] 不存在 auth middleware。
- [ ] 不存在任意 HTTP exec API。
- [ ] 创建 worktree path 被限制在 worktreeBasePath。
- [ ] 删除 worktree 前做安全校验。

## 29. v1 关键技术风险

### 29.1 node-pty 安装风险

`node-pty` 涉及原生编译，可能在不同平台安装失败。

缓解：

- 文档中说明 Node 版本。
- macOS 需要 Xcode Command Line Tools。
- Windows 需要 Visual Studio Build Tools。
- 优先保证 macOS/Linux。

### 29.2 xterm resize 时机

如果容器还没布局完成，`fitAddon.fit()` 会算错。

缓解：

- 使用 `requestAnimationFrame`。
- 使用 `ResizeObserver`。
- Terminal container 必须有明确高度。

### 29.3 页面刷新输出丢失

如果只保留内存 buffer，后端未重启时可恢复；后端重启会丢失。

v1 可接受。
P1 再做持久化 output chunks。

### 29.4 Git status 慢

大仓库执行 `git status --porcelain` 可能慢。

v1：

- 手动 refresh 为主。
- 创建/删除后自动刷新。
- 不做高频轮询。

### 29.5 删除路径安全

这是高风险区域。

必须遵守：

```txt
永远不要直接 rm -rf。
删除 worktree 只调用 git worktree remove。
删除前确认 path 来自 git worktree list。
```

## 30. 最小可运行 Demo 目标

第一阶段最小 demo 可以是：

```txt
后端：
  - 添加 project
  - list worktrees
  - create terminal for worktree
  - websocket attach terminal

前端：
  - 输入 repo path
  - 显示 worktree list
  - 点击 worktree 打开 terminal
  - terminal 可执行 pwd
```

Demo 验收命令：

```bash
pwd
git branch --show-current
echo $VIBETREE_WORKTREE_PATH
```

预期：

```txt
pwd 输出对应 worktree path
git branch 输出对应 branch
VIBETREE_WORKTREE_PATH 输出对应 worktree path
```

## 31. 开发者启动命令草案

### 31.1 初始化

```bash
mkdir vibetree
cd vibetree
pnpm init
```

### 31.2 创建 apps

```bash
mkdir -p apps/server apps/web packages/shared
```

### 31.3 Server 依赖

```bash
pnpm --filter @vibetree/server add fastify @fastify/cors @fastify/websocket ws better-sqlite3 execa node-pty nanoid
pnpm --filter @vibetree/server add -D typescript tsx @types/node @types/ws
```

### 31.4 Web 依赖

```bash
pnpm --filter @vibetree/web add react react-dom zustand @xterm/xterm @xterm/addon-fit @xterm/addon-web-links
pnpm --filter @vibetree/web add -D vite typescript @types/react @types/react-dom
```

## 32. 最终实现原则

VibeTree 的实现要一直围绕这几条原则：

1. 不要做任意命令执行 API。
2. 不要让 terminal 脱离 worktree 存在。
3. 不要用文件删除替代 `git worktree remove`。
4. 不要在 v1 做复杂 Git GUI。
5. 不要在 v1 做复杂持久化 terminal replay。
6. 优先保证 PTY 稳定和 terminal 体验。
7. 所有删除操作都要保守。
8. 所有路径操作都要做安全校验。

## 33. v1 完成后的系统形态

v1 完成后，VibeTree 的工作方式应该是：

```txt
用户打开 VibeTree
  ↓
添加本地 Git 项目
  ↓
左侧看到 Project / Worktree 树
  ↓
点击某个 Worktree
  ↓
右侧打开 attach 到该 Worktree 的 Terminal
  ↓
用户像原生终端一样执行命令
  ↓
可以同时打开多个 Worktree 的多个 Terminal
  ↓
刷新页面后继续 attach
```

这就是 VibeTree 的最小闭环。它很窄，但很锋利。这个方向非常适合先做成一个稳定、好用、开发者愿意每天打开的本地工具。
