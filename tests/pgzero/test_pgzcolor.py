"""Tests for pgzcolor.normalise_color.

Covers Requirement 6 (colour value handling) and Property 5 (colour
normalisation stability / idempotence). The hypothesis property test is
skipped automatically when hypothesis is not installed.
"""

import unittest

from pgzcolor import normalise_color

try:
    from hypothesis import given, strategies as st
    HAVE_HYPOTHESIS = True
except Exception:
    HAVE_HYPOTHESIS = False


class TestNormaliseColorUnits(unittest.TestCase):
    def test_name_passthrough(self):
        self.assertEqual(normalise_color("red"), "red")

    def test_hex_lowercased(self):
        self.assertEqual(normalise_color("#FF8800"), "#ff8800")

    def test_0x_hex_to_hash(self):
        self.assertEqual(normalise_color("0xFF8800"), "#ff8800")

    def test_rgb_tuple(self):
        self.assertEqual(normalise_color((255, 127, 0)), "rgb(255,127,0)")

    def test_rgb_list_clamped(self):
        self.assertEqual(normalise_color([300, -5, 10]), "rgb(255,0,10)")

    def test_rgba_tuple(self):
        # alpha 255 -> 1.0
        self.assertEqual(normalise_color((0, 0, 0, 255)), "rgba(0,0,0,1.0)")

    def test_bad_length_raises(self):
        with self.assertRaises(ValueError):
            normalise_color((1, 2))

    def test_bad_type_raises(self):
        with self.assertRaises(ValueError):
            normalise_color(object())


# Property tests are only DEFINED when hypothesis is importable, so the module
# imports cleanly under plain CPython without hypothesis (the decorators and
# strategy objects are evaluated at class-definition time).
if HAVE_HYPOTHESIS:
    class TestNormaliseColorProperties(unittest.TestCase):
        # Property 5: normalising an already-normalised value is stable.
        # Validates Requirement 6.2.
        @given(st.tuples(st.integers(0, 255), st.integers(0, 255), st.integers(0, 255)))
        def test_rgb_idempotent(self, rgb):
            once = normalise_color(rgb)
            twice = normalise_color(once)
            self.assertEqual(once, twice)

        @given(st.tuples(st.integers(0, 255), st.integers(0, 255),
                         st.integers(0, 255), st.integers(0, 255)))
        def test_rgba_idempotent(self, rgba):
            once = normalise_color(rgba)
            twice = normalise_color(once)
            self.assertEqual(once, twice)

        @given(st.sampled_from(["red", "blue", "#ff8800", "#FFFFFF", "0xAABBCC",
                                "rgb(1,2,3)", "rgba(1,2,3,0.5)"]))
        def test_string_idempotent(self, s):
            once = normalise_color(s)
            twice = normalise_color(once)
            self.assertEqual(once, twice)


if __name__ == "__main__":
    unittest.main()
