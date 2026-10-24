"""Tests for pgzwrap.wrap (ptext word-wrap), using a mock measurer.

Covers Requirement 5.5. The mock measurer treats every character as 10px wide,
so widths are predictable without a canvas.
"""

import unittest

from pgzwrap import wrap


def measure(s):
    return len(s) * 10        # 10px per char


class TestWrap(unittest.TestCase):
    def test_no_width_keeps_single_line(self):
        self.assertEqual(wrap("hello world", None, measure), ["hello world"])

    def test_explicit_newlines_split(self):
        self.assertEqual(wrap("a\nb\nc", None, measure), ["a", "b", "c"])

    def test_wraps_at_width(self):
        # width 60px = 6 chars. "aaa bbb ccc": "aaa bbb" is 70px > 60 so wrap.
        self.assertEqual(wrap("aaa bbb ccc", 60, measure), ["aaa", "bbb", "ccc"])

    def test_wide_enough_keeps_together(self):
        self.assertEqual(wrap("aaa bbb", 100, measure), ["aaa bbb"])

    def test_long_word_not_broken(self):
        # A single word wider than the limit stays on its own line.
        self.assertEqual(wrap("supercalifragilistic", 50, measure),
                         ["supercalifragilistic"])

    def test_newline_and_wrap_combined(self):
        self.assertEqual(wrap("aa bb\ncc dd", 40, measure),
                         ["aa", "bb", "cc", "dd"])


if __name__ == "__main__":
    unittest.main()
