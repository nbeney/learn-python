"""Tests for the per-hook available-argument vocabularies (Requirement 9.3)
and the absent-hook skip path (Requirement 9.4, 9.5), via the introspection
dispatcher helper.
"""

import unittest

from pgzevents import event_available
from pgzclock import call_with_known_args


class TestEventVocabularies(unittest.TestCase):
    def test_draw_has_no_args(self):
        self.assertEqual(event_available("draw", {}), {})

    def test_update_has_dt(self):
        self.assertEqual(set(event_available("update", {"dt": 0.1})), {"dt"})

    def test_mouse_down_vocab(self):
        av = event_available("on_mouse_down", {"pos": [1, 2], "button": "LEFT"})
        self.assertEqual(set(av), {"pos", "button"})
        self.assertEqual(av["pos"], (1, 2))

    def test_mouse_move_vocab(self):
        av = event_available("on_mouse_move",
                             {"pos": [1, 2], "rel": [3, 4], "buttons": ["LEFT"]})
        self.assertEqual(set(av), {"pos", "rel", "buttons"})
        self.assertEqual(av["buttons"], {"LEFT"})

    def test_key_down_vocab(self):
        av = event_available("on_key_down", {"key": "a", "mod": 0, "unicode": "a"})
        self.assertEqual(set(av), {"key", "mod", "unicode"})

    def test_key_up_vocab(self):
        av = event_available("on_key_up", {"key": "a", "mod": 0})
        self.assertEqual(set(av), {"key", "mod"})

    def test_music_end_has_no_args(self):
        self.assertEqual(event_available("on_music_end", {}), {})


class TestDispatchWithVocab(unittest.TestCase):
    """Integration of vocabulary + introspection: a handler receives exactly
    the parameters it names from the hook's vocabulary."""

    def test_handler_names_subset(self):
        got = {}
        def on_mouse_down(button):
            got["button"] = button
        avail = event_available("on_mouse_down", {"pos": [5, 6], "button": "RIGHT"})
        call_with_known_args(on_mouse_down, avail)
        self.assertEqual(got, {"button": "RIGHT"})   # pos not passed

    def test_absent_hook_skipped(self):
        # Dispatcher passes None for a missing hook -> no call, no error.
        self.assertIsNone(call_with_known_args(None,
            event_available("on_key_up", {"key": "a", "mod": 0})))


if __name__ == "__main__":
    unittest.main()
