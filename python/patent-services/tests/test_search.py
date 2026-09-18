"""search_archive FTS5 round-trips over a small fake archive."""

from __future__ import annotations

import pytest

from patent_services.search import collect_markdown, search_archive, tokenize


def build_archive(root):
    (root / "project-a" / "chapters").mkdir(parents=True)
    (root / "project-a" / "chapters" / "05-solution.md").write_text(
        "# 发明内容\n\n动态评估模块按热度阈值分层存储，命中率提升。\n", encoding="utf-8"
    )
    (root / "project-b" / "reference").mkdir(parents=True)
    (root / "project-b" / "reference" / "prior-art.md").write_text(
        "# 现有技术\n\n定时开关不看作物状态，能耗浪费大。\n", encoding="utf-8"
    )
    (root / "project-a" / "exports").mkdir()
    (root / "project-a" / "exports" / "noise.md").write_text("不应被索引", encoding="utf-8")
    return root


def test_search_ranks_the_matching_document_first(tmp_path):
    archive = build_archive(tmp_path / "archive")
    hits = search_archive("分层存储 命中率", str(archive))
    assert hits
    assert hits[0]["path"].endswith("05-solution.md")
    assert hits[0]["title"] == "发明内容"
    assert "分层存储" in hits[0]["snippet"] or "命中率" in hits[0]["snippet"]


def test_search_matches_across_projects(tmp_path):
    archive = build_archive(tmp_path / "archive")
    hits = search_archive("能耗 浪费", str(archive))
    assert any(hit["path"].endswith("prior-art.md") for hit in hits)


def test_search_ignores_exports_noise(tmp_path):
    archive = build_archive(tmp_path / "archive")
    hits = search_archive("不应被索引", str(archive))
    assert all(not hit["path"].endswith("noise.md") for hit in hits)


def test_search_limit_caps_hits(tmp_path):
    archive = build_archive(tmp_path / "archive")
    hits = search_archive("技术", str(archive), limit=1)
    assert len(hits) <= 1


def test_search_empty_query_fails(tmp_path):
    archive = build_archive(tmp_path / "archive")
    with pytest.raises(ValueError, match="empty query"):
        search_archive("  ", str(archive))


def test_search_missing_directory_fails(tmp_path):
    with pytest.raises(ValueError, match="no Markdown files"):
        search_archive("任意", str(tmp_path / "nowhere"))


def test_search_limit_validated(tmp_path):
    archive = build_archive(tmp_path / "archive")
    with pytest.raises(ValueError, match="1-50"):
        search_archive("技术", str(archive), limit=0)


def test_collect_markdown_caps_and_skips(tmp_path, monkeypatch):
    archive = build_archive(tmp_path / "archive")
    monkeypatch.setattr("patent_services.search.MAX_FILES", 1)
    files = collect_markdown(str(archive))
    assert len(files) == 1


def test_tokenize_drops_short_tokens():
    tokens = tokenize("一种 多分区 控制").split()
    assert "控制" in tokens
    assert "一" not in tokens
