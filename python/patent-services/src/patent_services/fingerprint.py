"""The source-set digest stamped beside exported docx files.

Cross-language contract with the TypeScript loop assessor
(``packages/patent/tool-patent/src/fingerprint.ts``): the same file set (top
level files of ``chapters/`` and ``figures/``, plus ``brief.md``), the same
hash input (``relPath \\0 bytes \\0`` per file, sorted by relPath, forward
slashes), the same 16-hex-char sha256 prefix. The loop's export gate compares
the sidecar against its own digest, so an export is stale exactly when the
bytes it projected changed — git checkouts and syncs that rewrite mtimes no
longer read as fresh or stale. Both test suites pin one fixture to one
hardcoded digest; change the algorithm in all three places or not at all.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

#: Digest length kept in sidecars (64 bits of sha256).
FINGERPRINT_LENGTH = 16

#: Directories whose top-level files join the digest, beside ``brief.md``.
SOURCE_DIRS = ("chapters", "figures")


def source_fingerprint(root: Path) -> str:
    """Compute the source fingerprint for one patent project directory.

    Args:
        root: the project directory.

    Returns:
        The first 16 hex chars of the sha256 over the set files; files
        missing from the set simply do not contribute.
    """
    root = Path(root)
    paths: list[str] = []
    for directory in SOURCE_DIRS:
        dir_path = root / directory
        if not dir_path.is_dir():
            continue
        paths.extend(
            f"{directory}/{entry.name}" for entry in dir_path.iterdir() if entry.is_file()
        )
    if (root / "brief.md").is_file():
        paths.append("brief.md")
    digest = hashlib.sha256()
    for rel_path in sorted(paths):
        digest.update(rel_path.encode("utf-8"))
        digest.update(b"\0")
        digest.update((root / rel_path).read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()[:FINGERPRINT_LENGTH]
