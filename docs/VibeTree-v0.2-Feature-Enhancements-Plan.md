# VibeTree v0.2 功能增强方案

## Context

VibeTree 是一个本地 git worktree + 终端管理 Web App（pnpm monorepo：`packages/shared` 共享类型、`apps/server` Fastify 后端 + SQLite、`apps/web` React19 + Vite + Tailwind + Zustand + xterm.js）。

用户在实际使用中遇到 6 个痛点，需要补齐：

1. **终端只能单开**——一次只显示一个终端，无法在网页上同步摆放多个（如左一右二），无法对照多个 worktree 工作。
2. **新建 worktree 后要手动装依赖**——每个 repo 安装方式不同，缺少 per-repo 的 setup 脚本。
3. **主分支被写死成 `main`**——很多 repo 主分支不是 `main`（如 `master`/`develop`），创建 worktree 的 baseRef 默认值不对。
4. **创建入口和分支选择不好用**——`+` 按钮挂在每个 worktree 上（应只挂在 repo 名上）；baseRef 是自由文本框，应改成可搜索的分支下拉，默认主分支。
5. **worktree 难以区分**——列表里只显示分支名，缺少自定义显示名。
6. **Add Project 要手敲路径**——希望有文件夹选择器。

预期结果：终端可网格分屏；每个 repo 可配 setup 脚本与主分支；创建 worktree 入口收敛到 repo 名上、支持搜索分支选择 base、可填自定义名；Add Project 可通过服务端目录浏览器选路径。

## 已确认的关键决策

- **分屏库**：`react-mosaic-component`（二叉树平铺，原生支持拖拽分割/调整大小/重排，契合"左一右二"）。
- **setup 脚本执行**：新建 worktree 后自动开一个**可见终端**，在 worktree 目录里跑脚本，输出实时显示（复用现有 PTY 基建）。
- **文件夹选择**：**服务端目录浏览器**（后端列目录 API + 前端目录选择器）。浏览器原生 `showDirectoryPicker()` 拿不到绝对路径，不可用，放弃。

## 关键约束 / 注意点

- **自定义名字会被同步覆盖**：`worktree.service.ts:64` 的 `syncProjectWorktrees` 每次都用分支名重新生成 `name`。必须新增独立的 `displayName` 字段，且在 sync 时保留 `existing?.displayName`（见 `worktree.service.ts:61-73`）。
- **git 命令白名单**：`git.service.ts:6-12` 的 `ALLOWED_COMMANDS` 限制了可执行命令。新增分支列表、主分支探测要用到 `for-each-ref`、`symbolic-ref`，需加入白名单。
- **SQLite 迁移**：`schema.sql` 用 `CREATE TABLE IF NOT EXISTS`，对已存在的库新增列要在 `db/database.ts` 里加幂等的 `ALTER TABLE ... ADD COLUMN` 迁移。
- **project 仓库缺 update**：`project.repository.ts` 只有 insert/delete，编辑 repo 设置（主分支/setup 脚本）需要新增 `update`，并把新列加进 insert 语句与 `rowToProject`。

---

## 实施方案

### A. 数据模型与共享类型（地基，先做）

**`packages/shared/src/types.ts`**
- `Project` 增加：`mainBranch: string`、`setupScript: string | null`。
- `Worktree` 增加：`displayName: string | null`。
- `CreateWorktreeInput`：保留 `name?`，语义改为 displayName；`path` 改为可选（后端按 base path + 名字推导）。
- `CreateProjectInput` 增加可选 `mainBranch?`、`setupScript?`；新增 `UpdateProjectInput`（`name?`、`mainBranch?`、`setupScript?`、`worktreeBasePath?`）。

**`apps/server/src/db/schema.sql`** + **`db/database.ts`**
- schema.sql 给 `projects` 加 `main_branch TEXT NOT NULL DEFAULT 'main'`、`setup_script TEXT`；给 `worktrees` 加 `display_name TEXT`。
- database.ts 加幂等迁移：启动时检测列是否存在（`PRAGMA table_info`），缺失则 `ALTER TABLE ADD COLUMN`。

**`db/repositories/project.repository.ts`**
- `ProjectRow`、`rowToProject`、`insert` 加入新列；新增 `update(project)` 方法（`UPDATE projects SET name=@name, main_branch=@mainBranch, setup_script=@setupScript, worktree_base_path=@worktreeBasePath, updated_at=@updatedAt WHERE id=@id`）。

