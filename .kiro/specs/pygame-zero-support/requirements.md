# Requirements Document

## Introduction

This feature adds **Pygame Zero (pgzero)** support to the `learn-python` browser editor. It is
implemented as a **shim**: a set of Python modules registered in `sys.modules` backed by a
JavaScript bridge that renders to an in-page canvas. No real `pygame` or `pygbag` is used. The
guiding goal is API fidelity with official Pygame Zero so that the *same student code runs
unchanged in Thonny* after `pip install pgzero`.

The shim follows the pattern already established by the `turtle` and `guizero` shims in
`editor.html`. Two scope decisions shape the feature: the game loop is started **explicitly** by
the student writing `import pgzrun` and calling `pgzrun.go()`, and there is **no OS window** — the
game renders into an in-page game box whose size defines the screen (module-level `WIDTH`/`HEIGHT`
are ignored for sizing). Assets are read from the already-staged Pyodide filesystem directories
(`images/`, `sounds/`, `music/`) uploaded via the File Manager.

Requirements are organized so that each capability can be traced to one of the five delivery
phases (1 drawing, 2 events, 3 actors/images, 4 sounds, 5 music) plus a final documentation
deliverable, and so that every design Correctness Property has a requirement it validates against.

Out of scope for v1 (explicitly deferred): `animate()` and tweening, the `tone` generator, custom
fonts / a `fonts/` asset area, and `storage` (persistent JSON dict).

## Glossary

- **Shim**: The pgzero-compatible implementation built from Python modules plus a JavaScript
  bridge, used instead of the real `pygame`/`pgzero` packages.
- **Pgzero_Shim**: The overall system under design, comprising the Python modules and the JS
  bridge.
- **Game_Loop**: The `requestAnimationFrame`-driven render/update loop started by `pgzrun.go()`.
- **Hook**: A student-defined function the engine calls — `draw`, `update`, `on_mouse_down`,
  `on_mouse_up`, `on_mouse_move`, `on_key_down`, `on_key_up`, `on_music_end`.
- **Dispatcher**: The Python component that looks up hooks in the student module namespace and
  calls them with parameters selected by signature introspection.
- **Game_Box**: The in-page `#gameBox`/`#gameCanvas` region in the result pane where the game
  renders.
- **Screen**: The `screen` builtin representing the drawable surface, sized from the canvas.
- **Actor**: The pgzero `Actor` sprite object (image, position, anchor, angle, opacity).
- **Rect**: The pgzero rectangle geometry object; **ZRect** is its float-friendly variant.
- **Loader**: An accessor (`images`, `sounds`) that lazily reads and caches assets by name.
- **Clock**: The `clock` builtin for scheduling callbacks over time.
- **Music_Channel**: The single `<audio>`-backed channel exposed as the `music` builtin.
- **Pyodide_FS**: The sandboxed Pyodide filesystem under `WORKDIR=/home/pyodide`, where
  `stageProject()` writes uploaded assets.
- **Run_Lifecycle**: The existing editor lifecycle functions `enterRunningState`,
  `exitRunningState`, `requestStop`, `jsStopRequested`, and the `_Stopped` stop path.
- **Asset_Name**: An asset identifier that must match the pattern `^[a-z][a-z0-9_]*$`.
- **CSS_Pixel**: A device-independent pixel used as the game coordinate unit; the canvas backing
  store is DPR-scaled while drawing is expressed in CSS pixels.

## Requirements

### Requirement 1: Explicit game launch via pgzrun.go()

**User Story:** As a Code Club learner, I want to start my game by importing `pgzrun` and calling
`pgzrun.go()`, so that the same launch code works here and in Thonny with real Pygame Zero.

#### Acceptance Criteria

