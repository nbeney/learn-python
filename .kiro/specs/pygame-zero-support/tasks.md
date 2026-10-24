# Implementation Plan: Pygame Zero Support (pgzero shim)

## Overview

This plan implements the pgzero shim entirely within `editor.html` — a single static HTML file
with no build step — following the established `turtle`/`guizero` shim pattern: Python modules
built via `pyodide.runPython(...)` and registered in `sys.modules`, backed by `globalThis.jsPgz*`
bridge functions. The bridge functions MUST be defined **before** the Python module block so that
`from js import jsPgz*` resolves. The shim is built in at startup (no lazy network install).

Work is organized to match the design's five delivery phases plus the final documentation
deliverable, so each phase is independently runnable in the editor:

- Phase 1 — Drawing, loop lifecycle, Rect/ZRect, ptext, clock, usage detection/reset wiring.
- Phase 2 — Keyboard/mouse/wheel input and the introspection dispatcher.
- Phase 3 — Images loader, blit, and Actor.
- Phase 4 — Sounds (Web Audio).
- Phase 5 — Music (single `<audio>` channel).
- Final — Cheatsheet, hub card, and per-phase samples.

Testing targets the pure-Python logic with `hypothesis` property-based tests plus focused unit
tests. Because this is a browser/Pyodide project with **no standard test runner wired up**, an
early task establishes a lightweight, in-editor/Pyodide-runnable way to run the Python-level
tests; the constraint is noted rather than assuming a framework exists.

> **Manual verification note:** Tasks tagged **[MANUAL-BROWSER]** exercise canvas rendering,
> audio, or DOM input and cannot be auto-verified headlessly. They require running the per-phase
> sample in `editor.html` in a browser and observing behaviour (and, where noted, Thonny parity).

## Tasks

- [x] 1. Test harness and shared Python helpers (foundation)
  - [x] 1.1 Establish a lightweight Python-level test runner for the Pyodide project
    - Add a `tests/pgzero/` directory with a plain `run_tests.py` entry point that imports and
      runs the pure-Python test modules using only the stdlib (`unittest` is available in
      Pyodide) and `hypothesis` (loaded via `micropip`/`pyodide` when run in-editor).
    - Document in a short header comment how to run it two ways: (a) pasted/opened in the editor
      and executed in Pyodide, and (b) under a local CPython + `hypothesis` for CI-free local
      checks. Note explicitly that no framework is currently wired up and this harness is the
      agreed lightweight approach.
    - Keep the pure-Python modules under test importable without `editor.html` (no `from js import`
      at import time) so they can run outside the browser.
    - _Requirements: 9.1, 12.5, 6.2_
  - [x] 1.2 Implement the Python color normalisation helper (bridge-independent module)
    - Normalise name string / `(r,g,b)` / `(r,g,b,a)` / hex string to a single CSS color string.
    - Place it in a module importable without the JS bridge so it is unit/property testable.
    - _Requirements: 6.1, 6.2_
  - [x]* 1.3 Write property test for color normalisation idempotence
    - **Property 5: Color normalisation stability**
    - **Validates: Requirements 6.2**
    - Assert re-normalising an already-normalised CSS string yields the same string.

- [x] 2. Game box markup, DPR-crisp sizing, and bridge skeleton (Phase 1)
  - [x] 2.1 Add `#gameBox`/`#gameCanvas` markup and CSS to the result pane
    - Mirror the turtle canvas / gui box / chart box box pattern; hidden until first use.
    - Give the canvas `tabindex` so it can later receive key focus.
    - _Requirements: 2.1_
  - [x] 2.2 Implement DPR-crisp sizing and reveal/reset bridge stubs
    - Add `pgzResize()` reusing turtle's device-pixel-ratio approach (`setTransform(dpr,0,0,dpr,0,0)`,
      top-left/y-down, no flip), plus `jsPgzShow()`, `jsPgzReset()`, and `jsPgzScreenSize()`
      returning `[cssW, cssH]`.
    - Define all `globalThis.jsPgz*` functions used by later phases as stubs here so the Python
      module's `from js import jsPgz*` resolves; fill them in as phases land.
    - _Requirements: 2.2, 2.4, 2.5, 3.1, 3.2_
  - [x]* 2.3 Manually verify crisp sizing and reveal [MANUAL-BROWSER]
    - Reveal the box, confirm no blur at non-1 DPR, and confirm `jsPgzScreenSize()` tracks resize.
    - _Requirements: 2.2, 2.5_

