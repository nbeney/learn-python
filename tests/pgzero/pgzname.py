"""Asset-name validation + path resolution (bridge-free, testable).

Mirrors the logic the pgzero shim in editor.html uses to validate asset names
before touching the filesystem. Kept here with no `from js import` so it runs
under plain CPython.

Pygame Zero requires asset names to be lowercase letters, digits and
underscores, starting with a letter. Invalid names must raise BEFORE any FS
access; valid names resolve to `<area>/<name>.<ext>` for the known extensions.

Design: "Asset Pipeline" (Name restrictions). Requirement 18.
Property 8 (asset name validity).
"""

from __future__ import annotations

import re

_NAME_RE = re.compile(r"^[a-z][a-z0-9_]*$")

# Known extensions per media type, in resolution order.
EXTENSIONS = {
    "images": ("png", "jpg", "jpeg", "gif"),
    "sounds": ("wav", "ogg"),
    "music": ("mp3", "ogg"),
}


def valid_name(name) -> bool:
    """True iff `name` is a valid pgzero asset name."""
    return isinstance(name, str) and bool(_NAME_RE.match(name))


def check_name(kind: str, name) -> None:
    """Raise KeyError for an invalid asset name (before any FS access)."""
    if not valid_name(name):
        raise KeyError(
            "%s name must be lowercase letters, numbers and underscores, "
            "starting with a letter (got %r)" % (kind, name))


def resolve(area: str, name, exists) -> str:
    """Resolve `<area>/<name>.<ext>` using an `exists(path)` predicate.

    Validates the name first (raising before probing), then tries each known
    extension for the media area, returning the first path that exists. Raises
    KeyError if no candidate file exists.
    """
    check_name(area.rstrip("s"), name)
    for ext in EXTENSIONS.get(area, ()):  # noqa: B007 - ext used in path
        path = "%s/%s.%s" % (area, name, ext)
        if exists(path):
            return path
    raise KeyError("no %s found for %r in %s/" % (area.rstrip("s"), name, area))