1. WHEN a student program imports `pgzrun`, THE Pgzero_Shim SHALL provide a `pgzrun` module exposing a `go` function.
2. WHEN a student program calls `pgzrun.go()`, THE Pgzero_Shim SHALL start the Game_Loop.
3. WHILE no `pgzrun.go()` call has executed, THE Pgzero_Shim SHALL NOT start the Game_Loop.
4. WHEN `pgzrun.go()` is called, THE Pgzero_Shim SHALL block the calling student code until the Game_Loop ends, then return control to the student code.
5. WHERE a student relies on bare builtin names such as `screen`, `Actor`, `images`, `sounds`, `music`, `clock`, and `keyboard` without importing them, THE Pgzero_Shim SHALL inject those names into the student module global namespace before the Game_Loop starts.

### Requirement 2: Screen sizing without an OS window

**User Story:** As a Code Club learner, I want the game to fill the in-page game area without
managing a window, so that I can focus on drawing instead of window setup.

#### Acceptance Criteria

1. THE Pgzero_Shim SHALL render the game into the Game_Box within the result pane.
2. THE Pgzero_Shim SHALL derive the Screen width and height from the current Game_Box canvas size in CSS_Pixels.
3. WHERE a student assigns module-level `WIDTH` or `HEIGHT`, THE Pgzero_Shim SHALL ignore those values for sizing the Screen.
4. THE Pgzero_Shim SHALL expose `screen.width` and `screen.height` reflecting the live canvas size.
5. WHEN the Game_Box is first used in a run, THE Pgzero_Shim SHALL reveal and size the Game_Box so that drawing is crisp at the device pixel ratio.

### Requirement 3: Coordinate system fidelity

**User Story:** As a Code Club learner, I want positions I use in code to map directly to the same
pixels on screen, so that my drawing and movement behave the way the Pygame Zero documentation
describes.

#### Acceptance Criteria

1. THE Pgzero_Shim SHALL use a top-left origin coordinate system with x increasing rightward and y increasing downward, measured in CSS_Pixels.
2. WHEN a game coordinate `(x, y)` is drawn, THE Pgzero_Shim SHALL paint it at canvas pixel `(x, y)` with no flip or offset.
3. WHEN a mouse position is reported to a Hook, THE Pgzero_Shim SHALL report the cursor position in game coordinates relative to the canvas.

### Requirement 4: Screen drawing primitives (Phase 1)

**User Story:** As a Code Club learner, I want to draw shapes and fills on the screen, so that I
can create visuals for my game.

#### Acceptance Criteria

1. WHEN `screen.clear()` is called, THE Screen SHALL clear the drawable surface.
2. WHEN `screen.fill(color)` is called, THE Screen SHALL fill the surface with the given color.
3. WHEN `screen.fill(color, gcolor)` is called, THE Screen SHALL fill the surface with a vertical gradient from `color` at the top to `gcolor` at the bottom.
4. WHEN `screen.bounds()` is called, THE Screen SHALL return a Rect covering the whole surface.
5. WHEN `screen.draw.line(start, end, color)` is called, THE Screen SHALL draw a line between the two points in the given color.
6. WHEN `screen.draw.circle(pos, radius, color)` is called, THE Screen SHALL draw a circle outline at `pos` with the given radius and color.
7. WHEN `screen.draw.filled_circle(pos, radius, color)` is called, THE Screen SHALL draw a filled circle at `pos` with the given radius and color.
8. WHEN `screen.draw.rect(rect, color)` is called, THE Screen SHALL draw the outline of the given Rect in the given color.
9. WHEN `screen.draw.filled_rect(rect, color)` is called, THE Screen SHALL fill the given Rect with the given color.

### Requirement 5: Text rendering with ptext (Phase 1)

**User Story:** As a Code Club learner, I want to draw styled text on the screen, so that I can add
labels, scores, and messages to my game.

#### Acceptance Criteria

