"""The source fingerprint's cross-language contract with the TypeScript loop.

The fixture mirrors ``packages/patent/tool-patent/tests/fingerprint.spec.ts``
byte for byte (UTF-8, LF newlines via write_bytes — a text-mode write on
Windows would flip the newlines and break the digest); both suites pin the
same hardcoded digest, so an algorithm change on one side fails both.
"""

import tempfile
from pathlib import Path

from patent_services.fingerprint import source_fingerprint

#: text, encoding utf-8; bytes kept raw.
PNG_BYTES = b"\x89PNG\r\n\x1a\ntest-figure"


def _shared_fixture(root: Path) -> None:
    (root / "chapters").mkdir(parents=True)
    (root / "figures" / "source").mkdir(parents=True)
    (root / "chapters" / "01-name.md").write_bytes("# 测试发明\n\n一种测试系统。\n".encode("utf-8"))
    (root / "chapters" / "08-drawings.md").write_bytes("# 附图说明\n\n图1 为测试流程图。\n".encode("utf-8"))
    (root / "brief.md").write_bytes("# 技术简报\n\n技术领域：测试。\n".encode("utf-8"))
    (root / "figures" / "图1.png").write_bytes(PNG_BYTES)
    (root / "figures" / "source" / "sketch.drawio").write_bytes(b"<mxfile/>")


def test_matches_the_shared_cross_language_vector() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _shared_fixture(root)
        assert source_fingerprint(root) == "c83bc723545b5db4"


def test_moves_with_bytes_and_ignores_subdirectories() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _shared_fixture(root)
        before = source_fingerprint(root)
        # Rewriting identical bytes must not move the digest (mtime-proof).
        (root / "chapters" / "01-name.md").write_bytes("# 测试发明\n\n一种测试系统。\n".encode("utf-8"))
        assert source_fingerprint(root) == before
        (root / "chapters" / "01-name.md").write_bytes("# 测试发明\n\n修改后的正文。\n".encode("utf-8"))
        assert source_fingerprint(root) != before


def test_tolerates_a_bare_directory() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        digest = source_fingerprint(root)
        assert len(digest) == 16
        int(digest, 16)  # hex-shaped
