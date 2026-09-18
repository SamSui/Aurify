"""Docx → Markdown parsing for uploaded disclosure templates.

The three-level numbering strategy is ported from TianGong's ``app/parsing``
design: a paragraph becomes a section heading when its style says so or when
its leading text matches one of the recognized Chinese patent numbering
conventions (chapters ``第一章/一、`` at level one, ``1.1`` / ``（一）`` at
level two, ``1.1.1`` at level three). Everything else stays a plain paragraph.
"""

from __future__ import annotations

import re
from pathlib import Path

from docx import Document

#: Explicit Word heading styles mapped to Markdown levels (Chinese Word
#: installations name the same styles ``标题 1``…).
_HEADING_STYLES = ("heading", "标题")

#: Numbering conventions recognized as level-one sections.
_LEVEL1 = re.compile(r"^(第[一二三四五六七八九十百千]+[章节]|[一二三四五六七八九十]+、|\d+[、.．)）]\s?\S)")

#: Level-two conventions: ``1.1`` / ``（一）`` / ``(一)``.
_LEVEL2 = re.compile(r"^(\d+\.\d+[^\d.]|[（(][一二三四五六七八九十]+[)）])")

#: Level-three conventions: ``1.1.1``.
_LEVEL3 = re.compile(r"^\d+\.\d+\.\d+")


def _heading_level(paragraph) -> int | None:
    """Return the Markdown level if the paragraph is a section heading, else None."""
    style = (paragraph.style.name or "").lower()
    if any(marker in style for marker in _HEADING_STYLES):
        for size in (1, 2, 3, 4):
            if style.endswith(str(size)):
                return size
        return 1
    text = paragraph.text.strip()
    if not text:
        return None
    if _LEVEL3.match(text):
        return 3
    if _LEVEL2.match(text):
        return 2
    if _LEVEL1.match(text):
        return 1
    return None


def parse_docx(path: str) -> str:
    """Parse one docx file into Markdown text.

    Headings become ``#`` lines by their three-level numbering, plain
    paragraphs keep their text, and blank paragraphs become blank lines.
    Tables and embedded images are skipped (documented limitation).
    """
    document = Document(path)
    lines: list[str] = []
    for paragraph in document.paragraphs:
        text = paragraph.text.strip()
        level = _heading_level(paragraph)
        if level is not None and text:
            lines.append("")
            lines.append(f"{'#' * level} {text}")
        elif text:
            lines.append(text)
        else:
            lines.append("")
    return "\n".join(lines).strip() + "\n"


def parse_docx_to_file(path: str, output_path: str) -> str:
    """Parse one docx and write the Markdown next to the project's reference dir.

    Returns the output path.
    """
    markdown = parse_docx(path)
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(markdown, encoding="utf-8")
    return str(output)
