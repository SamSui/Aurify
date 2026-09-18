---
description: "两个确定性专利工具：交底书 brief 的五方对齐就绪度打分，与已起草权利要求书的 CNIPA 格式静态检查。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-patent

[English](README.md) | 中文

## 概述

两个模型可见的确定性专利工具。`patent_brief_coverage` 按五方对齐就绪判据为交底书 brief 打分，给 Init 对话一个确定性的「何时停止提问、开始动笔」信号；`patent_claims_lint` 按中国专利申请（CNIPA）格式最低要求对起草的权利要求书（及可选的摘要）做静态检查。两者都是参数的纯函数，不带任何配置，在 patent profile 内使用。

## 目录

- [做什么](#what-it-does)
- [打分语义](#scoring-semantics)
- [权利要求检查语义](#claims-lint-semantics)
- [渲染](#rendering)
- [导出形态](#export-shape)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="what-it-does"></a>
## 做什么

在 `ctx.tools` 上注册两个工具。`patent_brief_coverage`：模型按维度传入已收集的草稿内容——`field`、`background`、`problem`、`solution`、`effect` 五个核心维度，外加 `name`、`drawings`、`key_points` 三个边缘维度（省略即未收集）——返回已收集/缺失清单、三方对齐判定与就绪信号。`patent_claims_lint`：模型传入起草的权利要求书文本（及可选摘要），返回权项数量结构与规则违例。两个工具都是参数的纯函数；调用与结果经 loop 的 `tool/call` 与 `tool/result` session 事件记录，不追加任何其他事件。

<a id="scoring-semantics"></a>
## 打分语义

打分器移植自天工的 `brief_dimensions.py`（参照实现的 Init 就绪唯一权威）：

- **核心维度**——`field`、`background`、`problem`、`solution`、`effect`。全部非空才就绪。
- **对齐检查**——`background`、`problem`、`effect` 三方的条数（按 ①②/`1.`/`(1)`/`一、` 等序号与分号、换行切分取较大者估算）最大偏差不得超过容差 1。三方任一未收集时对齐判定空放通过：缺维度是「还没收集到」，不是「未对齐」。
- **边缘维度**——`name`、`drawings`、`key_points` 接受并展示，但不参与就绪判定；它们通常在生成期补全。

容差与启发式计数是移植资产语义（init 阶段信息粒度粗），不是部署可调项，因此没有配置。

<a id="claims-lint-semantics"></a>
## 权利要求检查语义

`patent_claims_lint` 解析带编号的权利要求（"1." 至 "N."，一条权项可跨行），检查的是法定格式最低要求，不是实质审查：

- **C1** 编号：必须从 1 连续编号；引用不存在的权项同属本规则。
- **C2** 从属权利要求只能引用在前的权利要求（引用自身或更晚为错误）。
- **C3** 引用形式：引用多项必须用「根据权利要求N至M中任一项所述的」择一引用形式。
- **C4** 多项从属权利要求不得以另一多项从属权利要求为基础。
- **C5**（警告）独立权利要求未出现「其特征在于」，缺少改进型发明应采用的两部分式写法。
- **A1** 摘要非空白字符不得超过 300 字；仅在传入摘要时运行。

解析出的权项刻意不进入模型可见结果：模型刚提交过全文，回显每条权项只是白白消耗 token。

<a id="rendering"></a>
## 渲染

规范结果为 `{ covered, missing, ready, coreFilled: { done, total }, aligned, alignmentCounts }`；Native 渲染返回一个文本块，具名缺失维度（带中文章节名）、对齐计数与容差判定、就绪判定与下一步动作。

<a id="export-shape"></a>
## 导出形态

函数插件：只导出 `name` / `inject` / `apply`，禁止 default export。多余的 `export default` 会被 Loader 的 `unwrapExports` 折叠模块并丢掉 `inject`（见 [docs/postmortem/0001](../../../docs/postmortem/0001-acp-default-export-drops-inject.zh.md)）。

<a id="model-experience"></a>
## Model Experience

### Tool schema

#### What the model sees

模型看到生成的 [`patent_brief_coverage` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-patent)。

#### Token effect

工具可见的每个请求上都是固定 schema 开销。

#### KV Cache effect

定义与可见性不变时前缀稳定。

### Tool-call history and result

#### What the model sees

每次调用携带草稿维度内容作为参数。成功返回一个定形文本块（覆盖进度、具名缺口、对齐判定、下一步动作）。无稳定失败模式：空白参数是合法的「尚未收集」输入，schema 违规由 registry 以标准 `INVALID_ARGS` 结果拒绝。

#### Token effect

随模型每次提交的草稿文本量增长；结果小而定形。

#### KV Cache effect

只追加；新出现的内容跟在可复用的请求前缀之后。

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- **工具只对传入内容打分**——维度内容由模型从其上下文提供；模型可能提交删减版 brief 而得到误导性 `ready`。`patent-init` skill 的程序约束这一点，审查引擎会对落盘文件复查。
- **不支持路径输入**——工具接收文本而非 `brief.md` 路径；读文件先经 `fs` 工具完成，本包因此不沾文件系统策略。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

打分器移植自天工的 `brief_dimensions.py`；容差与启发式计数是移植资产语义，不是部署可调项。检查规则对齐 CNIPA 法定格式最低要求（C1-C5、A1），不是实质审查。

</details>
