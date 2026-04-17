# 项目基础信息

本文档用于快速建立对当前仓库的基础认知。后续继续维护或扩展本项目时，建议先阅读本文档，再进入具体模块代码。

## 1. 项目定位

- 项目名称：`CLI Proxy API Management Center`
- 项目性质：一个基于 React + TypeScript 的单文件 Web 管理后台
- 核心用途：通过 CLI Proxy API 的 Management API 管理配置、凭据、AI Provider、OAuth、日志、配额和使用统计
- 重要边界：本仓库只包含 Web UI，不包含代理服务本体，也不负责流量转发

## 2. 技术栈

- 前端框架：`React 19`
- 语言：`TypeScript 5`
- 构建工具：`Vite 7`
- 路由：`react-router-dom v7`
- 状态管理：`Zustand`
- HTTP 客户端：`Axios`
- 图表：`Chart.js` + `react-chartjs-2`
- 编辑器：`CodeMirror 6`
- 样式：`SCSS Modules`
- 国际化：`i18next` + `react-i18next`
- 动效：`motion`

## 3. 项目结构概览

根目录关键文件：

- `package.json`：依赖、脚本、项目元信息
- `vite.config.ts`：Vite 构建配置，输出单文件 HTML
- `README.md` / `README_CN.md`：项目说明文档
- `index.html`：Vite 入口模板

`src` 目录关键分层：

- `main.tsx`：应用启动入口
- `App.tsx`：应用根组件，初始化主题、语言和路由
- `router/`：路由与登录保护
- `pages/`：页面级组件
- `components/`：通用组件与领域组件
- `features/`：特定业务模块，当前主要是 `authFiles`
- `stores/`：Zustand 状态层
- `services/api/`：后端 API 调用封装
- `services/storage/`：本地存储与管理密钥混淆存储
- `hooks/`：复用 hooks
- `utils/`：通用工具与格式化逻辑
- `types/`：类型定义
- `i18n/`：国际化资源
- `styles/`：全局样式、变量、mixins

## 4. 应用启动与主流程

应用主入口链路：

1. `src/main.tsx`
2. `src/App.tsx`
3. `ProtectedRoute`
4. `MainLayout`
5. `MainRoutes`

主流程说明：

- 页面加载时会初始化全局样式、标题、favicon
- `App.tsx` 中会初始化主题和语言
- 路由使用 `createHashRouter`
- 未登录用户会被 `ProtectedRoute` 重定向到 `/login`
- 登录后所有页面都渲染在 `MainLayout` 中
- `MainLayout` 负责顶部栏、侧边导航、主题切换、语言切换、刷新动作和页面切换动画

## 5. 页面地图

主要页面及职责如下：

- `LoginPage`
  - 输入 Management API 地址与管理密钥
  - 支持自动恢复登录态
  - 支持记住密钥

- `DashboardPage`
  - 展示连接状态、版本信息
  - 展示 API Keys、认证文件、Provider、模型数量等概览

- `ConfigPage`
  - 编辑 `/config.yaml`
  - 支持可视化编辑和源码编辑两种模式
  - 保存前会做 diff 对比确认

- `AiProvidersPage`
  - 管理 Gemini、Codex、Claude、Vertex、Ampcode、OpenAI Compatible Provider
  - 包含新增、编辑、删除、启停等动作

- `AuthFilesPage`
  - 管理 JSON 认证文件
  - 支持筛选、搜索、分页、批量操作
  - 同时管理 OAuth excluded models 和 model alias

- `OAuthPage`
  - 发起支持供应商的 OAuth / device code 登录流程
  - 支持 iFlow Cookie 导入
  - 支持 Vertex JSON 凭据导入

- `QuotaPage`
  - 展示与管理 Claude、Antigravity、Codex、Gemini CLI、Kimi 等配额信息

- `UsagePage`
  - 展示使用统计图表、模型/API 统计、Token 拆分、成本趋势

- `LogsPage`
  - 拉取和展示日志
  - 支持搜索、结构化过滤、自动刷新、错误日志下载、trace 定位

- `SystemPage`
  - 展示版本、模型列表、快速链接
  - 支持清理登录存储
  - 包含隐藏的请求日志开关入口

## 6. 路由规则

主路由定义在 `src/router/MainRoutes.tsx`。

核心路由包括：

- `/login`
- `/`
- `/dashboard`
- `/config`
- `/ai-providers`
- `/auth-files`
- `/oauth`
- `/quota`
- `/usage`
- `/logs`
- `/system`

其中 AI Provider 和 Auth Files 下还有多个子编辑页。

## 7. 状态管理设计

项目主要通过 Zustand 管理全局状态，核心 store 包括：

- `useAuthStore`
  - 管理登录态、API 地址、管理密钥、连接状态、服务版本
  - 支持自动恢复会话

- `useConfigStore`
  - 管理 `/config` 数据和缓存
  - 做了分段缓存、请求合并和失效控制

- `useModelsStore`
  - 管理 `/v1/models` 获取结果与缓存

- `useUsageStatsStore`
  - 管理 usage 明细、key stats、刷新时间

- `useThemeStore`
  - 管理 `auto/light/white/dark` 主题

- `useLanguageStore`
  - 管理语言选择

- `useNotificationStore`
  - 管理通知和确认弹窗

- 其他草稿类 store
  - `useOpenAIEditDraftStore`
  - `useClaudeEditDraftStore`

## 8. API 层设计

所有 API 封装位于 `src/services/api/`。

核心文件：

- `client.ts`
  - 创建 Axios 实例
  - 统一注入 `Authorization: Bearer <managementKey>`
  - 统一处理错误和 401
  - 从响应头同步后端版本信息

