"""Per-hook available-argument vocabularies (bridge-free, testable).

Mirrors the pgzero shim's _event_available in editor.html: given a hook name
and the raw event data from JS, build the dict of arguments the engine can
supply. The dispatcher then passes only the ones the student's handler names.

Design: "Handler Signature Introspection". Requirement 9.3.
"""

from __future__ import annotations


def event_available(hook, data):
    """Return the full available-arg dict for `hook` from raw `data`.

    `data` uses plain Python values (pos/rel as (x, y), buttons as a list of
    button-name strings, key as a name string, mod as int, unicode as str).
    """
    if hook in ("on_mouse_down", "on_mouse_up"):
        return {"pos": tuple(data["pos"]), "button": data["button"]}
    if hook == "on_mouse_move":
        return {"pos": tuple(data["pos"]), "rel": tuple(data["rel"]),
                "buttons": set(data["buttons"])}
    if hook == "on_key_down":
        return {"key": data["key"], "mod": int(data["mod"]), "unicode": data["unicode"]}
    if hook == "on_key_up":
        return {"key": data["key"], "mod": int(data["mod"])}
    if hook in ("draw", "on_music_end"):
        return {}
    if hook == "update":
        return {"dt": data["dt"]}
    return {}
