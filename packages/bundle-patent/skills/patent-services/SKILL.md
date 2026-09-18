---
name: patent-services
description: 交底书与申请文件的导出、交付物更新、Word 解析与归档检索的路由。当用户要求导出交底书/申请文件为 docx 或 pdf、更新或修订已交付的导出文档、把附图插入导出文档、解析 Word 版交底书或参考文献、检索历史项目找先例时启用——这些一律走 patent-services 的 MCP 工具，禁止用临时脚本拼改 docx。
---

# 交付物纪律：工具导出，禁手拼

导出物（`exports/` 下的 docx/pdf）是源的投影：交底书由 patent.yml + brief + chapters/ 经模板生成，申请文件由 application/ 生成。手改导出物或用临时脚本拼 docx，都会制造源与交付物的漂移——导出物上看到的任何内容都必须能从源重新导出得到。

## 程序

1. **导出**：交底书调 `export_disclosure(project_dir, fmt)`（docx 默认；pdf 需系统 GTK，缺失会报错并给指引）；申请文件三件套装 `export_application_docs(project_dir, fmt)`。产物落在项目 `exports/`，文件名以项目为准。
2. **更新已交付内容**（章节修订、附图变更、错字修正）：一律改源（chapters/、figures/、application/）后重新导出覆盖——不要在旧 docx 上打补丁。
3. **就地向已交付 docx 插图或补内容**（用户明确要求且不接受重新导出时）：先说明将修改用户文件并自动留 `.bak`，插图遵守 patent-figure-design 的插图纪律（图N 在图下方居中、编号对应 08 章附图说明、图注轻改写）。
4. **解析 Word 材料**：代理机构模板、已授权交底书、参考文献用 `parse_disclosure_docx(path, output_path?)` 转三层编号 Markdown，存项目 `reference/` 后再引用。
5. **写背景技术找先例**：用 `search_patent_archive(query, archive_dir)` 检索历史项目工作区或 `reference/`（中文分词 + BM25），命中结果给出处再融入正文。
6. **工具不可用时**（本会话未启用 MCP 服务）：明说"当前会话没有启用专利导出服务"，并给出启用方法——设环境变量 `DSH_PATENT_SERVICES_DIR` 指向 `python/patent-services` 源码目录（或 `DSH_PATENT_SERVICES=1` 走已安装 wheel）后重启；**不要**退回临时脚本拼改。

## 工具清单（MCP 前缀 mcp__patent__）

- `export_disclosure(project_dir, fmt)` — 模板驱动交底书导出。
- `export_application_docs(project_dir, fmt)` — 申请文件三件套单 docx 多分节。
- `parse_disclosure_docx(path, output_path?)` — Word → 三层编号 Markdown。
- `search_patent_archive(query, archive_dir, limit?)` — 中文全文检索（jieba + BM25）。