**`db/repositories/worktree.repository.ts`**
- `upsert`/`rowToWorktree` 加入 `display_name` 映射。

### B. 后端：主分支探测、分支列表、目录浏览、setup 脚本

**`apps/server/src/modules/git/git.service.ts`**
- `ALLOWED_COMMANDS` 加入 `'for-each-ref'`、`'symbolic-ref'`。
- 新增 `listBranches(repoPath): Promise<{ local: string[]; remote: string[] }>`：用 `for-each-ref --format=%(refname:short) refs/heads refs/remotes`。
- 新增 `detectDefaultBranch(repoPath): Promise<string>`：依次尝试 `symbolic-ref refs/remotes/origin/HEAD`、检测 `main`/`master` 是否存在（`branchExists`），兜底返回当前 HEAD 分支名。

**`apps/server/src/modules/projects/project.service.ts`**
- `createProject`：调用 `detectDefaultBranch(repoRoot)` 填充 `mainBranch`（用户未显式传则用探测值），`setupScript` 取自 input。
- 新增 `updateProject(id, input: UpdateProjectInput)`：校验后调用 `projectRepo.update`。
- 新增 `listBranches(id)`：取 project 后调 `git.listBranches`。

**目录浏览（新模块）`apps/server/src/modules/fs/fs.service.ts`**
- `listDirectory(dirPath)`：返回 `{ path, parent, entries: {name, path, isDir}[] }`，只列目录，用 `node:fs`。无 path 时默认用户 home（`os.homedir()`）。做基本安全（拒绝非绝对路径）。

**setup 脚本执行（在 worktree 创建流程里）`apps/server/src/modules/worktrees/worktree.service.ts`**
- `createWorktree` 末尾：若 `project.setupScript` 非空，创建一个终端会话（复用 `terminal.service` 的 createTerminal），cwd=新 worktree 路径，并把 setup 脚本作为初始输入写入 PTY（或以 `bash -lc "<script>"` 作为 shell 启动）。推荐做法：createTerminal 时把脚本作为首条 input 写进去，这样用户能看到完整输出。
- 该终端 title 标记为 `setup`，前端自动激活并放入分屏。

**路由**
- `routes/projects.routes.ts`：加 `PATCH /api/projects/:projectId`（updateProject）、`GET /api/projects/:projectId/branches`（listBranches）。
- 新增 `routes/fs.routes.ts`：`GET /api/fs/list?path=...`（listDirectory），在 `app.ts` 注册。
- `routes/worktrees.routes.ts`：`createWorktreeSchema` 把 `path` 改为可选、`name` 透传为 displayName。

### C. 前端

**依赖**：`apps/web` 安装 `react-mosaic-component`（含其 CSS）。

**C1. 终端网格分屏（核心改造）**
- 新增 `stores/layout.store.ts`（Zustand）：保存 mosaic 布局树 `MosaicNode<string>`（叶子=terminalId）、持久化到 localStorage。提供 `addPaneForTerminal(terminalId)`、`removePane(terminalId)`、`onLayoutChange(tree)`。
- 新增 `components/terminal/TerminalMosaic.tsx`：用 `<Mosaic>` 渲染，每个窗格 `<MosaicWindow>` 标题=worktree displayName/分支，内容=已有的 `TerminalPane`/`XtermView`。窗口 toolbar 提供「分屏（split）」「关闭」按钮。
- 改 `components/layout/AppLayout.tsx`：主区域用 `TerminalMosaic` 替换原「TerminalTabs + 单 TerminalPane」。`TerminalTabs` 可保留为「未入网格的终端」抽屉或直接弃用。
- 交互设计：
  - 点击 worktree → `openTerminalForWorktree` 拿到 terminalId → 加入 mosaic（若已在布局中则聚焦）。
  - 每个窗格右上角：split 按钮（把当前窗格一分为二，新窗格可挑选/新建终端）、关闭按钮（从布局移除，不杀终端可选）。
  - 拖拽窗格边界调整大小、拖拽标题重排——mosaic 原生支持。
  - `XtermView` 已用 `ResizeObserver` 自适应（`XtermView.tsx:58-67`），分屏 resize 天然兼容。

