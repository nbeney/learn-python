"""Rect / ZRect geometry for the pgzero shim (bridge-free, testable).

Mirrors the subset of pygame's Rect that Pygame Zero exposes: construction from
(x, y, w, h), ((x, y), (w, h)) or another rect; the full set of readable and
writable anchor attributes (writing an anchor moves the rect, preserving size);
and the collision/combination methods colliderect, collidepoint, contains,
clip, union.

`Rect` stores integer-truncated geometry like pygame; `ZRect` keeps floats.
Both share the same API via a common base.

Design: "Actors, Rect, and Collision". Requirement 12. Properties 3 (anchor
consistency) and 4 (collision symmetry).
"""

from __future__ import annotations


def _coerce_args(args):
    """Normalise the various Rect constructor forms to (x, y, w, h)."""
    if len(args) == 1:
        a = args[0]
        # Another rect-like: has x, y, width, height.
        if hasattr(a, "x") and hasattr(a, "y") and hasattr(a, "width") and hasattr(a, "height"):
            return a.x, a.y, a.width, a.height
        # A 4-sequence, or a 2-sequence of 2-sequences.
        seq = list(a)
        if len(seq) == 4:
            return seq[0], seq[1], seq[2], seq[3]
        if len(seq) == 2:
            (x, y), (w, h) = seq
            return x, y, w, h
        raise TypeError("Rect accepts (x,y,w,h), ((x,y),(w,h)) or a rect")
    if len(args) == 2:
        (x, y), (w, h) = args
        return x, y, w, h
    if len(args) == 4:
        return args
    raise TypeError("Rect accepts (x,y,w,h), ((x,y),(w,h)) or a rect")


class _BaseRect:
    # Subclasses set _num (int or float coercion).
    def __init__(self, *args):
        x, y, w, h = _coerce_args(args)
        self._x = self._num(x)
        self._y = self._num(y)
        self._w = self._num(w)
        self._h = self._num(h)

    # --- numeric coercion (overridden by Rect for int truncation) ---
    @staticmethod
    def _num(v):
        return float(v)

    def copy(self):
        return type(self)(self._x, self._y, self._w, self._h)

    # --- core edges ---
    @property
    def x(self): return self._x
    @x.setter
    def x(self, v): self._x = self._num(v)

    @property
    def y(self): return self._y
    @y.setter
    def y(self, v): self._y = self._num(v)

    @property
    def width(self): return self._w
    @width.setter
    def width(self, v): self._w = self._num(v)

    @property
    def height(self): return self._h
    @height.setter
    def height(self, v): self._h = self._num(v)

    @property
    def left(self): return self._x
    @left.setter
    def left(self, v): self._x = self._num(v)

    @property
    def top(self): return self._y
    @top.setter
    def top(self, v): self._y = self._num(v)

    @property
    def right(self): return self._x + self._w
    @right.setter
    def right(self, v): self._x = self._num(v) - self._w

    @property
    def bottom(self): return self._y + self._h
    @bottom.setter
    def bottom(self, v): self._y = self._num(v) - self._h

    @property
    def centerx(self): return self._x + self._w / 2
    @centerx.setter
    def centerx(self, v): self._x = self._num(v) - self._w / 2

    @property
    def centery(self): return self._y + self._h / 2
    @centery.setter
    def centery(self, v): self._y = self._num(v) - self._h / 2

    @property
    def size(self): return (self._w, self._h)
    @size.setter
    def size(self, v): self._w, self._h = self._num(v[0]), self._num(v[1])

    # --- paired anchor points (getter returns tuple, setter moves rect) ---
    @property
    def topleft(self): return (self.left, self.top)
    @topleft.setter
    def topleft(self, p): self.left, self.top = p

    @property
    def topright(self): return (self.right, self.top)
    @topright.setter
    def topright(self, p): self.right, self.top = p

    @property
    def bottomleft(self): return (self.left, self.bottom)
    @bottomleft.setter
    def bottomleft(self, p): self.left, self.bottom = p

    @property
    def bottomright(self): return (self.right, self.bottom)
    @bottomright.setter
    def bottomright(self, p): self.right, self.bottom = p

    @property
    def center(self): return (self.centerx, self.centery)
    @center.setter
    def center(self, p): self.centerx, self.centery = p

    @property
    def midtop(self): return (self.centerx, self.top)
    @midtop.setter
    def midtop(self, p): self.centerx, self.top = p

    @property
    def midbottom(self): return (self.centerx, self.bottom)
    @midbottom.setter
    def midbottom(self, p): self.centerx, self.bottom = p

    @property
    def midleft(self): return (self.left, self.centery)
    @midleft.setter
    def midleft(self, p): self.left, self.centery = p

    @property
    def midright(self): return (self.right, self.centery)
    @midright.setter
    def midright(self, p): self.right, self.centery = p

    # --- collision / combination ---
    def colliderect(self, other) -> bool:
        ox, oy, ow, oh = other.x, other.y, other.width, other.height
        # Zero-area rects never collide (matches pygame).
        if self._w <= 0 or self._h <= 0 or ow <= 0 or oh <= 0:
            return False
        return (self._x < ox + ow and ox < self._x + self._w and
                self._y < oy + oh and oy < self._y + self._h)

    def collidepoint(self, *p) -> bool:
        if len(p) == 1:
            px, py = p[0]
        else:
            px, py = p
        return (self._x <= px < self._x + self._w and
                self._y <= py < self._y + self._h)

    def contains(self, other) -> bool:
        ox, oy, ow, oh = other.x, other.y, other.width, other.height
        return (self._x <= ox and self._y <= oy and
                ox + ow <= self._x + self._w and
                oy + oh <= self._y + self._h)

    def clip(self, other):
        """Return the overlapping region as a new rect (empty if no overlap)."""
        ox, oy, ow, oh = other.x, other.y, other.width, other.height
        nx = max(self._x, ox)
        ny = max(self._y, oy)
        nr = min(self._x + self._w, ox + ow)
        nb = min(self._y + self._h, oy + oh)
        if nr <= nx or nb <= ny:
            return type(self)(self._x, self._y, 0, 0)
        return type(self)(nx, ny, nr - nx, nb - ny)

    def union(self, other):
        """Return the smallest rect containing both rects."""
        ox, oy, ow, oh = other.x, other.y, other.width, other.height
        nx = min(self._x, ox)
        ny = min(self._y, oy)
        nr = max(self._x + self._w, ox + ow)
        nb = max(self._y + self._h, oy + oh)
        return type(self)(nx, ny, nr - nx, nb - ny)

    def __repr__(self):
        return f"{type(self).__name__}({self._x}, {self._y}, {self._w}, {self._h})"

    def __eq__(self, other):
        try:
            return (self._x, self._y, self._w, self._h) == (
                other.x, other.y, other.width, other.height)
        except AttributeError:
            return NotImplemented


class Rect(_BaseRect):
    """Integer rectangle (pygame truncates to int)."""
    @staticmethod
    def _num(v):
        return int(v)


class ZRect(_BaseRect):
    """Float-friendly rectangle (pgzero's ZRect)."""
    @staticmethod
    def _num(v):
        return float(v)