1. WHEN `screen.draw.text(text, **options)` is called, THE Screen SHALL render the text using only the supported ptext option set.
2. IF `screen.draw.text` or `screen.draw.textbox` is called with an option outside the supported ptext option set, THEN THE Screen SHALL treat the call as non-compliant (supported options are a necessary condition; rendering text with unsupported options does not satisfy the requirement).
3. THE Screen SHALL support the ptext options `color`, `background`, `fontsize`, `antialias`, positioning anchors (`top`, `left`, `bottom`, `right`, `topleft`, `midtop`, `center`, `centerx`, `centery`, and the remaining ptext position references), `width`, `widthem`, `lineheight`, `align`, `owidth`, `ocolor`, `shadow`, `scolor`, `gcolor`, `alpha`, `anchor`, and `angle`.
4. WHERE a `fontname` option is supplied, THE Screen SHALL accept the option and render using the system or default font only.
5. WHEN a `width`, `widthem`, or `lineheight` option is supplied, THE Screen SHALL word-wrap the text within the resulting width and step lines by the computed line height.
6. WHEN `screen.draw.textbox(text, rect, **options)` is called, THE Screen SHALL fit the text to the given Rect by reducing the font size until the wrapped text fits within the Rect, then render the text within that Rect.

### Requirement 6: Color value handling

**User Story:** As a Code Club learner, I want to specify colors by name, RGB, RGBA, or hex, so
that I can use whichever color form the Pygame Zero examples use.

#### Acceptance Criteria

1. WHEN a color is provided as a name string, an `(r, g, b)` tuple, an `(r, g, b, a)` tuple, or a hex string, THE Pgzero_Shim SHALL normalise the color to a CSS color string before drawing.
2. WHEN an already-normalised CSS color string is normalised again, THE Pgzero_Shim SHALL produce the same string.

### Requirement 7: Game loop lifecycle and Stop integration

**User Story:** As a Code Club learner, I want the Run and Stop buttons to start and cleanly end my
game, so that I can run, stop, and re-run games without stale state or lingering activity.

#### Acceptance Criteria

1. WHEN `pgzrun.go()` starts the Game_Loop, THE Pgzero_Shim SHALL run under the existing Run_Lifecycle established by `enterRunningState`.
2. WHILE the Game_Loop is running, THE Pgzero_Shim SHALL, on each frame, compute the elapsed time `dt` in seconds since the previous frame and call `update` and `draw`.
3. WHEN the first frame of a Game_Loop executes, THE Pgzero_Shim SHALL use a `dt` value of 0.
4. THE Pgzero_Shim SHALL clamp `dt` to a maximum of 0.1 seconds.
5. WHILE the Game_Loop is running, THE Pgzero_Shim SHALL check `jsStopRequested()` at the start of every frame and end the Game_Loop when a stop has been requested.
6. WHEN the Stop button is pressed, THE Pgzero_Shim SHALL end the Game_Loop, stop all audio, resolve the pending `pgzrun.go()` call, and leave the final frame painted on the canvas. The pending `pgzrun.go()` call MAY be resolved before or concurrently with the final paint (the final paint is not required to complete before resolution).
7. WHEN the Game_Loop ends for any reason, THE Pgzero_Shim SHALL stop firing `update`, `draw`, `on_*`, and Clock callbacks.
8. THE Pgzero_Shim SHALL make Game_Loop teardown idempotent so that ending the loop more than once has the same effect as ending it once.
9. WHEN a new run starts, THE Pgzero_Shim SHALL cancel any Game_Loop left over from a previous run before starting the new run.
10. IF an exception is raised inside `update`, `draw`, or an `on_*` Hook, THEN THE Pgzero_Shim SHALL write a formatted error to the output pane exactly once and end the Game_Loop.

### Requirement 8: Usage detection, reset, and output accounting

**User Story:** As a Code Club learner, I want each run to start from a clean slate, so that output
from a previous run does not affect the current one.

#### Acceptance Criteria

1. WHEN student source references `pgzrun` or `pgzero`, THE Pgzero_Shim SHALL detect pgzero usage for the run.
2. WHEN a run starts, THE Pgzero_Shim SHALL reset the pgzero modules so that the Clock schedule, keyboard pressed state, Hook dispatcher references, and renderer caches start fresh.
3. WHEN output is cleared, THE Pgzero_Shim SHALL hide and clear the Game_Box, stop all audio, cancel any Game_Loop, and remove DOM input listeners.
4. WHILE the Game_Box is visible, THE Pgzero_Shim SHALL treat the Game_Box as program output so that the editor does not report "(no output)".

