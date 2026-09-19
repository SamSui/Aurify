"""Server wiring: the MCP app exposes exactly the domain tools."""

from __future__ import annotations

import asyncio

from patent_services.server import mcp


def test_server_registers_the_eight_domain_tools():
    tools = {tool.name for tool in asyncio.run(mcp.list_tools())}
    assert tools == {"parse_disclosure_docx", "export_disclosure", "export_application_docs", "render_drawio_figure", "render_html_figure", "search_patent_archive", "run_experiment", "search_cn_patents"}

def test_fail_loud_keeps_the_domain_message_on_the_wire():
    """The SDK swallows non-ToolError exceptions into a bare 'Error executing
    tool' with no cause; fail_loud must convert the domain failure first so
    the remedy text (e.g. the proxy guidance on a dead search channel)
    reaches the model."""
    from mcp.server.mcpserver.exceptions import ToolError

    from patent_services.server import fail_loud

    @fail_loud
    def broken(query: str) -> str:
        raise RuntimeError("网络不可达：请开启代理后重试（connection refused）")

    try:
        broken(query="x")
        raise AssertionError("expected ToolError")
    except ToolError as exc:
        message = str(exc)
        assert "RuntimeError" in message
        assert "请开启代理" in message
        assert "Error executing tool" not in message


def test_fail_loud_passes_successes_and_tool_errors_through():
    from mcp.server.mcpserver.exceptions import ToolError

    from patent_services.server import fail_loud

    @fail_loud
    def fine(query: str) -> str:
        return f"ok:{query}"

    assert fine(query="x") == "ok:x"

    @fail_loud
    def anticipated(query: str) -> str:
        raise ToolError("检索词不能为空")

    try:
        anticipated(query="x")
        raise AssertionError("expected ToolError")
    except ToolError as exc:
        assert str(exc) == "检索词不能为空"