**C2. `+` 按钮移到 repo 名上（feature 4）**
- `components/sidebar/WorktreeItem.tsx`：移除 Plus 按钮（保留 trash）。
- `components/sidebar/ProjectItem.tsx`：在 project 名行 hover 区加 Plus 按钮 → `openDialog('createWorktree', { projectId })`。

**C3. 创建 worktree 弹窗改造 `components/dialogs/CreateWorktreeDialog.tsx`**
- 新增**可搜索分支下拉**作为 Base Ref：组件 `components/ui/BranchSelect.tsx`，打开弹窗时 `GET /api/projects/:id/branches`，输入框过滤本地/远程分支，默认值=project.mainBranch。
- 新增 **Custom Name** 输入（可选）→ 提交到 `name`(displayName)。
- Branch Name 仍必填（新分支名）；**Path 改为自动推导**（base path + 名字/分支 slug），默认隐藏，提供「高级」可展开覆盖。
- 提交 payload：`{ branch, baseRef, name?, path? }`。

**C4. 自定义名字展示 `components/sidebar/WorktreeItem.tsx`**
- 标题优先显示 `worktree.displayName ?? worktree.name`；分支名作副标题。
- mosaic 窗格标题同样优先 displayName。

**C5. repo 主分支 + setup 脚本配置 UI**
- `components/dialogs/AddProjectDialog.tsx`：加 Main Branch 输入（占位提示「留空自动探测」）、Setup Script 多行 textarea（可选）。
- 新增/复用 `components/dialogs/ProjectSettingsDialog.tsx`（编辑已有 repo 的 name / mainBranch / setupScript / worktreeBasePath）→ `PATCH /api/projects/:id`；入口放 `ProjectItem` hover 的齿轮按钮。`ui.store.ts` 的 `DialogType` 加 `'projectSettings'`。

**C6. Add Project 文件夹选择器（feature 6）**
- 新增 `components/dialogs/DirectoryPicker.tsx`：调用 `GET /api/fs/list?path=`，列出目录、可进入子目录/上级、面包屑导航、选中确认。
- `AddProjectDialog.tsx`：Repository Path 旁的 `FolderOpen` 按钮（已 import 但未用，见 `AddProjectDialog.tsx:2`）打开 DirectoryPicker，选中后回填绝对路径。Worktree Base Path 同样可用。

**前端 API/Store 接线**
- `api/projects.api.ts`：加 `updateProject`、`listBranches`。
- 新增 `api/fs.api.ts`：`listDirectory`。
- `stores/project.store.ts`：`createWorktree` 透传新字段；加 `updateProject`、`listBranches`。

---

## 建议实施顺序

1. **A 地基**：shared 类型 + schema 迁移 + repo update（编译通过）。
2. **B 后端**：git 探测/分支列表、目录浏览、setup 执行、路由（可用 curl 验证）。
3. **C2/C3/C4/C5 侧栏与弹窗**：主分支、setup 配置、`+` 收敛、分支搜索、自定义名。
4. **C6 目录选择器**。
5. **C1 终端分屏**（最大改造，独立验证）。

## 验证

- **编译**：根目录 `pnpm -r build`（或各包 `tsc`），确保 shared/server/web 类型通过。先确认现有 build 脚本（`package.json`）。
- **后端 API**（启动 server 后 curl）：
  - `GET /api/projects/:id/branches` 返回本地+远程分支。
  - `POST /api/projects` 对主分支为 `master` 的 repo，`mainBranch` 自动探测为 `master`。
  - `PATCH /api/projects/:id` 改 setupScript 后 `GET` 能读到。
  - `GET /api/fs/list?path=/home/...` 返回目录项。
- **端到端**（浏览器 `pnpm dev`，参考现有 dev 脚本）：
  1. Add Project：点文件夹按钮选路径 → 添加成功，主分支自动识别。
  2. 在 repo 名上点 `+` → baseRef 默认主分支、可搜索切换分支、填自定义名 → 创建后侧栏显示自定义名。
  3. 若配了 setup 脚本，创建后自动弹出终端并执行、可见输出。
  4. 点多个 worktree → 终端进入 mosaic 网格；拖拽分割成「左一右二」、调整大小、关闭窗格；刷新页面布局保持（localStorage）。
- **回归**：旧数据库（无新列）启动时迁移成功不报错；已有 worktree `displayName` 为空时回退显示分支名；`refreshProject` 后自定义名不丢失。
