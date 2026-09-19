# 点金 Aurify

> Not every stone is worth gilding — appraise the idea before you gild it.
> 先验金，再点金。[DeepSeek Harness（dsh）](https://github.com/deepseek-ai/deepseek-harness) 的专利撰写把关人 · the patent-writing gatekeeper for dsh。

丢一个技术点子，点金先检索中国专利给出「建议写 / 收窄后写 / 不建议写」的评估（附公开号证据，可以反驳它），确认方向后再带你走完全流程：五方对齐访谈 → 八章交底书 → 附图与仿真实验 → 七维审查 → docx/PDF 导出。

与「帮你起草」类插件的本质区别：**你的表述是待检验的起点，不是最终答案**——它敢反驳、会批评、按证据给方向，结论由你拍板。

## 功能地图

| 阶段 | 能力 |
|------|------|
| 点子评估 | 中国专利查新（Google Patents CN 检索）+ 三档结论 + 对话定向 |
| 访谈 | 五方对齐（现有技术缺点 → 技术问题 → 有益效果），就绪度工具打分，ready 前不动笔 |
| 撰写 | 八章交底书 + 去 AI 味 + 效果对比框架 |
| 实验 | docker 仿真实验（公开数据集优先，真实场景标定仿真），运行记录自动落账 |
| 附图 | drawio / HTML 双通道渲染，黑白中文规范，编号与正文联动 |
| 审查 | `/patent-review` 七维 rubric + NLI 一致性，报告落档 |
| 导出 | 代理机构模板交底书 + 申请文件三件套，docx/PDF，插图自动配对 |

组成：**14 个技能**（撰写纪律）+ **5 个原生工具**（就绪度打分、权利要求/正文检查、全流程推进、审查直通）+ **8 个 MCP 工具**（导出/解析/渲染/检索/实验/查新，Python 服务）+ `/patent-review` 审查命令 + Web 结构化卡片与项目面板。Bundle 不带 persona（人格在档案补丁层，安装时一并装入），可装入任意 dsh 档案。

## 安装（最短路径）

前置：[DeepSeek Harness 桌面版](https://github.com/hairyf/deepseek-harness-desktop)（或 dsh ≥0.1.5）；可选 uv（Python 服务）与 Docker Desktop（附图渲染、仿真实验）。

**方式 A · 一键安装器（推荐）**——解包插件为目录后运行自带安装器，它自动完成建档案、写依赖 overrides、装包、装 persona 与验证，幂等可重跑：

```sh
mkdir bundle && tar -xzf dist/mtl-academic-dsh-patent-0.1.6-alpha.1.tgz -C bundle --strip-components=1
```

```powershell
powershell -ExecutionPolicy Bypass -File dist/install-patent-profile.ps1 -Name patent-demo -DistDir <dist目录>
```

**方式 B · 手动安装**——四步走，适合不想跑脚本时：

```sh
# 1. 解包插件为目录（桌面端必须目录形态安装）
mkdir bundle && tar -xzf dist/mtl-academic-dsh-patent-0.1.6-alpha.1.tgz -C bundle --strip-components=1

# 2. 建 profile 并写入依赖 overrides（模板见 dist/README.md）

# 3. 安装 + 装 persona（dist/persona.patch.yml 拷为档案的 cordis.patch.yml，
#    或照 bundle README「The persona lives in the profile」一节手写）
dsh plugin --profile patent-demo add "file:<DIST>/bundle"

# 4. 可选：Python 服务（8 个 MCP 工具）
uv tool install dist/deepseek_harness_patent_services-0.1.0-py3-none-any.whl
# 系统环境变量 DSH_PATENT_SERVICES=1，重启桌面版
```

完整步骤、验收方法与已知边界见 [`dist/README.md`](dist/README.md)；安装器参数与故障排查见 [`dist/INSTALL-NEW-PROFILE.md`](dist/INSTALL-NEW-PROFILE.md)。

## 仓库结构

```text
packages/bundle-patent/            # 能力 bundle：14 技能 + Web 卡片/面板 + MCP 行（@mtl-academic/dsh-patent）
packages/tool-patent/              # 就绪度打分、权利要求/正文检查、全流程推进工具（@deepseek-ai/dsh-tool-patent）
packages/command-patent-review/    # /patent-review 确定性审查命令 + patent_review 直通工具（七维 rubric）
python/patent-services/            # Python MCP 服务：导出/解析/渲染/检索/实验/查新（8 工具）
dist/                              # 可直接安装的 npm tarball + Python wheel + 一键安装器 + persona 补丁 + 接收方指南
```

技术标识：npm 包 `@mtl-academic/dsh-patent`（未发布，用 `dist/` 内 tarball 安装）；Docker 镜像 `q771103517/dsh-patent`（附图渲染）与 `q771103517/dsh-patent-experiment`（仿真实验），首次使用自动拉取。

## 开发

技能/Python 服务可直接改源码（Python 服务经 `DSH_PATENT_SERVICES_DIR` 指源码运行，改动即生效）。TS 包的构建接线在 deepseek-harness monorepo 内（tsdown preset、workspace 依赖），完整 monorepo 历史与构建上下文见本仓库 Release 附带的 `dsh-patent-full.bundle`（`git clone` 即得源码仓，`pnpm install && pnpm run build`）。Python 测试：`uv run --project python/patent-services --group test pytest python/patent-services/tests`。

## 已知边界

- 面向 dsh 0.1.5-rc 至 0.1.6-alpha 线核心；旧核心缺 Web 卡片时工具显示为文本行，功能不受影响。
- 中国专利查新需本机能访问 patents.google.com（通常走代理）；不可达时明确报错，不返回编造结果。
- 附图渲染与仿真实验需要 Docker Desktop 在运行。

## 已知同类

[deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 是 DeepSeek AI 官方的 agent harness，本项目是其生态的第三方能力插件，与其无隶属关系。
