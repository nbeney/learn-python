"""Tests for pgzclock.Clock and the hook introspection helper.

Covers Requirement 15 (clock scheduling) and Requirement 9 / Property 1
(handler argument fidelity). Property tests skipped without hypothesis.
"""

import unittest

from pgzclock import Clock, call_with_known_args

try:
    from hypothesis import given, strategies as st
    HAVE_HYPOTHESIS = True
except Exception:
    HAVE_HYPOTHESIS = False


class TestClock(unittest.TestCase):
    def test_schedule_fires_once_after_delay(self):
        hits = []
        c = Clock()
        c.schedule(lambda: hits.append("x"), 1.0)
        c.tick(0.5)
        self.assertEqual(hits, [])          # not due yet
        c.tick(0.6)
        self.assertEqual(hits, ["x"])       # due at t=1.1
        c.tick(5.0)
        self.assertEqual(hits, ["x"])       # one-shot: does not fire again

    def test_schedule_interval_repeats(self):
        hits = []
        c = Clock()
        c.schedule_interval(lambda: hits.append(1), 1.0)
        c.tick(1.0); c.tick(1.0); c.tick(1.0)
        self.assertEqual(len(hits), 3)

    def test_schedule_unique_replaces(self):
        hits = []
        cb = lambda: hits.append(1)
        c = Clock()
        c.schedule(cb, 1.0)
        c.schedule_unique(cb, 5.0)          # cancels the first, reschedules
        c.tick(1.1)
        self.assertEqual(hits, [])          # the 1.0 schedule was cancelled
        c.tick(4.0)
        self.assertEqual(hits, [1])         # fires once at ~5.0

    def test_unschedule(self):
        hits = []
        cb = lambda: hits.append(1)
        c = Clock()
        c.schedule(cb, 1.0)
        c.unschedule(cb)
        c.tick(2.0)
        self.assertEqual(hits, [])

    def test_reset_clears(self):
        hits = []
        c = Clock()
        c.schedule(lambda: hits.append(1), 1.0)
        c.reset()
        c.tick(2.0)
        self.assertEqual(hits, [])


class TestIntrospectionUnits(unittest.TestCase):
    AVAIL = {"pos": (1, 2), "button": 1, "rel": (0, 0), "buttons": set(),
             "key": 65, "mod": 0, "unicode": "a", "dt": 0.016}

    def _received(self, fn):
        got = {}
        def spy(**kw):
            got.update(kw)
        # Give spy the same signature as fn.
        import functools, inspect
        spy.__signature__ = inspect.signature(fn)
        call_with_known_args(spy, self.AVAIL)
        return set(got.keys())

    def test_no_params(self):
        self.assertEqual(self._received(lambda: None), set())

    def test_single_named(self):
        self.assertEqual(self._received(lambda pos: None), {"pos"})

    def test_two_named(self):
        self.assertEqual(self._received(lambda pos, button: None), {"pos", "button"})

    def test_only_known_passed(self):
        # A param not in the vocabulary is simply not passed.
        self.assertEqual(self._received(lambda dt: None), {"dt"})

    def test_none_func_is_skipped(self):
        self.assertIsNone(call_with_known_args(None, self.AVAIL))


if HAVE_HYPOTHESIS:
    _VOCAB = {"pos": (1, 2), "button": 1, "rel": (3, 4), "buttons": frozenset(),
              "key": 65, "mod": 2, "unicode": "a", "dt": 0.016}

    class TestIntrospectionProperty(unittest.TestCase):
        # Property 1: the dispatcher passes exactly the named subset of the
        # available args. Validates Requirements 9.1, 9.2, 9.3.
        @given(st.lists(st.sampled_from(sorted(_VOCAB.keys())), unique=True))
        def test_exact_named_subset(self, names):
            received = {}

            def make(names):
                # Build a function with exactly these parameter names.
                src = "def _f(" + ", ".join(names) + "):\n    pass\n"
                ns = {}
                exec(src, ns)
                return ns["_f"]

            fn = make(names)
            captured = {}

            def spy(**kw):
                captured.update(kw)
            import inspect
            spy.__signature__ = inspect.signature(fn)
            call_with_known_args(spy, _VOCAB)
            self.assertEqual(set(captured.keys()), set(names))


if __name__ == "__main__":
    unittest.main()