- [x] 3. Rect / ZRect geometry (pure Python, Phase 1)
  - [x] 3.1 Implement `Rect` and `ZRect` with full anchor attribute set and collisions
    - Construct from `(x,y,w,h)`, `((x,y),(w,h))`, or another Rect; expose all readable/writable
      anchors; writing an anchor moves the rect preserving `size`.
    - Implement `colliderect`, `collidepoint`, `contains`, `clip`, `union`; `ZRect` as the
      float-friendly variant with the same API.
    - Keep this module bridge-free so it is unit/property testable.
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.6, 12.7_
  - [x]* 3.2 Write property test for Rect anchor round-trip
    - **Property 3: Rect anchor consistency**
    - **Validates: Requirements 12.3, 12.4**
  - [x]* 3.3 Write property test for collision symmetry
    - **Property 4: Collision symmetry**
    - **Validates: Requirements 12.5**
  - [x]* 3.4 Write unit tests for Rect geometry
    - Cover construction variants, each anchor read/write, and `collidepoint`/`contains`/`clip`/
      `union` edge cases.
    - _Requirements: 12.1, 12.2, 12.6_

- [x] 4. Screen drawing primitives (Phase 1)
  - [x] 4.1 Implement JS primitive renderers and `jsPgzClear`/`jsPgzFill`
    - `jsPgzClear`, `jsPgzFill(color, gcolor)` (solid or vertical gradient), and
      `jsPgzDrawLine/Circle/FilledCircle/Rect/FilledRect(...)` drawing in CSS-pixel coords.
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 4.7, 4.8, 4.9_
  - [x] 4.2 Implement the Python `screen` surface object and `screen.draw` primitives
    - `clear`, `fill(color, gcolor=None)`, `bounds()` (returns a whole-surface `Rect`), `width`/
      `height` from `jsPgzScreenSize()`; `draw.line/circle/filled_circle/rect/filled_rect` passing
      normalised colors (via the helper from 1.2) and numbers across the bridge.
    - _Requirements: 2.4, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 6.1_
  - [x]* 4.3 Manually verify primitives render correctly [MANUAL-BROWSER]
    - Draw each primitive and a gradient fill; confirm placement matches top-left/y-down coords.
    - _Requirements: 3.2, 4.3_

- [x] 5. ptext text rendering (Phase 1)
  - [x] 5.1 Implement the ptext word-wrap and layout core (pure/mockable)
    - Greedy word-wrap using an injectable `measureText`; line step `lineheight * fontsize`;
      resolve exactly one horizontal + one vertical positioning reference to an anchor point.
    - Keep the wrap/layout math separable from canvas calls so it is unit testable with a mock
      `measureText`.
    - _Requirements: 5.5_
  - [x] 5.2 Implement `jsPgzDrawText`/`jsPgzDrawTextbox` and the Python `draw.text`/`draw.textbox`
    - Map the full supported option set (`color`, `background`, `fontsize`, `antialias`, all
      positioning anchors, `width`, `widthem`, `lineheight`, `align`, `owidth`, `ocolor`,
      `shadow`, `scolor`, `gcolor`, `alpha`, `anchor`, `angle`) onto Canvas 2D; accept and ignore
      `fontname` (system font only). Supported options are a **necessary condition**: reject/treat
      as non-compliant any option outside the supported set.
    - `textbox` reduces `fontsize` until the wrapped text fits the given `Rect`, then renders.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6_
  - [x]* 5.3 Write unit tests for ptext word-wrap with mock measureText
    - Assert wrap boundaries and line-height stepping given controlled glyph widths.
    - _Requirements: 5.5_
  - [x]* 5.4 Manually verify styled text and textbox fitting [MANUAL-BROWSER]
    - Render outline/shadow/gradient/alpha/rotated text and a textbox; confirm fit and styling.
    - _Requirements: 5.3, 5.6_

