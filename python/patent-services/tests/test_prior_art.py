"""search_cn_patents URL construction, payload parsing, and dead ends."""

from __future__ import annotations

import json
import urllib.request

import pytest

from patent_services.prior_art import build_search_url, search_cn_patents

SAMPLE_PAYLOAD = {
    "results": {
        "total_num_results": 328,
        "cluster": [
            {
                "result": [
                    {"patent": {
                        "publication_number": "CN110123456A",
                        "title": "一种分区光配方的植物补光灯控制方法",
                        "assignee": "广东某照明股份有限公司",
                        "priority_date": "2019-08-01",
                    }},
                    {"patent": {
                        "publication_number": "CN108765432B",
                        "title": "  植物生长灯\n的光谱调节装置  ",
                        "assignee": "",
                        "priority_date": "2018-05-14",
                    }},
                ],
            },
        ],
    },
}


def test_url_encodes_the_inner_query_exactly_once():
    url = build_search_url("植物补光灯 分区光配方")
    assert url.startswith("https://patents.google.com/xhr/query?")
    assert "country%3DCN" in url
    assert "%25" not in url  # exactly one encoding pass, no double escaping


def test_url_since_year_adds_priority_filter():
    url = build_search_url("缓存管理", since_year=2020)
    assert "after%3Dpriority%3A20200101" in url


def test_formats_hits_one_line_each(monkeypatch):
    def fake_urlopen(request, timeout):
        class Response:
            status = 200

            def read(self):
                return json.dumps(SAMPLE_PAYLOAD).encode("utf-8")

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

        return Response()

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    text = search_cn_patents("分区光配方")
    assert "共 328 条命中" in text
    assert "CN110123456A ｜ 一种分区光配方的植物补光灯控制方法 ｜ 广东某照明股份有限公司 ｜ 2019-08-01" in text
    # whitespace in titles collapses; the empty assignee drops out
    assert "CN108765432B ｜ 植物生长灯 的光谱调节装置 ｜ 2018-05-14" in text
    assert "web_fetch" in text


def test_limit_slices_the_page(monkeypatch):
    def fake_urlopen(request, timeout):
        payload = json.loads(json.dumps(SAMPLE_PAYLOAD))
        extra = [{"patent": {"publication_number": f"CN10000000{i}A", "title": f"专利{i}"}} for i in range(20)]
        payload["results"]["cluster"][0]["result"] = extra
        class Response:
            status = 200

            def read(self):
                return json.dumps(payload).encode("utf-8")

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

        return Response()

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    text = search_cn_patents("任意", limit=3)
    assert text.count("CN1000") == 3


def test_unreachable_network_names_the_proxy(monkeypatch):
    def fake_urlopen(request, timeout):
        raise OSError("timed out")

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    with pytest.raises(RuntimeError, match="代理"):
        search_cn_patents("任意")


def test_unrecognized_payload_carries_the_head(monkeypatch):
    def fake_urlopen(request, timeout):
        class Response:
            status = 200

            def read(self):
                return b'{"quota_exceeded": true}'

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

        return Response()

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    with pytest.raises(RuntimeError, match="quota_exceeded"):
        search_cn_patents("任意")


def test_no_hits_reads_as_zero(monkeypatch):
    def fake_urlopen(request, timeout):
        class Response:
            status = 200

            def read(self):
                return b'{"results": {"total_num_results": 0, "cluster": []}}'

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

        return Response()

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    assert "无命中" in search_cn_patents("生僻词组合")


def test_validation():
    with pytest.raises(ValueError, match="检索词"):
        search_cn_patents("   ")
    with pytest.raises(ValueError, match="limit"):
        search_cn_patents("任意", limit=0)
    with pytest.raises(ValueError, match="limit"):
        search_cn_patents("任意", limit=11)
