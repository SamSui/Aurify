"""MCP stdio server exposing the patent domain tools to the dsh patent profile.

Eight tools land in the model's tool table under the ``mcp__patent__`` prefix:
``parse_disclosure_docx`` (template/reference parsing), ``export_disclosure``
and ``export_application_docs`` (the disclosure and application-set exports),
``render_drawio_figure`` and ``render_html_figure`` (figure rendering),
``search_patent_archive`` (archive search), ``run_experiment`` (docker
simulation runs with an automatic run log), and ``search_cn_patents``
(Chinese patent discovery). Run with ``python -m patent_services`` (stdio
transport, one instance per profile; see the dsh-mcp-client README for the
cordis.yml wiring).
"""

from __future__ import annotations

from pathlib import Path

from mcp.server.mcpserver import MCPServer

from . import experiments
from .export import _export_summary, export_application, export_project
from .parsing import parse_docx, parse_docx_to_file
from .prior_art import search_cn_patents
from .render import render_figure, render_html_figure
from .search import search_archive

mcp = MCPServer("patent")


@mcp.tool()
def parse_disclosure_docx(path: str, output_path: str | None = None) -> str:
    """Parse a Word disclosure/reference document into Markdown (three-level numbering).

    Args:
        path: absolute or working-directory-relative path of the .docx file.
        output_path: when given, also write the Markdown to this path.

    Returns:
        The parsed Markdown text.
    """
    if output_path is not None:
        parse_docx_to_file(path, output_path)
    return parse_docx(path)


@mcp.tool()
def export_disclosure(project_dir: str, fmt: str = "docx") -> str:
    """Export a patent project directory (patent.yml + brief.md + chapters/) to docx or pdf.

    Figures (figures/图N.png) embed into the 附图 section with the 图N label
    and caption below each image; PDF converts through hidden-window Word COM
    when available (the docx stays beside the pdf), falling back to weasyprint.

    Args:
        project_dir: the patent project directory.
        fmt: ``docx`` (default) or ``pdf``.

    Returns:
        The written file's path plus the embedded figure count — the model
        reads it back and must not present a zero-figure export as complete
        when the 附图说明 chapter declares figures.
    """
    written = export_project(project_dir, fmt)
    return _export_summary(written, Path(project_dir))


@mcp.tool()
def export_application_docs(project_dir: str, fmt: str = "docx") -> str:
    """Export the application document set (application/claims.md, description.md, abstract.md) to docx or pdf.

    With final figures present, 摘要附图 (图1) and 说明书附图 (all figures)
    join the set as the submitted package does; PDF mirrors export_disclosure.

    Args:
        project_dir: the patent project directory holding application/.
        fmt: ``docx`` (default) or ``pdf``.

    Returns:
        The written file's path plus the embedded figure count, with a
        warning when the 附图说明 chapter declares figures the export did
        not embed (naming misses die loudly here, not in the reader's hands).
    """
    written = export_application(project_dir, fmt)
    return _export_summary(written, Path(project_dir))


@mcp.tool()
def render_drawio_figure(source: str, fmt: str = "png") -> str:
    """Render one drawio figure source to png/pdf/svg/jpg.

    A source under ``figures/source/`` lands in ``figures/`` (the root stays
    a final-images-only surface); any other source renders beside itself.

    Runs the native draw.io Desktop CLI when discoverable (DSH_DRAWIO_BIN, or
    `draw.io` on PATH, or the per-user Windows install); without one, falls
    back to the docker exporter image (DSH_DRAWIO_DOCKER_IMAGE, default
    q771103517/dsh-patent:latest — published to Docker Hub, so a missing
    image auto-pulls; buildable from the shipped Dockerfile.drawio).

    Args:
        source: the .drawio file path.
        fmt: ``png`` (default), ``pdf``, ``svg``, or ``jpg``.

    Returns:
        The written image's path.
    """
    return render_figure(source, fmt)


@mcp.tool()
def render_html_figure(source: str, fmt: str = "png") -> str:
    """Rasterize one self-contained HTML figure (diagram-design output) to png/jpg beside it.

    Runs the Edge/Chrome headless screenshot (DSH_HTML_BROWSER overrides the
    executable). A source under figures/source/ lands in figures/, keeping
    the root a final-images-only surface.

    Args:
        source: the ``.html`` file path.
        fmt: ``png`` (default) or ``jpg``.

    Returns:
        The written image's path.
    """
    return render_html_figure(source, fmt)


@mcp.tool()
def run_experiment(project_dir: str, experiment: str, command: str = "python run.py", timeout_seconds: int = 1800) -> str:
    """Run one simulation experiment in the docker runner and record it in the run log.

    The experiment lives at ``<project_dir>/experiments/<experiment>/`` (entry
    script, ``requirements.txt`` for deps beyond the image's baked stack, and
    ``results/`` for artifacts). The project mounts at ``/workspace`` and the
    working directory is the experiment directory, so relative writes land in
    ``results/``. Every invocation — success, failure, or timeout — appends a
    run record (time, image, command, exit code, output tail) to
    ``results/run-log.md``; every number quoted into the disclosure must point
    at one of these records. The image (DSH_PATENT_EXPERIMENT_IMAGE, default
    q771103517/dsh-patent-experiment:latest — published to Docker Hub, so a
    missing image auto-pulls; buildable from the shipped
    Dockerfile.experiment) ships numpy/scipy/pandas/matplotlib/openpyxl and
    CJK fonts for Chinese matplotlib labels.

    Args:
        project_dir: the patent project directory (absolute path recommended).
        experiment: the experiment slug (a single directory name under ``experiments/``).
        command: the shell command to run in the experiment directory (default ``python run.py``).
        timeout_seconds: wall-clock budget, 30-7200 (default 1800).

    Returns:
        The run's output tail plus the run log's path.
    """
    return experiments.run_experiment(project_dir, experiment, command, timeout_seconds)


@mcp.tool()
def search_patent_archive(query: str, archive_dir: str, limit: int = 8) -> str:
    """Search an archive of Markdown files (past projects, reference docs) for prior writing.

    Chinese-aware full-text search (jieba + BM25): pass the workspace holding
    past patent projects, or one project's reference/ folder.

    Args:
        query: free-text query (Chinese or mixed).
        archive_dir: the archive root directory to search under.
        limit: maximum hits, 1-50 (default 8).

    Returns:
        One line per hit: relative path, title, and a centered snippet.
    """
    hits = search_archive(query, archive_dir, limit)
    if not hits:
        return "没有命中。"
    return "\n".join(f"{hit['path']} ｜ {hit['title']} ｜ {hit['snippet']}" for hit in hits)


@mcp.tool()
def search_cn_patents(query: str, limit: int = 10, since_year: int | None = None) -> str:
    """Discover Chinese patents on Google Patents for prior-art and background research.

    Pass the core technical feature words in Chinese (synonyms broaden the
    net). Returns the closest CN publications — publication number, title,
    assignee, priority date — one line each; read a hit's abstract and claim 1
    by web_fetching https://patents.google.com/patent/<公开号>/zh. Every
    publication number quoted into the disclosure must come from this result
    or from a fetched detail page — never invent one. The host needs network
    access to patents.google.com (a system proxy is the usual route); an
    unreachable endpoint fails loud with guidance instead of an empty result.

    Args:
        query: free-text query in Chinese (or mixed).
        limit: maximum hits, 1-10 (default 10).
        since_year: when given, only results filed in or after this year.

    Returns:
        One line per hit plus the detail-page reading hint.
    """
    return search_cn_patents(query, limit, since_year)


def main() -> None:
    """Run the stdio server until the client disconnects."""
    mcp.run()
