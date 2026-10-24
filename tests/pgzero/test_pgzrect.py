"""Tests for pgzrect.Rect / ZRect.

Covers Requirement 12 (Rect/ZRect geometry), Property 3 (anchor consistency)
and Property 4 (collision symmetry). Property tests are skipped when hypothesis
is not installed.
"""

import unittest

from pgzrect import Rect, ZRect

try:
    from hypothesis import given, strategies as st
    HAVE_HYPOTHESIS = True
except Exception:
    HAVE_HYPOTHESIS = False


ANCHORS = [
    "topleft", "topright", "bottomleft", "bottomright", "center",
    "midtop", "midbottom", "midleft", "midright",
]


class TestRectConstruction(unittest.TestCase):
    def test_four_args(self):
        r = Rect(1, 2, 3, 4)
        self.assertEqual((r.x, r.y, r.width, r.height), (1, 2, 3, 4))

    def test_nested_pairs(self):
        r = Rect((1, 2), (3, 4))
        self.assertEqual((r.x, r.y, r.width, r.height), (1, 2, 3, 4))

    def test_single_sequence(self):
        r = Rect((1, 2, 3, 4))
        self.assertEqual((r.x, r.y, r.width, r.height), (1, 2, 3, 4))

    def test_from_rect(self):
        r = Rect(Rect(5, 6, 7, 8))
        self.assertEqual((r.x, r.y, r.width, r.height), (5, 6, 7, 8))

    def test_rect_truncates_to_int(self):
        r = Rect(1.9, 2.9, 3.9, 4.9)
        self.assertEqual((r.x, r.y, r.width, r.height), (1, 2, 3, 4))

    def test_zrect_keeps_floats(self):
        r = ZRect(1.5, 2.5, 3.0, 4.0)
        self.assertEqual((r.x, r.y, r.width, r.height), (1.5, 2.5, 3.0, 4.0))


class TestRectAnchors(unittest.TestCase):
    def test_center_read(self):
        r = Rect(0, 0, 10, 20)
        self.assertEqual(r.center, (5, 10))

    def test_right_bottom(self):
        r = Rect(2, 3, 10, 20)
        self.assertEqual(r.right, 12)
        self.assertEqual(r.bottom, 23)

    def test_write_right_moves_left(self):
        r = Rect(0, 0, 10, 10)
        r.right = 100
        self.assertEqual(r.left, 90)

    def test_write_midbottom(self):
        r = Rect(0, 0, 10, 10)
        r.midbottom = (50, 50)
        self.assertEqual(r.center[0], 50)
        self.assertEqual(r.bottom, 50)


class TestRectCollision(unittest.TestCase):
    def test_overlap(self):
        self.assertTrue(Rect(0, 0, 10, 10).colliderect(Rect(5, 5, 10, 10)))

    def test_no_overlap(self):
        self.assertFalse(Rect(0, 0, 10, 10).colliderect(Rect(20, 20, 5, 5)))

    def test_edge_touch_is_not_collision(self):
        # pygame: touching edges do not collide.
        self.assertFalse(Rect(0, 0, 10, 10).colliderect(Rect(10, 0, 10, 10)))

    def test_collidepoint(self):
        r = Rect(0, 0, 10, 10)
        self.assertTrue(r.collidepoint(5, 5))
        self.assertTrue(r.collidepoint((0, 0)))
        self.assertFalse(r.collidepoint(10, 10))   # right/bottom exclusive

    def test_contains(self):
        self.assertTrue(Rect(0, 0, 10, 10).contains(Rect(2, 2, 3, 3)))
        self.assertFalse(Rect(0, 0, 10, 10).contains(Rect(2, 2, 20, 3)))

    def test_clip(self):
        c = Rect(0, 0, 10, 10).clip(Rect(5, 5, 10, 10))
        self.assertEqual((c.x, c.y, c.width, c.height), (5, 5, 5, 5))

    def test_clip_no_overlap_is_empty(self):
        c = Rect(0, 0, 10, 10).clip(Rect(50, 50, 5, 5))
        self.assertEqual((c.width, c.height), (0, 0))

    def test_union(self):
        u = Rect(0, 0, 10, 10).union(Rect(20, 20, 10, 10))
        self.assertEqual((u.x, u.y, u.width, u.height), (0, 0, 30, 30))


# Property tests are only DEFINED when hypothesis is importable (see note in
# test_pgzcolor.py) so the module imports cleanly without hypothesis.
if HAVE_HYPOTHESIS:
    _coord = st.integers(min_value=-500, max_value=500)
    _dim = st.integers(min_value=1, max_value=500)
    _point = st.tuples(st.integers(-500, 500), st.integers(-500, 500))

    class TestRectProperties(unittest.TestCase):
        # Property 3: writing an anchor then reading it returns the written
        # value, and size is preserved. Validates Requirements 12.3, 12.4.
        # Use ZRect (exact float arithmetic) so the round-trip is exact; an
        # integer Rect can truncate centre coords for odd sizes (a pygame
        # quirk), which is covered by the unit tests instead.
        @given(_coord, _coord, _dim, _dim, st.sampled_from(ANCHORS), _point)
        def test_anchor_round_trip(self, x, y, w, h, anchor, p):
            r = ZRect(x, y, w, h)
            size_before = r.size
            setattr(r, anchor, (float(p[0]), float(p[1])))
            self.assertEqual(getattr(r, anchor), (float(p[0]), float(p[1])))
            self.assertEqual(r.size, size_before)

        # Property 4: colliderect is symmetric. Validates Requirement 12.5.
        @given(_coord, _coord, _dim, _dim, _coord, _coord, _dim, _dim)
        def test_collision_symmetry(self, ax, ay, aw, ah, bx, by, bw, bh):
            a = Rect(ax, ay, aw, ah)
            b = Rect(bx, by, bw, bh)
            self.assertEqual(a.colliderect(b), b.colliderect(a))


if __name__ == "__main__":
    unittest.main()
