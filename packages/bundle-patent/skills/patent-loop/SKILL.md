---
name: patent-loop
description: 专利全流程循环推进的契约。当用户要求"loop""继续推进""帮我写完""跑完全部流程""把项目推到成稿"、或想知道项目还差哪些阶段时启用——按 patent_loop 工具评估的当前阶段执行，每完成一阶段再调工具核验，直到它返回 complete=true 才算成稿交底书。
---

# 全流程循环：评估 → 执行 → 再评估

本技能管"循环怎么转"——阶段怎么判定、每阶段找哪个技能、什么时候必须停下来问用户、什么时候才算完成。阶段判定与完成结论的唯一权威是 `patent_loop` 工具（读磁盘事实：patent.yml、brief、八章、实验运行记录、附图成品与 08 章声明的对账、审查报告、导出物新旧），**它说 complete 才是 complete，你的感觉不是**。

## 流水线阶段

| 阶段 | 判定依据（磁盘事实） | 执行时加载的技能 |
|------|----------------------|------------------|
| init | 无 patent.yml | patent-init、patent-research |
| align | brief.md 缺失或核心维度章节缺失 | patent-init、patent-research |
| chapters | 八章任一缺失或占位空白 | patent-chapters、patent-de-ai、patent-writing-quality、patent-effect-contrast |
| experiments | 效果章含量化数据但无运行记录、也无"无需实验"声明 | patent-experiment |
| figures | 08 章声明与 figures/ 根成品对不上（缺失/多余/未规划） | patent-figure-design |
| review | review/ 无 *.review.md | patent-review（工具） |
| export | 无交底书导出物，或导出物早于源文件修改 | patent-services（工具） |

工具返回的 gaps 是全量待办路线图，directive 是当前阶段的执行指令——按 directive 干活，不要跳到后面的阶段。

## 循环纪律

1. **一次一阶段**：完成当前阶段后立即再调 `patent_loop` 核验，由它指认下一个阶段；不要凭记忆连跳多阶段，也不要在它返回 complete=true 之前宣布成稿。
2. **各阶段的硬纪律归各技能管**：附图渲染后必须派 subagent 验收合格才保留（patent-figure-design）；正式实验数据必须出自 run_experiment 工具的运行记录（patent-experiment）；导出一律走 patent-services 的 MCP 工具，禁止手拼 docx（patent-services）。
3. **需要用户时停**：init 的方向拍板、align 的访谈问答、ready 复述确认——把问题抛给用户并结束本轮，等回答后继续；用户也可以随时重新发 /patent-loop 恢复。禁止替用户编造访谈答案。
4. **失败要响**：检索通道、docker、MCP 服务不可用时如实说明并给启用方法，不静默降级（同各技能的失败纪律）。
5. **完成即交付**：complete=true 后向用户交付导出物路径、阶段摘要与审查分数，结束循环；申请文件（application/）不在循环范围内，用户明确要求推进时才走 patent-claims 与 patent-application。

## 免做声明（防止循环卡死）

某阶段确实不适用时，用磁盘声明而不是口头解释，否则评估器会一直卡在同一阶段：

- 无需实验：在 `experiments/README.md` 写明「无需实验：<理由>」；
- 无附图：在 `chapters/08-drawings.md` 写明「无附图」及理由（一般不建议——附图是交底书的重要组成部分）。
