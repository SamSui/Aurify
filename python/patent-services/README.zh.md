# deepseek-harness-patent-services

[English](README.md) | 中文

把专利交底书领域服务暴露给 dsh `patent` profile 的 MCP stdio 服务：模板/参考资料解析、整项目导出、申请文件套件导出、drawio 附图渲染、档案检索、docker 仿真实验，以及中国专利发现。经 dsh MCP client 以 `patent-services` stdio 服务行挂载，工具以 `mcp__patent__parse_disclosure_docx`、`mcp__patent__export_disclosure`、`mcp__patent__export_application_docs`、`mcp__patent__render_drawio_figure`、`mcp__patent__render_html_figure`、`mcp__patent__search_patent_archive`、`mcp__patent__run_experiment`、`mcp__patent__search_cn_patents` 到达模型。

## 工具

- `parse_disclosure_docx(path, output_path?)` — 把一份 Word 文档解析为 Markdown，采用三级编号策略（一级=显式标题样式/`第一章`/`一、`/`1.`，二级=`1.1`/`（一）`，三级=`1.1.1`）；可选输出 Markdown 文件。表格与内嵌图片跳过。
- `export_disclosure(project_dir, fmt)` — 按随包的代理机构交底书模板（`assets/disclosure-template.docx`）导出：专利申请技术交底书表头、发明人信息表与页面规格随模板带入，模板页脚清空，各章按模板条款（一、名称至八、附图）以模板自身排版填入，figures/图N.png 嵌入附图节并在图下配 图N 标注与 08 章图题（楷体_GB2312 四号、1.5 倍行距、首行两字符缩进），叠阅读层级——条款标题加粗、`##` 子标题加粗不缩进、`●` 悬挂缩进分点、`**加粗**` 保留为真加粗；八节之外的章节追加为后续编号条款，`brief.md` 不进入导出物；`docx`（默认，python-docx）或 `pdf`（尽力而为，weasyprint——缺 GTK 库的环境报错并给安装指引）。
- `export_application_docs(project_dir, fmt)` — 按已提交申请文件的版式导出申请文件套件（`application/{claims,description,abstract}.md`）：单份 Word 多分节——说明书摘要、权利要求书（每条权项一段，Markdown 续行折入）、说明书（开头居中发明名称、节标题加粗不缩进）——每节在页眉携带居中下框线的文档类型标签（黑体四号、字间空格照录），正文宋体四号（西文 Times New Roman、1.5 倍行距、首行两字符缩进、与交底书导出相同的 `●` 分点与 `**加粗**` 层级），权利要求书与说明书重排页码，不显示页码；`docx`/`pdf` 行为同交底书导出。
- `render_drawio_figure(source, fmt)` — 把一个 `.drawio` 源渲染为 `png`/`pdf`/`svg`/`jpg`：`figures/source/` 下的源落到 `figures/`（根目录只放最终成品图；可编辑源在 `figures/source/`，中间产物在 `figures/tmp/`），其余源渲染到源旁。CLI 按 `DSH_DRAWIO_BIN` → PATH（`draw.io`/`drawio`）→ Windows 每用户安装位解析（显式 `DSH_DRAWIO_BIN` 是严格的——坏路径直接报错不兜底）；兜底运行 `DSH_DRAWIO_DOCKER_IMAGE`（默认 `q771103517/dsh-patent:latest`，由 `assets/Dockerfile.drawio` 构建并已发布 Docker Hub 的 CJK 字体叠加镜像——缺镜像自动拉取；插件更新改了 Dockerfile 就以同一 tag 重建重推）；无可用后端报错并给安装/构建指引。
- `render_html_figure(source, fmt)` — 把一份自包含 HTML 附图（diagram-design 产物）经 Edge/Chrome 无头截图栅格化为 png/jpg 落在源旁（`DSH_HTML_BROWSER` 覆盖可执行文件）；`figures/source/` 下的源落到 `figures/`。
- `search_patent_archive(query, archive_dir, limit)` — 对档案根（历史项目的工作区，或单个项目的 `reference/`）下的 Markdown 语料做中文感知全文检索（jieba 分词 + SQLite FTS5 BM25）；`exports/` 与工具目录跳过。命中返回路径、标题与居中摘录。
- `search_cn_patents(query, limit?, since_year?)` — 在 Google Patents 上发现中国专利，服务于查新与背景调研：query 是中文核心特征词，命中逐行返回（公开号、标题、申请人、优先权日），限定 CN 公开；命中的摘要与权利要求 1 用 web_fetch 读静态渲染明细页（`patents.google.com/patent/<公开号>/zh`）。无鉴权 `/xhr/query` 接口需要本机能访问 patents.google.com（系统代理是常规路线——Windows 上 urllib 自动读取）；网络不可达、HTTP 错误、结构不识别都报错并给补救，绝不返回空结果——编造的命中比失败的检索更糟。
- `run_experiment(project_dir, experiment, command?, timeout_seconds?)` — 在 docker 运行器里跑一个仿真实验：项目挂载在 `/workspace`、工作目录为 `experiments/<experiment>/`，该目录的 `requirements.txt` 先安装（默认 `python run.py`），运行输出的合并尾部返回给模型。每次调用——成功、失败或超时——都向 `experiments/<experiment>/results/run-log.md` 追加一条运行记录（时间、镜像、命令、退出码、输出尾部），正文引用的每个数字都指向这本账。镜像（`DSH_PATENT_EXPERIMENT_IMAGE`，默认 `q771103517/dsh-patent-experiment:latest`，由 `assets/Dockerfile.experiment` 构建并已发布 Docker Hub——缺镜像自动拉取；烤入的依赖栈变化就以同一 tag 重建重推）自带 numpy/scipy/pandas/matplotlib/openpyxl 与 CJK 字体，matplotlib 无需每脚本设置字体即可渲染中文标注；docker CLI 缺失报错并给 Docker Desktop 指引。

## 运行

```sh
uv run --project python/patent-services python -m patent_services   # stdio 服务
uv run --project python/patent-services --group test pytest python/patent-services/tests   # 测试
uv build python/patent-services                                     # wheel + sdist
```

wheel 是可安装形态：携带模板与 Dockerfile 资产及 `patent-services` console script。`patent` bundle 以两个 opt-in 门控挂载 client 行，默认都关闭（disabled——在 `dsh --profile patent --dump-config` 中可见，不在工具表）：设 `DSH_PATENT_SERVICES` 经 `uvx --from deepseek-harness-patent-services patent-services` 运行已安装的包；或设 `DSH_PATENT_SERVICES_DIR`（本检出的绝对路径）直接从源码运行模块。

## Known Limitations and Deferred Work

- **表格与图片不解析**——解析器只走段落；含表格内容的模板会在 Markdown 投影中丢失。
- **PDF 导出在 Windows 优先 Word COM**——weasyprint（需系统 GTK）仍是非 Windows 兜底；两条路径都把 docx 保留在 pdf 旁的 `exports/`。
- **无文件系统策略**——MCP stdio 服务运行在宿主进程的信任域内，在 dsh fs 沙箱之外；它看到模型传入的路径。
