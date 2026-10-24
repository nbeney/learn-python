"""Colour normalisation for the pgzero shim (bridge-free, unit/property testable).

This module deliberately has NO `from js import ...` so it can be imported and
tested under plain CPython as well as inside Pyodide. The pgzero shim in
editor.html uses the same logic to turn the colour forms Pygame Zero accepts
(a name string, an ``(r, g, b)`` / ``(r, g, b, a)`` tuple, or a hex string)
into a single CSS colour string before crossing the JS bridge.

Design: "Color value handling" / Requirement 6. Property 5 (normalisation
stability): normalising an already-normalised CSS string is idempotent.
"""

from __future__ import annotations


def _clamp_byte(v) -> int:
    """Clamp a number to an integer in 0..255."""
    try:
        n = int(round(float(v)))
    except (TypeError, ValueError):
        raise ValueError(f"invalid colour channel: {v!r}")
    return max(0, min(255, n))


def _is_css_string(s: str) -> bool:
    """True if `s` already looks like a CSS colour this module would emit."""
    return s.startswith("rgb(") or s.startswith("rgba(") or (
        s.startswith("#") and len(s) in (4, 7, 9)
    )


def normalise_color(color) -> str:
    """Return a CSS colour string for any pgzero colour value.

    Accepts:
      * a CSS/name string (e.g. "red", "#ff8800", "0xff8800", "rgb(...)")
      * an (r, g, b) tuple/list of 0..255 ints
      * an (r, g, b, a) tuple/list; alpha 0..255 -> CSS rgba() 0..1

    The result is a CSS string. Re-normalising a string this function produced
    returns the same string (idempotence), which Property 5 relies on.
    """
    # Already a string: normalise a couple of forms, otherwise pass through.
    if isinstance(color, str):
        s = color.strip()
        # "0xRRGGBB" -> "#RRGGBB" (a hex form pgzero/ptext accepts).
        if s.lower().startswith("0x") and len(s) == 8:
            return "#" + s[2:].lower()
        # Lowercase bare hex so idempotence holds (#FF.. -> #ff..).
        if s.startswith("#"):
            return s.lower()
        return s

    # Tuple / list of channels.
    if isinstance(color, (tuple, list)):
        if len(color) == 3:
            r, g, b = (_clamp_byte(c) for c in color)
            return f"rgb({r},{g},{b})"
        if len(color) == 4:
            r, g, b = (_clamp_byte(c) for c in color[:3])
            a = max(0.0, min(1.0, float(color[3]) / 255.0))
            # Trim the alpha to a stable, short decimal so re-normalising is
            # stable (the value is already a CSS string on the second pass).
            a = round(a, 4)
            return f"rgba({r},{g},{b},{a})"
        raise ValueError(f"colour sequence must have 3 or 4 values: {color!r}")

    raise ValueError(f"unsupported colour value: {color!r}")
