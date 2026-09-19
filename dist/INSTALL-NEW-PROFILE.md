# 点金（dsh-patent）新档案安装指南

> 适用：Deepseek Harness Desktop（Tauri 桌面端）已安装的 Windows 机器。
> 目标：在一个**全新的 dsh 档案**里装好「点金 Aurify」专利撰写插件，不影响既有档案。
> 全程约 1 分钟（脚本路径）；网络不需要访问 npm。

## 前置条件

| 条件 | 说明 | 检查方法 |
|---|---|---|
| 桌面端已安装 | 自带 dsh 核心与 dsh CLI shim | `%LOCALAPPDATA%\deepseek-harness\bin\dsh.cmd --version` 有输出 |
| 分发物在位 | `C:\Users\77110\.dsh\plugin-dist\patent\` 下有 `bundle\` 目录 + 5 个 tgz | 脚本第 1 步会自动校验 |
| Python 服务（可选） | 导出/渲染/实验/查新 8 个 MCP 工具 | 用户级环境变量 `DSH_PATENT_SERVICES_DIR` 指向 patent-services 源码目录（`setx DSH_PATENT_SERVICES_DIR <目录>`，设完重启桌面端）；已设置则所有档案自动继承 |
| Docker（可选） | 仅跑实验与 drawio 渲染需要 | 用到时手动启动 Docker Desktop 即可 |

## 快速安装（推荐）

```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\77110\.dsh\plugin-dist\patent\install-patent-profile.ps1 -Name <新档案名>
```

- `-Name`：新档案名，如 `patent-test`。默认 `patent-test`。
- `-PersonaFrom patent`（默认）：从既有 `patent` 档案复制「点金」persona（12 条纪律）。没有参考档案时传 `-PersonaFrom ""`，随后按 [persona 安装](#persona-为什么单独装) 手工补。
- 幂等：对已存在的档案重复运行安全（重写清单、补 overrides、重装、跳过已装 persona）。

脚本结束后**完全退出并重启桌面端**，在档案列表选择新档案名即可。

## 手动安装（脚本做的事，逐步）

以下每一步都对应脚本里的一个环节；想理解或手工操作时照此执行。

### 1. 校验分发物

```
C:\Users\77110\.dsh\plugin-dist\patent\
├─ bundle\                                        # @mtl-academic/dsh-patent（目录形态，14 个技能在内）
├─ mtl-academic-dsh-patent-0.1.6-alpha.1.tgz
├─ deepseek-ai-dsh-tool-patent-0.1.6-alpha.1.tgz
├─ deepseek-ai-dsh-command-patent-review-0.1.6-alpha.1.tgz
├─ deepseek-ai-schemastery-3.18.2.tgz             # registry 只有 3.18.x 线，bundle 按 vendored fork 构建
└─ deepseek-ai-cosmokit-1.8.3.tgz
```

### 2. 初始化档案并声明 bundle

```cmd
dsh plugin --profile <名称> add file:C:/Users/77110/.dsh/plugin-dist/patent/bundle
```

- **必须是目录（file: 指到目录），绝不能 file: 指 tgz**——桌面端自愈机制对清单里的 `file:`/`link:` 依赖检查目标是否为目录，tarball 会被判定悬空并在每次启动时卸载插件。
- 这一步会初始化档案（`dsh.profile.bundles` + `patchReload: live`），但 pnpm 解析 bundle 的内部依赖（`workspace:^`，未发布到 npm）**会报错退出——预期行为**，第 3、4 步修复。

### 3. 写 `<档案目录>\package.json`

把 bundle 以**目录依赖**声明，并把 bundle 栈补成三层：

```json
{
  "name": "dsh-profile-<名称>",
  "private": true,
  "dependencies": {
    "@mtl-academic/dsh-patent": "file:C:/Users/77110/.dsh/plugin-dist/patent/bundle"
  },
  "dsh": {
    "profile": {
      "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@mtl-academic/dsh-patent"],
      "patchReload": "live"
    }
  }
}
```

### 4. 写 `<档案目录>\pnpm-workspace.yaml`（overrides）

内部包未发布到 npm，用 pnpm overrides 顶替 registry 解析（**pnpm 11 只读这份 yaml 的 overrides，package.json 里的 pnpm 字段无效**）：

```yaml
packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false

