"""Greedy word-wrap for ptext (bridge-free, testable with a mock measurer).

Mirrors the wrap logic the pgzero shim uses in editor.html's jsPgzWrap, but
with an injectable text measurer so it can be unit-tested without a canvas.

Design: "ptext Rendering". Requirement 5.5 (word-wrap within width).
"""

from __future__ import annotations


def wrap(text, width, measure):
    """Wrap `text` to `width` using `measure(s) -> pixel width`.

    Always breaks on explicit newlines. If `width` is falsy, only newlines
    split lines. Wrapping happens at spaces; a single over-long word is not
    broken (matches ptext).
    """
    out = []
    for para in str(text).split("\n"):
        if not width:
            out.append(para)
            continue
        words = para.split(" ")
        line = ""
        for w in words:
            trial = (line + " " + w) if line else w
            if measure(trial) > width and line:
                out.append(line)
                line = w
            else:
                line = trial
        out.append(line)
    return out