- `config.ts`
  - 基础配置相关 Management API

- `configFile.ts`
  - 配置文件 YAML 读写

- `providers.ts`
  - Gemini / Codex / Claude / Vertex / OpenAI provider 管理

- `authFiles.ts`
  - 认证文件上传、下载、状态切换、删除

- `oauth.ts`
  - OAuth 与 callback 提交

- `usage.ts`
  - 使用统计

- `logs.ts`
  - 日志与错误日志下载

- `models.ts`
  - 通过 `/v1/models` 或代理请求获取模型列表

- `version.ts`
  - 版本检查

## 9. 认证与存储机制

- 登录凭据主要由 `useAuthStore` 管理
- 管理密钥会通过 `localStorage` 持久化
- 持久化时使用 `secureStorage` 进行轻量混淆
- 注意：这里不是强安全加密，只是避免明文直观暴露
- 收到 401 时，前端会触发全局 `unauthorized` 事件并登出

## 10. 配置编辑模块特点

`ConfigPage` 是当前项目里最需要小心维护的页面之一，原因如下：

- 同时支持“可视化模式”和“源码模式”
- 需要保持 YAML 与 UI 表单状态同步
- 保存前会重新拉取最新服务端 YAML，减少覆盖风险
- 保存后还会刷新 `useConfigStore`，保证其他页面同步
- 视觉编辑切回源码时，可能触发 YAML 重序列化

涉及关键文件：

- `src/pages/ConfigPage.tsx`
- `src/components/config/VisualConfigEditor.tsx`
- `src/components/config/ConfigSourceEditor.tsx`
- `src/hooks/useVisualConfig.ts`
- `src/components/config/DiffModal.tsx`

## 11. 日志模块特点

`LogsPage` 复杂度也较高，属于偏运维页面。

主要特征：

- 支持全量加载和增量刷新
- 对大日志量做了渲染窗口控制
- 支持搜索、结构化筛选、隐藏管理流量
- 支持错误日志下载
- 支持请求 trace 定位和 request log 下载

涉及关键文件：

- `src/pages/LogsPage.tsx`
- `src/pages/hooks/logParsing.ts`
- `src/pages/hooks/logTypes.ts`
- `src/pages/hooks/useLogFilters.ts`
- `src/pages/hooks/useLogScroller.ts`
- `src/pages/hooks/useTraceResolver.ts`

## 12. 构建与发布方式

本项目不是普通 SPA 发布方式，而是偏“嵌入式管理页”：

- 使用 `vite-plugin-singlefile`
- 构建后输出 `dist/index.html`
- JS/CSS 资源会被内联到单个 HTML
- 后续通常会被重命名为 `management.html`
- 适合直接随 CLI Proxy API 主程序一起发布

这也是项目选择 `HashRouter` 的重要原因之一。

## 13. 国际化

国际化入口在 `src/i18n/index.ts`。

当前支持语言：

- `zh-CN`
- `en`
- `ru`

资源文件位于：

- `src/i18n/locales/zh-CN.json`
- `src/i18n/locales/en.json`
- `src/i18n/locales/ru.json`

## 14. 开发常用命令

```bash
npm run dev
npm run build
npm run preview
npm run lint
npm run format
npm run type-check
```

## 15. 后续维护建议

继续维护本项目时，建议遵循以下阅读顺序：

1. 先读本文档
2. 再看 `README_CN.md`
3. 然后看目标模块对应的 `page -> components/features -> stores -> services/api -> utils/types`

按需求快速定位：

- 改登录流程：先看 `src/pages/LoginPage.tsx`、`src/stores/useAuthStore.ts`
- 改全局布局：先看 `src/components/layout/MainLayout.tsx`
- 改基础配置：先看 `src/pages/ConfigPage.tsx`、`src/stores/useConfigStore.ts`
- 改 Provider 管理：先看 `src/pages/AiProvidersPage.tsx`、`src/services/api/providers.ts`
- 改认证文件：先看 `src/pages/AuthFilesPage.tsx`、`src/features/authFiles/`
- 改 OAuth：先看 `src/pages/OAuthPage.tsx`、`src/services/api/oauth.ts`
- 改统计图表：先看 `src/pages/UsagePage.tsx`、`src/components/usage/`
- 改日志：先看 `src/pages/LogsPage.tsx`、`src/pages/hooks/`
- 改系统页和模型读取：先看 `src/pages/SystemPage.tsx`、`src/stores/useModelsStore.ts`、`src/services/api/models.ts`

## 16. 维护注意点

- 本项目缓存较多，修改数据流时要同时注意页面状态、store 缓存和 API 刷新时机
- `ConfigPage`、`LogsPage`、`AuthFilesPage`、`AiProvidersPage` 属于复杂模块，改动前建议先通读
- 管理密钥相关逻辑不要误当作普通 API Key 逻辑处理
- 本项目存在一些“后端版本兼容”处理，新增接口调用时要考虑旧版本后端行为
- README 中文文档为 UTF-8；若终端显示乱码，通常是 PowerShell 输出编码问题，不是文件本身损坏

## 17. 建议作为会话起点的文件

如果后续需要快速恢复上下文，优先读取以下文件：

- `PROJECT_BASE_INFO.md`
- `README_CN.md`
- `src/App.tsx`
- `src/router/MainRoutes.tsx`
- `src/components/layout/MainLayout.tsx`
- `src/stores/useAuthStore.ts`
- `src/stores/useConfigStore.ts`
- `src/services/api/client.ts`

---

最后更新说明：

- 本文档基于当前仓库结构整理
- 适合作为后续开发前的“项目基础认知入口”
- 若项目结构发生明显变化，应同步更新本文档
