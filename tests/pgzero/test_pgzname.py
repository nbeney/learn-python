"""Tests for pgzname (asset-name validation + path resolution).

Covers Requirement 18 (asset names) and Property 8 (asset name validity):
invalid names raise BEFORE any FS access; valid names resolve to
`<area>/<name>.<ext>`. Property tests are skipped without hypothesis.
"""

import unittest

from pgzname import check_name, resolve, valid_name

try:
    from hypothesis import given, strategies as st
    HAVE_HYPOTHESIS = True
except Exception:
    HAVE_HYPOTHESIS = False


class TestValidName(unittest.TestCase):
    def test_valid(self):
        for n in ("a", "alien", "alien_hurt", "player2", "a_1_b"):
            self.assertTrue(valid_name(n), n)

    def test_invalid(self):
        for n in ("", "1abc", "Alien", "alien-hurt", "alien.png", "a b",
                  "_x", "ALIEN", "café", 3, None):
            self.assertFalse(valid_name(n), repr(n))


class TestCheckName(unittest.TestCase):
    def test_check_raises_for_invalid(self):
        with self.assertRaises(KeyError):
            check_name("image", "Alien")

    def test_check_passes_for_valid(self):
        check_name("image", "alien")   # no exception


class TestResolve(unittest.TestCase):
    def test_invalid_name_raises_before_fs_access(self):
        calls = []

        def exists(path):
            calls.append(path)
            return True

        with self.assertRaises(KeyError):
            resolve("images", "Bad-Name", exists)
        self.assertEqual(calls, [])   # never probed the FS

    def test_resolves_first_existing_extension(self):
        present = {"images/alien.jpg"}
        path = resolve("images", "alien", lambda p: p in present)
        self.assertEqual(path, "images/alien.jpg")

    def test_prefers_png_order(self):
        present = {"images/alien.png", "images/alien.jpg"}
        path = resolve("images", "alien", lambda p: p in present)
        self.assertEqual(path, "images/alien.png")

    def test_missing_file_raises(self):
        with self.assertRaises(KeyError):
            resolve("images", "nope", lambda p: False)

    def test_sounds_extensions(self):
        present = {"sounds/eep.wav"}
        self.assertEqual(resolve("sounds", "eep", lambda p: p in present),
                         "sounds/eep.wav")


if HAVE_HYPOTHESIS:
    # A valid-name strategy and an "arbitrary text" strategy.
    _valid = st.from_regex(r"\A[a-z][a-z0-9_]*\Z", fullmatch=True)

    class TestNameProperties(unittest.TestCase):
        # Property 8: valid names resolve to <area>/<name>.<ext> (the first
        # existing extension); invalid names raise before FS access.
        @given(_valid)
        def test_valid_names_resolve(self, name):
            path = resolve("images", name, lambda p: True)
            self.assertEqual(path, "images/%s.png" % name)

        @given(st.text())
        def test_arbitrary_text_never_probes_when_invalid(self, name):
            if valid_name(name):
                return   # covered by the valid-name property
            calls = []
            try:
                resolve("images", name, lambda p: calls.append(p) or True)
            except KeyError:
                pass
            self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()
