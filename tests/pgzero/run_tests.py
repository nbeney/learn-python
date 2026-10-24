"""Lightweight test runner for the pgzero shim's pure-Python logic.

There is NO standard test runner wired up in this browser/Pyodide project, so
this script is the agreed lightweight approach. The modules under test
(pgzcolor, pgzrect, ...) are deliberately bridge-free (no `from js import`), so
they run both:

  (a) In the editor / Pyodide — open this file in the Editor and press Run, or
      paste its contents. `hypothesis` is optional; if it is not importable the
      property tests are skipped and only the stdlib `unittest` cases run.

  (b) Under local CPython — from the repo root, using uv (preferred) so the
      property tests get hypothesis without touching the system Python:

          uv run --with hypothesis python tests/pgzero/run_tests.py

      Without hypothesis the property tests are skipped and only the stdlib
      unittest cases run:

          python3 tests/pgzero/run_tests.py

This runner discovers the `test_*.py` modules in this directory and runs them
with `unittest`, printing a short summary.
"""

import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)


def main():
    try:
        import hypothesis  # noqa: F401
        have_hyp = True
    except Exception:
        have_hyp = False
    if not have_hyp:
        print("note: 'hypothesis' not available - property tests will be skipped.")

    loader = unittest.TestLoader()
    suite = loader.discover(start_dir=HERE, pattern="test_*.py")
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