### Requirement 9: Handler signature introspection and dispatch

**User Story:** As a Code Club learner, I want to declare only the Hook parameters I care about, so
that my handlers behave exactly as they do in real Pygame Zero.

#### Acceptance Criteria

1. WHEN the Dispatcher calls a Hook, THE Dispatcher SHALL pass exactly the parameters the Hook names from that Hook's available argument vocabulary and no others.
2. WHERE a Hook names no parameters, THE Dispatcher SHALL call the Hook with no arguments.
3. THE Dispatcher SHALL support the argument vocabularies: `update` provides `dt`; `on_mouse_down` and `on_mouse_up` provide `pos` and `button`; `on_mouse_move` provides `pos`, `rel`, and `buttons`; `on_key_down` provides `key`, `mod`, and `unicode`; `on_key_up` provides `key` and `mod`; and `draw`, `update` (when no `dt` named), and `on_music_end` provide no additional arguments beyond those listed.
4. WHEN the Dispatcher resolves a Hook, THE Dispatcher SHALL look the Hook up in the student module namespace on each call so that late definitions and absent Hooks are handled.
5. IF a Hook is absent from the student module namespace, THEN THE Dispatcher SHALL skip calling that Hook.

### Requirement 10: Keyboard input (Phase 2)

**User Story:** As a Code Club learner, I want to read and respond to key presses, so that players
can control my game with the keyboard.

#### Acceptance Criteria

1. WHILE the Game_Loop is running, THE Pgzero_Shim SHALL track the set of currently pressed keys from DOM `keydown` and `keyup` events.
2. WHEN a student reads `keyboard.<name>` or `keyboard[keys.<NAME>]`, THE Pgzero_Shim SHALL return a boolean indicating whether that key is currently pressed.
3. THE Pgzero_Shim SHALL provide a `keys` enum covering the Pygame Zero key set and SHALL map DOM key codes to pgzero key names in a layout-independent way.
4. WHEN a key is pressed or released, THE Dispatcher SHALL dispatch `on_key_down` or `on_key_up` with `key`, `mod`, and (for `on_key_down`) `unicode` values.
5. THE Pgzero_Shim SHALL provide a `keymods` enum and SHALL build the `mod` bitmask from the DOM modifier flags for Shift, Control, Alt, and Meta.

### Requirement 11: Mouse input (Phase 2)

**User Story:** As a Code Club learner, I want to respond to mouse clicks and movement, so that
players can interact with my game using the mouse.

#### Acceptance Criteria

1. WHEN a mouse button is pressed or released over the canvas, THE Dispatcher SHALL dispatch `on_mouse_down` or `on_mouse_up` with `pos` and `button`.
2. WHEN the mouse moves over the canvas, THE Dispatcher SHALL dispatch `on_mouse_move` with `pos`, `rel`, and the set of currently pressed `buttons`.
3. THE Pgzero_Shim SHALL provide a `mouse` enum with `LEFT`, `MIDDLE`, `RIGHT`, `WHEEL_UP`, and `WHEEL_DOWN` and SHALL map DOM mouse button and wheel events to these values.
4. WHEN a mouse position is provided to a Hook, THE Pgzero_Shim SHALL express `pos` in CSS_Pixels relative to the canvas.
5. WHEN the Game_Loop ends, THE Pgzero_Shim SHALL remove the DOM key, mouse, and wheel listeners from the canvas so that a stopped game stops responding to input. THE Pgzero_Shim SHALL always remove these listeners on stop and attach fresh listeners on each start, regardless of how soon a restart occurs.

### Requirement 12: Rect and ZRect geometry (Phase 1)

**User Story:** As a Code Club learner, I want to work with rectangles and their anchor points, so
that I can position and align game elements.

#### Acceptance Criteria

