"""Server wiring: the MCP app exposes exactly the domain tools."""

from __future__ import annotations

import asyncio

from patent_services.server import mcp


def test_server_registers_the_eight_domain_tools():
    tools = {tool.name for tool in asyncio.run(mcp.list_tools())}
    assert tools == {"parse_disclosure_docx", "export_disclosure", "export_application_docs", "render_drawio_figure", "render_html_figure", "search_patent_archive", "run_experiment", "search_cn_patents"}
