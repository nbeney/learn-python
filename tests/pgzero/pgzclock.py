"""Clock scheduling + hook signature introspection (bridge-free, testable).

Mirrors the logic the pgzero shim in editor.html uses for `clock` and the hook
dispatcher. Kept here with no `from js import` so it runs under plain CPython.

Design: "clock" and "Handler Signature Introspection". Requirements 15 and 9.
Property 1 (handler argument fidelity).
"""

from __future__ import annotations

import inspect


def call_with_known_args(func, available: dict):
    """Call `func` with only the parameters it names from `available`.

    Replicates Pygame Zero's behaviour of inspecting a hook's parameter names
    and passing just those. A function naming no parameters is called with
    none. `None` funcs are skipped. Builtins without a signature are called
    with no args.
    """
    if func is None:
        return None
    try:
        params = inspect.signature(func).parameters
    except (TypeError, ValueError):
        return func()
    kwargs = {n: available[n] for n in params if n in available}
    return func(**kwargs)


class Clock:
    """Game-time clock advanced by tick(dt); fires scheduled callbacks.

    Uses strong references to callbacks (a documented deviation from pgzero's
    weak refs; fine because the whole loop is torn down each run).
    """

    def __init__(self):
        self._events = []   # {cb, due, interval}
        self._t = 0.0

    def schedule(self, callback, delay):
        self._events.append({"cb": callback, "due": self._t + delay, "interval": None})

    def schedule_unique(self, callback, delay):
        self._events = [e for e in self._events if e["cb"] is not callback]
        self.schedule(callback, delay)

    def schedule_interval(self, callback, interval):
        self._events.append({"cb": callback, "due": self._t + interval, "interval": interval})

    def unschedule(self, callback):
        self._events = [e for e in self._events if e["cb"] is not callback]

    def tick(self, dt):
        self._t += dt
        due = [e for e in self._events if e["due"] <= self._t]
        for e in due:
            if e["interval"] is None:
                try:
                    self._events.remove(e)
                except ValueError:
                    pass
            else:
                e["due"] += e["interval"]
            call_with_known_args(e["cb"], {})

    def reset(self):
        self._events = []
        self._t = 0.0