1. WHEN a Rect is constructed from `(x, y, w, h)`, from `((x, y), (w, h))`, or from another Rect, THE Pgzero_Shim SHALL create an equivalent Rect.
2. THE Rect SHALL expose readable and writable attributes `x`, `y`, `width`, `height`, `left`, `right`, `top`, `bottom`, `topleft`, `topright`, `bottomleft`, `bottomright`, `center`, `centerx`, `centery`, `midtop`, `midbottom`, `midleft`, `midright`, and `size`.
3. WHEN an anchor attribute is written then read, THE Rect SHALL return the written value.
4. WHEN an anchor attribute is written, THE Rect SHALL preserve its `size`.
5. WHEN `a.colliderect(b)` and `b.colliderect(a)` are evaluated for any two Rects `a` and `b`, THE Rect SHALL return the same result for both.
6. THE Rect SHALL provide the collision and combination methods `colliderect`, `collidepoint`, `contains`, `clip`, and `union`.
7. THE Pgzero_Shim SHALL provide `ZRect` as a float-friendly variant exposing the same API as Rect.

### Requirement 13: Images and blitting (Phase 3)

**User Story:** As a Code Club learner, I want to load and draw images I uploaded, so that I can
use sprites and backgrounds in my game.

#### Acceptance Criteria

1. WHEN `images.<name>` is accessed, THE Loader SHALL read `images/<name>` from the Pyodide_FS, trying the supported extensions (`.png`, `.jpg`, `.gif`), decode it, and cache the result by name.
2. WHEN an image is accessed more than once, THE Loader SHALL return the cached image rather than decoding it again.
3. WHEN `screen.blit(image, (x, y))` is called, THE Screen SHALL draw the given image at position `(x, y)`.
4. IF an image file is not present on the Pyodide_FS, THEN THE Loader SHALL raise a clear Python error.
5. IF image bytes cannot be decoded, THEN THE Pgzero_Shim SHALL surface a readable error and not start or continue the Game_Loop.

### Requirement 14: Actors (Phase 3)

**User Story:** As a Code Club learner, I want to create actors from images and move, rotate, and
fade them, so that I can build sprite-based games.

#### Acceptance Criteria

1. WHEN `Actor(name, pos=(x, y))` is constructed, THE Actor SHALL load the named image to determine its natural size and build a backing Rect sized to the image.
2. THE Actor SHALL expose position and anchor attributes (`pos`, `x`, `y`, and the Rect anchor attributes) that delegate to its backing Rect.
3. THE Actor SHALL default its `anchor` to `center`, and WHEN `pos` is set, THE Actor SHALL move so that its anchor is at `pos`.
4. WHEN an Actor with a non-zero `angle` is drawn, THE Actor SHALL render the sprite rotated anticlockwise around its anchor.
5. WHEN an Actor with `opacity` less than 1 is drawn, THE Actor SHALL render the sprite at that opacity.
6. WHEN `actor.distance_to(target)` or `actor.angle_to(target)` is called, THE Actor SHALL return the distance or angle from the actor to the target point or actor.
7. WHEN `actor.colliderect(other)` or `actor.collidepoint(point)` is called, THE Actor SHALL return the collision result from its backing Rect.
8. WHEN `actor.draw()` is called, THE Actor SHALL render its image at its current position, angle, and opacity.

### Requirement 15: Clock scheduling (Phase 1)

**User Story:** As a Code Club learner, I want to schedule callbacks over time, so that I can
animate and time events in my game.

#### Acceptance Criteria

1. WHEN `clock.schedule(callback, delay)` is called, THE Clock SHALL fire the callback once after `delay` seconds of game time.
2. WHEN `clock.schedule_unique(callback, delay)` is called, THE Clock SHALL replace any existing schedule of the same callback and fire it once after `delay` seconds.
3. WHEN `clock.schedule_interval(callback, interval)` is called, THE Clock SHALL fire the callback repeatedly every `interval` seconds.
4. WHEN `clock.unschedule(callback)` is called, THE Clock SHALL cancel the scheduled callback.
5. WHILE the Game_Loop is running, THE Clock SHALL advance by the frame `dt` before `update` is called each frame and fire due callbacks through the Dispatcher introspection path.

### Requirement 16: Sound effects (Phase 4)