- [x] 6. Clock scheduling (Phase 1)
  - [x] 6.1 Implement the `clock` builtin (strong refs)
    - `schedule`, `schedule_unique`, `schedule_interval`, `unschedule`; `tick(dt)` advances game
      time and fires due callbacks through the introspection helper (placeholder helper until
      Phase 2's dispatcher lands, then reuse it). Document the strong-reference deviation.
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_
  - [x]* 6.2 Write unit tests for clock scheduling semantics
    - Verify one-shot firing, interval repetition, `schedule_unique` replacement, and `unschedule`
      using a manually driven `tick(dt)`.
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

- [x] 7. Game loop lifecycle, `pgzrun.go()`, and Stop integration (Phase 1)
  - [x] 7.1 Implement the JS rAF loop driver with per-frame Stop and error surfacing
    - `jsPgzStartLoop()`/`jsPgzStopLoop()`; `pgzFrame(ts)` computes `dt` in seconds (first frame
      `dt=0`, clamp to 0.1s), checks `jsStopRequested()` at the top of every frame, calls
      `clock.tick` → `update` → `draw`, and on a per-frame exception surfaces the error **once**
      via `jsPgzReportError` → `appendOutput(..., "error")` then ends the loop.
    - `pgzEndLoop()` is idempotent: cancel rAF, stop the loop flag, stop all audio, resolve the
      Python `loop_done` Future, and leave the final frame painted. Resolution MAY occur before or
      concurrently with the final paint.
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.10_
  - [x] 7.2 Implement the `pgzrun` module and the `go()` await-a-Future bridge
    - `go()` creates an `asyncio.Future`, calls `jsPgzStartLoop()`, awaits the Future, and ensures
      `jsPgzStopLoop()` in `finally`; integrate with the existing async runner so control returns
      to the browser between frames under the existing Run_Lifecycle.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 7.1_
  - [x] 7.3 Inject builtin names into the student module namespace at launch
    - Before the loop starts, inject `screen`, `Actor`, `images`, `sounds`, `music`, `clock`,
      `keyboard`, `keys`, `mouse`, `keymods`, `Rect`, `ZRect` into the student module globals; set
      module `WIDTH`/`HEIGHT` names to the live canvas size while ignoring any student-assigned
      values for sizing.
    - _Requirements: 1.5, 2.3_
  - [x]* 7.4 Write property test for loop lifecycle safety (headless-testable parts)
    - **Property 6: Loop lifecycle safety**
    - **Validates: Requirements 7.7, 7.8**
    - Assert `pgzEndLoop()` idempotence and that post-stop no hook/clock callback fires, using a
      fake frame driver and stubbed bridge (pure-Python/JS-stub level; no real canvas).
  - [x]* 7.5 Manually verify Run/Stop/re-run and per-frame error surfacing [MANUAL-BROWSER]
    - Start a loop, press Stop mid-loop, confirm final frame remains and audio/listeners are gone;
      re-run to confirm no stale loop; trigger a handler exception and confirm a single error line.
    - _Requirements: 7.5, 7.6, 7.9, 7.10_

- [x] 8. Usage detection, reset, and output accounting wiring (Phase 1)
  - [x] 8.1 Add `usesPgzero(src)` and `_reset()` wiring in `runCode()`/`clearOutput()`
    - Add `usesPgzero` next to the existing `usesMatplotlib`/`usesRich` checks; call
      `pgzero.builtins._reset()` before staging each run; call `jsPgzReset()` in `clearOutput()`
      next to `turtleReset()`/`jsGuiReset()`; extend the "(no output)" check to count a visible
      `#gameBox`.
    - `_reset()` (Python) clears clock schedule, keyboard state, dispatcher/globals proxies, and
      renderer/loader caches; `jsPgzReset()` (JS) ends any lingering loop, stops audio, clears and
      hides the box, and removes DOM input listeners.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 7.9_
  - [x] 8.2 Register all Phase 1 Python modules in `sys.modules`
    - Build and register `pgzrun`, `pgzero`, `pgzero.builtins`, `pgzero.rect`, `pgzero.clock`,
      `pgzero.screen` (as applicable) after the JS bridge block; expose builtins from
      `pgzero.builtins`.
    - _Requirements: 1.1, 8.2_

- [x] 9. Phase 1 checkpoint
  - Ensure all tests pass, ask the user if questions arise. Confirm the Phase 1 sample runs
    end-to-end in the browser (deferred sample authoring to task 20).

- [x] 10. Input dispatcher and signature introspection (Phase 2)
  - [x] 10.1 Implement the Python dispatcher with `inspect.signature` filtering
    - A single `_dispatch(hook_name, available)` looks the hook up in the student globals each call
      and passes exactly the named subset of that hook's available vocabulary; absent hooks are
      skipped; hooks naming no params are called with none. Expose one reusable dispatcher PyProxy
      and one globals proxy created at `go()` and destroyed in `pgzEndLoop()`/`_reset()`.
    - Wire `clock.tick` due-callbacks through this same introspection helper.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 15.5_
  - [x]* 10.2 Write property test for handler argument fidelity
    - **Property 1: Handler argument fidelity**
    - **Validates: Requirements 9.1, 9.2, 9.3**
  - [x]* 10.3 Write unit tests for dispatcher hook vocabularies
    - Verify each hook's exact available-argument vocabulary and the absent-hook skip path.
    - _Requirements: 9.3, 9.4, 9.5_

- [x] 11. Keyboard input (Phase 2)
  - [x] 11.1 Implement `keys`/`keymods` enums and DOM→pgzero mapping
    - Full key set; map `KeyboardEvent.code` (layout-independent) to pgzero names; build `mod`
      bitmask from `shiftKey`/`ctrlKey`/`altKey`/`metaKey`.
    - _Requirements: 10.3, 10.5_
  - [x] 11.2 Implement DOM key capture, `keyboard` state, and key hook dispatch
    - Maintain a JS pressed-keys set from `keydown`/`keyup`; expose `keyboard.<name>` and
      `keyboard[keys.X]` booleans; dispatch `on_key_down` (`key`, `mod`, `unicode`) and
      `on_key_up` (`key`, `mod`) via the dispatcher.
    - _Requirements: 10.1, 10.2, 10.4_
  - [ ]* 11.3 Manually verify keyboard state and key hooks [MANUAL-BROWSER]
    - Hold/release keys to confirm `keyboard` state and `on_key_down`/`on_key_up` payloads.
    - _Requirements: 10.1, 10.2, 10.4_

- [x] 12. Mouse and wheel input (Phase 2)
  - [x] 12.1 Implement `mouse` enum and DOM mouse/wheel capture with hook dispatch
    - Map `MouseEvent.button` (0/1/2) to LEFT/MIDDLE/RIGHT and `wheel` to WHEEL_UP/WHEEL_DOWN;
      compute `pos` in CSS pixels via `getBoundingClientRect()`; dispatch `on_mouse_down`/`up`
      (`pos`, `button`) and `on_mouse_move` (`pos`, `rel`, pressed `buttons`); grab canvas focus on
      first interaction.
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 3.3_
  - [x] 12.2 Implement listener attach-on-start / remove-on-stop lifecycle
    - Attach key/mouse/wheel listeners to `#gameCanvas` at loop start and always remove them on
      teardown, attaching fresh listeners on each start regardless of how soon a restart occurs.
    - _Requirements: 11.5_
  - [ ]* 12.3 Manually verify mouse/wheel hooks and listener cleanup [MANUAL-BROWSER]
    - Click/move/scroll to confirm payloads and `pos`; stop the loop and confirm input no longer
      fires; re-run and confirm fresh listeners work.
    - _Requirements: 11.1, 11.2, 11.4, 11.5_

- [x] 13. Phase 2 checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Images loader and blit (Phase 3)
  - [ ] 14.1 Implement asset-name validation and the `images` loader
    - Validate `^[a-z][a-z0-9_]*$` before any FS access; read `images/<name>.<ext>` via
      `pyodide.FS.readFile` trying `.png`/`.jpg`/`.gif`; `createImageBitmap`; cache by name; raise
      clear Python errors for missing files and surface readable decode failures without
      starting/continuing the loop. Eager-decode staged `images/` at `_reset()` so the frame path
      is synchronous. Do not add new staging.
    - _Requirements: 13.1, 13.2, 13.4, 13.5, 18.1, 18.2_
  - [ ] 14.2 Implement `jsPgzBlit` and `screen.blit`
    - Draw a cached image handle at `(x, y)` in CSS-pixel coords.
    - _Requirements: 13.3_
  - [ ]* 14.3 Write property/unit tests for asset-name validity
    - **Property 8: Asset name validity**
    - **Validates: Requirements 18.1, 18.2**
    - Pure-Python validation test (invalid names raise before FS access; valid names resolve to
      `<area>/<name>.<ext>`), using a stubbed FS resolver.
  - [ ]* 14.4 Manually verify image load/blit and missing-file error [MANUAL-BROWSER]
    - Blit an uploaded image; confirm a clear error for a missing/invalid name.
    - _Requirements: 13.3, 13.4, 18.1_

- [ ] 15. Actor (Phase 3)
  - [ ] 15.1 Implement the `Actor` class
    - Construct from an image name (+ `pos`), size the backing `Rect` from the image; delegate
      `pos`/`x`/`y`/anchor attrs to the Rect; default `anchor` to `center`; `angle` (anticlockwise
      around anchor), `opacity` (0..1); `distance_to`/`angle_to` (pure math); `colliderect`/
      `collidepoint` via the Rect.
    - _Requirements: 14.1, 14.2, 14.3, 14.6, 14.7_
  - [ ] 15.2 Implement `jsPgzDrawActor` and `Actor.draw()`
    - Apply `translate(anchorPx)` + `rotate(-angle)` + `globalAlpha=opacity`; render at current
      position/angle/opacity.
    - _Requirements: 14.4, 14.5, 14.8_
  - [ ]* 15.3 Write unit tests for Actor geometry
    - Verify anchor/pos delegation, `distance_to`/`angle_to`, and collision delegation (pure
      Python, no canvas).
    - _Requirements: 14.2, 14.3, 14.6, 14.7_
  - [ ]* 15.4 Manually verify rotation/opacity rendering [MANUAL-BROWSER]
    - Draw a rotating, semi-transparent actor bouncing off edges.
    - _Requirements: 14.4, 14.5, 14.8_

- [ ] 16. Phase 3 checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 17. Sounds via Web Audio (Phase 4)
  - [ ] 17.1 Implement the `sounds` loader and Web Audio decode/cache
    - Read `sounds/<name>.<ext>` (`.wav`/`.ogg`) via `pyodide.FS.readFile`; `decodeAudioData` to a
      cached `AudioBuffer`; validate names; eager-decode staged `sounds/` at `_reset()`.
    - _Requirements: 16.1, 18.1, 18.2_
  - [ ] 17.2 Implement `Sound` playback and stop-all teardown
    - `jsPgzSoundPlay(name, loops)` (one-shot source; concurrent playback; finite loop count),
      `jsPgzSoundStop(name)` (stop all live sources for the buffer), `jsPgzSoundLength(name)`
      (`AudioBuffer.duration`); track live source nodes so `jsPgzStopAllAudio()` from
      `pgzEndLoop()`/`_reset()` stops everything.
    - _Requirements: 16.2, 16.3, 16.4, 16.5, 16.6_
  - [ ]* 17.3 Manually verify concurrent sounds and stop-on-Stop [MANUAL-BROWSER]
    - Play overlapping sounds, confirm `get_length`, and confirm silence on Stop/reset.
    - _Requirements: 16.2, 16.4, 16.6_

- [ ] 18. Music channel (Phase 5)
  - [ ] 18.1 Implement the single `<audio>` music channel
    - One reusable `<audio>`; `jsPgzMusicPlay` (loop), `PlayOnce`, `Queue`, `Stop` (pause+reset+
      clear queue), `Pause`/`Unpause`, `Fadeout(duration)` (ramp volume then stop),
      `SetVolume`/`GetVolume`, `IsPlaying(name)` (playing and src matches). Enforce at most one
      track at a time; raise a clear Python error for a missing music file without crashing the
      loop.
    - _Requirements: 17.1, 17.2, 17.3, 17.6, 17.7, 17.8, 17.9, 17.10, 18.3_
  - [ ] 18.2 Implement queue advancement, loop cancellation, and `on_music_end`
    - On the `ended` event, advance to the next queued track if present, else dispatch
      `on_music_end` via the introspection path. When `queue(name)` is called while the current
      track is looping, cancel the loop so it stops after the current iteration and the queue then
      advances.
    - _Requirements: 17.4, 17.5, 17.11_
  - [ ]* 18.3 Manually verify music control, queue, loop-cancel, and on_music_end [MANUAL-BROWSER]
    - `play_once` → `on_music_end` chaining; `queue` advancement; `queue` cancelling a looping
      track; `fadeout`; volume get/set.
    - _Requirements: 17.2, 17.4, 17.5, 17.9, 17.11_

- [ ] 19. Phase 5 checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 20. Documentation deliverable
  - [ ] 20.1 Create `cheatsheet-pgzero.html` mirroring the existing cheatsheets
    - Document that the game fills the game area, that `WIDTH`/`HEIGHT` are ignored, that
      `pgzrun.go()` is required, and the asset-name rules (`^[a-z][a-z0-9_]*$`).
    - _Requirements: 19.1, 19.2_
  - [ ] 20.2 Add a pgzero hub card on `index.html`
    - Link to `cheatsheet-pgzero.html`, matching existing card markup/styles.
    - _Requirements: 19.3_
  - [ ] 20.3 Add per-phase sample programs to `assets/samples.js`
    - P1 shapes+text+`clock.schedule_interval`; P2 keyboard/mouse control; P3 rotating/bouncing
      Actor; P4 click-to-play sound; P5 music `play_once` + `on_music_end` chaining + `fadeout`.
      Keep each file Thonny-compatible (unchanged under real pgzero).
    - _Requirements: 19.4_

- [ ] 21. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise. Run each per-phase sample in the
    browser to confirm end-to-end behaviour.

## Notes

- Tasks marked with `*` are optional (tests and manual-browser verification) and can be skipped for
  a faster MVP, but property tests validate the design's universal correctness properties and are
  recommended.
- Tasks tagged **[MANUAL-BROWSER]** require running a sample in `editor.html` in a real browser;
  they cannot be auto-verified headlessly (canvas rendering, audio, DOM input). Where noted, also
  confirm Thonny parity with real `pgzero`.
- All `globalThis.jsPgz*` bridge functions must be defined **before** the Python module block so
  `from js import jsPgz*` resolves (task 2.2 stubs them; later phases fill them in).
- Pure-Python logic (color normalisation, Rect/ZRect, dispatcher introspection, asset-name
  validation, ptext wrap) is deliberately kept bridge-free so it is testable outside the browser.
- Each task references specific requirement clauses for traceability; property-test tasks also cite
  their design Property number.
- No new asset staging is added — assets are read from the already-staged Pyodide FS
  `images/`/`sounds/`/`music/` dirs via `pyodide.FS.readFile`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1", "3.1"] },
    { "id": 1, "tasks": ["1.3", "2.2", "3.2", "3.3", "3.4", "4.1", "5.1", "6.1"] },
    { "id": 2, "tasks": ["2.3", "4.2", "5.2", "6.2"] },
    { "id": 3, "tasks": ["4.3", "5.3", "5.4", "7.1"] },
    { "id": 4, "tasks": ["7.2", "7.4"] },
    { "id": 5, "tasks": ["7.3", "8.1"] },
    { "id": 6, "tasks": ["7.5", "8.2"] },
    { "id": 7, "tasks": ["10.1"] },
    { "id": 8, "tasks": ["10.2", "10.3", "11.1"] },
    { "id": 9, "tasks": ["11.2", "12.1"] },
    { "id": 10, "tasks": ["11.3", "12.2"] },
    { "id": 11, "tasks": ["12.3", "14.1", "17.1"] },
    { "id": 12, "tasks": ["14.2", "14.3", "15.1", "17.2"] },
    { "id": 13, "tasks": ["14.4", "15.2", "15.3", "17.3", "18.1"] },
    { "id": 14, "tasks": ["15.4", "18.2"] },
    { "id": 15, "tasks": ["18.3", "20.1", "20.3"] },
    { "id": 16, "tasks": ["20.2"] }
  ]
}
```
