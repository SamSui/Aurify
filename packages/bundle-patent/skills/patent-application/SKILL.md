---
name: patent-application
description: 中国专利申请说明书的五段式撰写程序。当要把交底书推进为申请文件、起草或修订 application/description.md 与 application/abstract.md 时启用——说明书按法定五段结构组织，摘要不超过300字，附图说明与 chapters/08-drawings.md 对齐。
---

# 说明书撰写（五段式）

## 目标

把交底书八章内容重组为符合审查指南结构的说明书（`application/description.md`）与说明书摘要（`application/abstract.md`），与 `application/claims.md` 构成完整申请文件。

## 五段结构

按以下固定顺序组织，段首使用标准段落名：

1. **技术领域**（← chapters/02-field.md）：一两句话，写发明所属领域与直接应用场景，不写背景。
2. **背景技术**（← chapters/03-background.md）：现有技术及其缺点，逐条与 `claims` 独权前序部分呼应；引证具体出处的（型号/专利号）保留，没有的用"现有方案"泛指。
3. **发明内容**（← chapters/04-problem.md + 05-solution.md + 06-effect.md）：三段式——"针对上述问题，本发明提供…"逐条对准缺点；随后**逐权项复述**：每条权利要求的技术方案在说明书中至少出现一次完整支持表述（权利要求的"说明书依据"）；最后有益效果逐条对应。
4. **附图说明**（← chapters/08-drawings.md）：逐图"图N为…"清单，图号与 figures/ 下的文件名对应。
5. **具体实施方式**（← 05/06 章的细节展开）：至少一个完整实施例（含参数范围），覆盖独权全部必要特征 + 主要从权各一个落地面；给出替代实现（"在另一实施例中…"）支撑权利要求的概括范围。

## 摘要（application/abstract.md）

- ≤300 字（非空白字符），写发明名称、技术领域、核心手段、主要效果各一句；
- 不得出现"附图说明"性内容和商业宣传语；
- 定稿前把摘要传入 `patent_claims_lint`（连同 claims）核对 A1。

## 撰写程序

1. 读 brief.md、chapters/ 全部八章、application/claims.md（若已起草）；未读不动笔。
2. 按五段结构起草；发明内容段的逐权项复述与 claims 术语逐字一致（复制权项措辞后展开解释）。
3. 术语首现即译规则与交底书一致：中文译名（English，缩写）。
4. 应用 patent-de-ai 与 patent-writing-quality 规范；实施例中的量化数据沿用 06 章口径，不新增未经用户确认的数据。
5. 请求用户确认五段覆盖情况与实施例数量后收尾；更新 patent.yml status 为 `application`。

## 完成判定

- 五段齐全且顺序正确；每条权项在"发明内容"或"具体实施方式"有可指认的支持表述；
- 摘要 ≤300 字且四要素齐备；
- 附图说明条数与 chapters/08 及 figures/ 一致。

## 修订纪律

- claims 变更后先改"发明内容"的支持表述，再考虑其他段；
- 用户手工编辑过 application/ 文件后，先读再改，diff 供逐处确认。
