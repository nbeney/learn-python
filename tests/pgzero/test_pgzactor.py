"""Tests for pgzactor.Actor geometry.

Covers Requirement 14 (Actor): anchor/pos delegation, anchor-preserving image
resize, distance_to/angle_to maths, and collision delegation. Pure Python, no
canvas. Property tests are skipped without hypothesis.
"""

import math
import unittest

from pgzactor import Actor
from pgzrect import ZRect

try:
    from hypothesis import given, strategies as st
    HAVE_HYPOTHESIS = True
except Exception:
    HAVE_HYPOTHESIS = False


def sizes(mapping):
    """Return a size_lookup that reads from a name->(w, h) dict."""
    return lambda name: mapping[name]


ALIEN = sizes({"alien": (66, 92), "alien_hurt": (66, 92), "big": (200, 100)})


class TestActorPlacement(unittest.TestCase):
    def test_default_anchor_is_center(self):
        a = Actor("alien", ALIEN, pos=(100, 100))
        self.assertEqual(a.anchor, "center")
        self.assertEqual(a.pos, (100, 100))
        self.assertEqual(a.center, (100, 100))

    def test_rect_sized_from_image(self):
        a = Actor("alien", ALIEN)
        self.assertEqual((a.width, a.height), (66, 92))

    def test_pos_moves_anchor_point(self):
        a = Actor("alien", ALIEN, pos=(0, 0))
        # center at (0,0) -> topleft at (-33, -46)
        self.assertEqual(a.topleft, (-33, -46))

    def test_topright_placement_kwarg(self):
        a = Actor("alien", ALIEN, topright=(400, 0))
        self.assertEqual(a.topright, (400, 0))

    def test_anchor_keyword(self):
        a = Actor("alien", ALIEN, anchor="topleft", pos=(10, 20))
        self.assertEqual(a.topleft, (10, 20))
        self.assertEqual(a.pos, (10, 20))


class TestAnchorChanges(unittest.TestCase):
    def test_changing_anchor_preserves_screen_point(self):
        a = Actor("alien", ALIEN, pos=(100, 100))
        point = a.pos
        a.anchor = "topleft"
        # The anchor point on screen stays put; pos now reports topleft.
        self.assertEqual(a.pos, point)
        self.assertEqual(a.topleft, point)

    def test_pixel_anchor(self):
        a = Actor("alien", ALIEN, anchor=(0, 0), pos=(5, 6))
        self.assertEqual(a.topleft, (5, 6))


class TestImageSwap(unittest.TestCase):
    def test_image_change_preserves_center(self):
        a = Actor("alien", ALIEN, pos=(100, 100))
        a.image = "big"
        self.assertEqual(a.image, "big")
        self.assertEqual((a.width, a.height), (200, 100))
        self.assertEqual(a.center, (100, 100))   # anchor point preserved


class TestMaths(unittest.TestCase):
    def test_distance_to_point(self):
        a = Actor("alien", ALIEN, pos=(0, 0))
        self.assertAlmostEqual(a.distance_to((3, 4)), 5.0)

    def test_distance_to_actor(self):
        a = Actor("alien", ALIEN, pos=(0, 0))
        b = Actor("alien", ALIEN, pos=(0, 10))
        self.assertAlmostEqual(a.distance_to(b), 10.0)

    def test_angle_to_east_is_zero(self):
        a = Actor("alien", ALIEN, pos=(0, 0))
        self.assertAlmostEqual(a.angle_to((10, 0)), 0.0)

    def test_angle_to_north_is_90(self):
        # y grows down; a target above (smaller y) is +90 (anticlockwise).
        a = Actor("alien", ALIEN, pos=(0, 0))
        self.assertAlmostEqual(a.angle_to((0, -10)), 90.0)

    def test_angle_to_south_is_minus_90(self):
        a = Actor("alien", ALIEN, pos=(0, 0))
        self.assertAlmostEqual(a.angle_to((0, 10)), -90.0)


class TestCollision(unittest.TestCase):
    def test_colliderect_actor(self):
        a = Actor("alien", ALIEN, pos=(0, 0))
        b = Actor("alien", ALIEN, pos=(10, 10))
        self.assertTrue(a.colliderect(b))

    def test_colliderect_rect(self):
        a = Actor("alien", ALIEN, pos=(0, 0))
        self.assertTrue(a.colliderect(ZRect(0, 0, 5, 5)))

    def test_collidepoint(self):
        a = Actor("alien", ALIEN, anchor="topleft", pos=(0, 0))
        self.assertTrue(a.collidepoint(5, 5))
        self.assertFalse(a.collidepoint(1000, 1000))


if HAVE_HYPOTHESIS:
    _coord = st.floats(min_value=-500, max_value=500, allow_nan=False)

    class TestActorProperties(unittest.TestCase):
        # pos is the inverse of setting pos: set then read returns the value.
        @given(_coord, _coord)
        def test_pos_round_trip(self, x, y):
            a = Actor("alien", ALIEN, pos=(x, y))
            px, py = a.pos
            self.assertAlmostEqual(px, x)
            self.assertAlmostEqual(py, y)

        # distance_to is symmetric between two actors.
        @given(_coord, _coord, _coord, _coord)
        def test_distance_symmetry(self, ax, ay, bx, by):
            a = Actor("alien", ALIEN, pos=(ax, ay))
            b = Actor("alien", ALIEN, pos=(bx, by))
            self.assertAlmostEqual(a.distance_to(b), b.distance_to(a))


if __name__ == "__main__":
    unittest.main()
