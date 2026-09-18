<!-- diagram-design-profile
name: CNIPA monochrome (patent)
slug: cnipa-monochrome
source-url: none
created: 2026-09-16
updated: 2026-09-16
notes: Patent-figure monochrome skin, shipped by the patent-figure-design skill; black lines on white only
-->
# Style Guide

**专利附图单色皮肤（CNIPA）。** 本 profile 由 patent-figure-design 技能随专利 bundle 发布，覆盖 diagram-design 的编辑部默认皮肤：黑色线条、白色纸面、无任何彩色。中国专利附图要求黑色线条绘制、不得着色，因此这里的多数语义角色都收敛为黑色，层级改由**线宽与虚线**表达。本文件与上游 `references/style-guide.md` 保持同构（同样的表结构与角色行），仅替换取值；上游 schema 新增行时按其结构校验规则从出厂默认回填。

---

## Tokens

### Semantic roles

| Role | Purpose | Default (light) | Default (dark) |
|---|---|---|---|
| `paper` | 页面背景、节点默认填充 | `#ffffff`（纯白） | `#ffffff` |
| `paper-2` | 图容器背景、次要填充 | `#ffffff` | `#ffffff` |
| `ink` | 主文字、主描边 | `#000000` | `#000000` |
| `muted` | 次要文字、默认箭头描边 | `#000000` | `#000000` |
| `soft` | 子标签、边界标签 | `#000000` | `#000000` |
| `rule` | 发丝线边框 | `#000000` | `#000000` |
| `rule-solid` | 强边框、基线 | `#000000` | `#000000` |
| `accent` | 焦点（每图 1–2 个，用加粗线宽表达，非颜色） | `#000000` | `#000000` |
| `accent-tint` | 焦点框填充 | `#ffffff` | `#ffffff` |
| `link` | 外部调用、外部箭头 | `#000000` | `#000000` |

> **着色禁令**：专利附图不得出现任何色相。所有角色恒为黑或白，浅色/深色两列相同（专利附图不存在深色模式）。灰阶也一律不用——层次只靠 `stroke-*` 线宽（0.8/1/1.2）与虚线（`4,3`/`4,4`）区分，与 patent-figure-design 的线宽分级一致。

### Series palette

多序列图表型（雷达等）在本皮肤下**不得使用彩色系列**。需要区分序列时改用线型（实线/长虚线/点线）与标记形状（●○▲），每图序列数不超过 3。

### Terminal skin

终端窗口原语（primitive-terminal）以深底白字为前提，与黑白附图冲突，**专利附图禁用**该原语。

---

## Typography

| Role | Family | Size | Weight | Usage |
|---|---|---|---|---|
| `title` | `'SimSun', '宋体', serif` | 1.75rem | 700 | 仅浏览器打开时的页面 H1；**图内不使用**（图内无图号图题） |
| `node-name` | `'SimSun', '宋体', serif` | 12px | 400 | 节点/实体名；组框名、泳道头等结构标题 700 |
| `sublabel` | `'SimSun', '宋体', serif` | 9px | 400 | 端口、协议、字段类型等子标签（保持拉丁字符） |
| `eyebrow` | `'SimSun', '宋体', serif` | 9px | 400 | 类型标签、轴标签；中文不用大写与字距变换 |
| `arrow-label` | `'SimSun', '宋体', serif` | 9px | 400 | 箭头标注 |
| `callout` | `'SimSun', '宋体', serif` | 12px | 400 | 注释；不用斜体（宋体伪斜体在打印件上发虚） |

### Font stack

**只允许本地字体，禁止 Google Fonts 或任何网络字体链接**——专利附图必须离线可复现：

```html
<!-- 不引入任何 <link>；font-family 直接写 -->
<text font-family="'SimSun', '宋体', 'SimHei', serif">凭证所有者</text>
```

全图文字**同族**（宋体），**字重是唯一允许的差异**（仅结构标题加粗）；字号按 diagram-design 版式规范的档位（名称 12px、标注 9px），不得为塞字缩到 9px 以下——塞不下就精简标注文字。中文每字 1em、全角标点 1em、拉丁字符按其字面宽度估宽，按上游宽度预算规则留足框内边距并取 4 的倍数。

---

## Stroke, radius, spacing

| Token | Value | Use |
|---|---|---|
| `stroke-thin` | `0.8` | 次要框、叶子节点 |
| `stroke-default` | `1` | 多数描边 |
| `stroke-strong` | `1.2` | 焦点框、结构标题栏（加粗即强调，不用颜色） |
| `radius-sm` | `4` | 小标签 |
| `radius-md` | `6` | 节点框 |
| `radius-lg` | `8` | 容器 |
| `grid` | `4` | 所有坐标、尺寸、间距为 4 的倍数（硬规则，沿用） |

---

## Node type → treatment

| Type | Fill | Stroke |
|---|---|---|
| `focal`（1–2 个） | `#ffffff` | `ink`，`stroke-strong` 1.2 |
| `backend` | `#ffffff` | `ink`，`stroke-default` |
| `store` | `#ffffff` | `ink`，`stroke-default` |
| `external` | `#ffffff` | `ink`，`stroke-thin` 0.8 |
| `input` | `#ffffff` | `ink`，`stroke-thin` 0.8 |
| `optional` | `#ffffff` | `ink`，`stroke-thin` 0.8，虚线 `4,3` |
| `security` | `#ffffff` | `ink`，`stroke-thin` 0.8，虚线 `4,4` |

所有填充恒为白色——辅路、可选路径、告警通道用**虚线**区分（与 patent-figure-design 的主/辅线约定一致），不用底色。

---

## 本皮肤的约束（优先于上游口味规则）

- 纯白纸面是**要求**而非禁忌（CNIPA 附图为白纸黑线，上游"warm-neutral 纸色"口味规则在本皮肤下不适用）。
- 三字族规则不适用：全图**只许一个字族**（宋体），这是专利附图规范，不是编辑取舍。
- 焦点表达 = 加粗描边（1.2），永远不是颜色。
- 动画一律关闭：专利附图是静态印刷品，不引入 motion，即使上游某版式示例带动画。
- 输出为自包含 `.html`（内联 SVG）存入项目 `figures/`，与 `.drawio` 源并存；转 PNG 的渲染管线接入前，以浏览器打开核对。