overrides:
  '@deepseek-ai/dsh-tool-patent': file:C:/Users/77110/.dsh/plugin-dist/patent/deepseek-ai-dsh-tool-patent-0.1.6-alpha.1.tgz
  '@deepseek-ai/dsh-command-patent-review': file:C:/Users/77110/.dsh/plugin-dist/patent/deepseek-ai-dsh-command-patent-review-0.1.6-alpha.1.tgz
  '@deepseek-ai/schemastery': file:C:/Users/77110/.dsh/plugin-dist/patent/deepseek-ai-schemastery-3.18.2.tgz
  '@deepseek-ai/cosmokit': file:C:/Users/77110/.dsh/plugin-dist/patent/deepseek-ai-cosmokit-1.8.3.tgz
```

### 5. 落盘安装

```cmd
dsh plugin --profile <名称> install
```

成功标志：pnpm `Done`，`node_modules` 下出现 `@mtl-academic/dsh-patent` 与 `@deepseek-ai/{dsh-tool-patent,dsh-command-patent-review,schemastery,cosmokit}`。

### 6. 装 persona（点金人格）

bundle 刻意不带 persona（能力层可装任意档案）。把参考档案的补丁层复制过去：

```powershell
Copy-Item ~\.dsh\profiles\patent\cordis.patch.yml ~\.dsh\profiles\<名称>\cordis.patch.yml
```

persona 正本（12 条纪律的全文）在 bundle README 的「The persona lives in the profile」一节；没有参考档案就照它手工写 `cordis.patch.yml` 的 `system-prompt.config.persona`。**没有 persona，模型没有把关人行为**（不会主动评估点子、不会按纪律路由技能）。

### 7. 验证

```cmd
dsh --profile <名称> --dump-config
```

检查三点：`tool-patent` / `patent-assets` / `command-patent-review` / `mcp-patent-services` 四行在；`persona:` 出现一次；启动日志无 `DANGLING`/`UNINSTALLING`（出现即说明第 2 步没做成目录形态）。`workflow-ptc not found` 之类的 warning 是双核兼容窗口的正常 no-op，可忽略。

## 安装后能做什么

| 能力 | 入口 | 依赖 |
|---|---|---|
| 点子评估 / 五方访谈 / 章节撰写 / 审查 / 导出全流程 | 会话里直接说，或 `/patent-loop`、`/patent-review` | 无 |
| 交底书/申请文件导出、Word 解析 | MCP 工具自动调用 | `DSH_PATENT_SERVICES_DIR` |
| 实验仿真、drawio/HTML 附图渲染 | MCP 工具自动调用 | 上者 + Docker Desktop |
| 中国专利查新 | `search_cn_patents`（模型自动调） | 网络可达 patents.google.com（代理） |

## 升级/刷新

插件出新版后：把新 tarball 覆盖进 `plugin-dist\patent\`、新 bundle 覆盖 `plugin-dist\patent\bundle\`，然后**重跑一遍安装脚本**（或 `dsh plugin --profile <名称> install --force`）。注意 pnpm 对同名版本 tarball 做完整性校验，内容变了的 tarball 直接 install 会被拒——脚本路径会重新写 overrides 并强制重装，可绕开该问题。Python 服务指源码目录时改源码即生效，无需重装。

## 故障排查

| 症状 | 原因与处理 |
|---|---|
| 桌面端启动后插件消失，日志有 `DANGLING_LINK_UNINSTALLING` | bundle 被装成了 tgz 形态。删掉档案重装，第 2 步务必指到 `bundle` 目录 |
| `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND`（workspace:^） | overrides 没写或路径不对。检查 `pnpm-workspace.yaml` 的 4 行 overrides 与 tgz 是否在位 |
| 导出/渲染工具模型看不到 | `DSH_PATENT_SERVICES_DIR` 未设（用户级），或设后没重启桌面端 |
| 审查报"模型不存在/401" | 会话模型选 `zai-coding-cn` 组的 GLM 系列；默认 deepseek 线经 GLM 网关会模型不存在 |
| 审查某维度全部失败 | 网关限流。脚本化的审查会分批+退避+补跑，重跑一次 `patent_review` 通常恢复 |