**User Story:** As a Code Club learner, I want to play sound effects when things happen, so that my
game gives audio feedback.

#### Acceptance Criteria

1. WHEN `sounds.<name>` is accessed, THE Loader SHALL read `sounds/<name>` from the Pyodide_FS, trying the supported extensions (`.wav`, `.ogg`), decode it to an audio buffer, and cache the result by name.
2. WHEN `sound.play()` is called, THE Pgzero_Shim SHALL play the sound, allowing concurrent playback of multiple sounds.
3. WHEN `sound.play(loops)` is called, THE Pgzero_Shim SHALL play the sound and repeat it for the given finite loop count.
4. WHEN `sound.stop()` is called, THE Pgzero_Shim SHALL stop all currently playing instances of that sound.
5. WHEN `sound.get_length()` is called, THE Pgzero_Shim SHALL return the sound duration in seconds.
6. WHEN the Game_Loop ends or output is reset, THE Pgzero_Shim SHALL stop all playing sounds.

### Requirement 17: Music playback (Phase 5)

**User Story:** As a Code Club learner, I want background music that I can control, so that my game
has a soundtrack.

#### Acceptance Criteria

1. THE Music_Channel SHALL play at most one music track at a time.
2. WHEN `music.play(name)` is called, THE Music_Channel SHALL stream `music/<name>` and loop it continuously.
3. WHEN `music.play_once(name)` is called, THE Music_Channel SHALL stream `music/<name>` and play it a single time.
4. WHEN `music.queue(name)` is called, THE Music_Channel SHALL add the track to a queue and advance to it when the current track ends.
5. IF `music.queue(name)` is called while the current track is looping (started via `music.play()`), THEN THE Music_Channel SHALL cancel the current track's looping so it stops after the current iteration and the queue then advances.
6. WHEN `music.stop()` is called, THE Music_Channel SHALL stop playback, reset the track position, and clear the queue.
7. WHEN `music.pause()` or `music.unpause()` is called, THE Music_Channel SHALL pause or resume playback.
8. WHEN `music.is_playing(name)` is called, THE Music_Channel SHALL return whether a track matching that name is currently playing.
9. WHEN `music.fadeout(duration)` is called, THE Music_Channel SHALL ramp the volume to zero over `duration` seconds and then stop playback.
10. WHEN `music.set_volume(v)` is called, THE Music_Channel SHALL set the music volume, and WHEN `music.get_volume()` is called, THE Music_Channel SHALL return the current music volume.
11. WHEN a non-looping or queue-ending track finishes with no queued track remaining, THE Dispatcher SHALL dispatch the `on_music_end` Hook.

### Requirement 18: Asset name validation

**User Story:** As a Code Club learner, I want clear errors when I use an invalid asset name, so
that I can quickly fix naming mistakes that would also fail in Thonny.

#### Acceptance Criteria

1. IF an Asset_Name does not match `^[a-z][a-z0-9_]*$`, THEN THE Loader SHALL raise a clear Python error before any Pyodide_FS access.
2. WHEN a valid Asset_Name is used, THE Loader SHALL resolve it to `<area>/<name>.<ext>` on the Pyodide_FS using the supported extensions for that media area.
3. IF a requested music track file is not present on the Pyodide_FS, THEN THE Music_Channel SHALL raise a clear Python error without crashing the Game_Loop.

### Requirement 19: Documentation and samples deliverable

**User Story:** As a Code Club teacher, I want reference material and runnable samples, so that I
can teach Pygame Zero in this editor and point students to the editor-specific notes.

#### Acceptance Criteria

1. THE documentation deliverable SHALL provide a `cheatsheet-pgzero.html` page mirroring the existing cheatsheets.
2. THE `cheatsheet-pgzero.html` page SHALL document that the game fills the game area, that `WIDTH` and `HEIGHT` are ignored, that `pgzrun.go()` is required, and the Asset_Name rules.
3. THE documentation deliverable SHALL add a hub card on `index.html` linking to the pgzero material.
4. THE documentation deliverable SHALL provide sample programs demonstrating each delivery phase.
