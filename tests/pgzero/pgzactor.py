"""Actor geometry (bridge-free, testable).

Mirrors the pure-Python geometry of the pgzero shim's `Actor` in editor.html:
anchor/pos delegation to a backing ZRect, anchor-preserving resizing, angle,
opacity, distance_to/angle_to maths, and collision delegation. No canvas, no
`from js import` — image sizes are supplied via an injectable lookup so it runs
under plain CPython.

Design: "Actors, Rect, and Collision". Requirement 14.
"""

from __future__ import annotations

import math

from pgzrect import ZRect

ANCHOR_FRACTIONS = {
    "topleft": (0.0, 0.0), "midtop": (0.5, 0.0), "topright": (1.0, 0.0),
    "midleft": (0.0, 0.5), "center": (0.5, 0.5), "centre": (0.5, 0.5),
    "midright": (1.0, 0.5), "bottomleft": (0.0, 1.0), "midbottom": (0.5, 1.0),
    "bottomright": (1.0, 1.0),
}

RECT_ATTRS = (
    "x", "y", "left", "right", "top", "bottom", "width", "height",
    "centerx", "centery", "size", "topleft", "topright", "bottomleft",
    "bottomright", "center", "midtop", "midbottom", "midleft", "midright",
)


def _target_pos(target):
    if isinstance(target, Actor):
        return target.pos
    if hasattr(target, "center"):
        return target.center
    return (target[0], target[1])


class Actor:
    """Sprite geometry backed by a ZRect sized from the image.

    `size_lookup(name) -> (w, h)` supplies the image's natural size.
    """

    def __init__(self, image, size_lookup, pos=None, anchor=None, **kwargs):
        object.__setattr__(self, "_size_lookup", size_lookup)
        object.__setattr__(self, "_name", image)
        w, h = size_lookup(image)
        object.__setattr__(self, "_rect", ZRect(0, 0, w, h))
        object.__setattr__(self, "_anchor", anchor if anchor is not None else "center")
        object.__setattr__(self, "angle", 0.0)
        object.__setattr__(self, "opacity", 1.0)
        if pos is not None:
            self.pos = pos
        else:
            placed = False
            for k in ("topleft", "topright", "bottomleft", "bottomright",
                      "midtop", "midbottom", "midleft", "midright",
                      "center", "pos"):
                if k in kwargs:
                    setattr(self, k, kwargs[k])
                    placed = True
                    break
            if not placed:
                self.pos = (0, 0)

    # --- image ---
    @property
    def image(self):
        return self._name

    @image.setter
    def image(self, value):
        w, h = self._size_lookup(value)
        ax, ay = self._anchor_point()
        object.__setattr__(self, "_name", value)
        self._rect.size = (w, h)
        self._set_anchor_point(ax, ay)

    # --- anchor ---
    @property
    def anchor(self):
        return self._anchor

    @anchor.setter
    def anchor(self, value):
        ax, ay = self._anchor_point()
        object.__setattr__(self, "_anchor", value)
        self._set_anchor_point(ax, ay)

    def _anchor_fraction(self):
        a = self._anchor
        if isinstance(a, str):
            return ANCHOR_FRACTIONS.get(a.lower(), (0.5, 0.5))
        w = self._rect.width or 1
        h = self._rect.height or 1
        return a[0] / w, a[1] / h

    def _anchor_point(self):
        fx, fy = self._anchor_fraction()
        return (self._rect.left + fx * self._rect.width,
                self._rect.top + fy * self._rect.height)

    def _set_anchor_point(self, px, py):
        fx, fy = self._anchor_fraction()
        self._rect.left = px - fx * self._rect.width
        self._rect.top = py - fy * self._rect.height

    # --- pos ---
    @property
    def pos(self):
        return self._anchor_point()

    @pos.setter
    def pos(self, value):
        self._set_anchor_point(value[0], value[1])

    # --- rect delegation ---
    def __getattr__(self, name):
        if name in RECT_ATTRS:
            return getattr(self._rect, name)
        raise AttributeError(name)

    def __setattr__(self, name, value):
        if name in RECT_ATTRS:
            setattr(self._rect, name, value)
        else:
            object.__setattr__(self, name, value)

    # --- maths ---
    def distance_to(self, target):
        tx, ty = _target_pos(target)
        px, py = self.pos
        return math.hypot(tx - px, ty - py)

    def angle_to(self, target):
        tx, ty = _target_pos(target)
        px, py = self.pos
        return math.degrees(math.atan2(py - ty, tx - px))

    # --- collisions ---
    def colliderect(self, other):
        o = other._rect if isinstance(other, Actor) else other
        return self._rect.colliderect(o)

    def collidepoint(self, *p):
        return self._rect.collidepoint(*p)

    def __repr__(self):
        return "<Actor %r pos=%r>" % (self._name, self.pos)
