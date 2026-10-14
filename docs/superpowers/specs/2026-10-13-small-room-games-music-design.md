# Small-room mode, two new games, and music — design

Date: 2026-10-13
Status: approved (chat), pending spec review

Three independent sub-projects, built in this order: **A → C → B** (Statues needs
music control; Copy-the-pose relies on upper-body framing).

---

## A. Small-room mode

### Problem

Players in a small room cannot stand 2–3 m from the camera. Today:

- `workout` needs ankles/knees (squats, jumping jacks, high knees) and stalls.
- On a portrait phone, `coverMapping` crops a 16:9 video to ~35% of its width.
- Collider radius is a fixed 3.5% of the screen, unrelated to body size.
- Copy tells players to stand 2–3 m away.

### Design

1. **Framing detector** — `src/pose/framing.ts` (pure).
   - `type Framing = 'full' | 'upper'`.
   - `updateFraming(state, players, dtMs)`: a player counts as *full* when both
     knees **or** both ankles are visible. The session framing is `full` if any
     player is full; it switches only after the opposite condition holds for
     `FRAMING_HOLD_MS = 1000` (hysteresis, no flicker). Starts as `full`.
   - With zero players the state does not change.
   - Exposed on `FrameInput` as a new readonly field `framing: Framing`, computed
     in `main.ts` from the player feed.

2. **Adaptive workout** — `src/workout/routine.ts`.
   - `UPPER_BODY_ORDER: ExerciseId[] = ['armRaises', 'punches', 'armOpeners']`.
   - Two new exercises in `src/workout/exercises.ts`:
     - `punches`: alternating wrist extension in front of the shoulder
       (wrist–shoulder distance / shoulder width > 1.1, then back < 0.6), per side.
     - `armOpeners`: both wrists move from in front of the chest (wrists closer
       than shoulder width) to wide apart (wrist distance > 2.2 × shoulder width).
   - The routine is picked in `start()` from the framing at that moment. `start`
     gets the framing through a new optional `StartContext { framing }` argument.
     Existing games ignore it.

3. **Camera** — `src/camera.ts`.
   - After `getUserMedia`, if `track.getCapabilities().zoom` exists, apply
     `{ advanced: [{ zoom: min }] }`. A failure is logged with `console.warn`
     and is not fatal.
   - **Fit mode** in `bodyColliders.ts`: new `fitMapping` (letterbox, contain).
     `viewMapping(...)` chooses `fit` when the cover crop would discard more
     than `MAX_CROP = 0.3` of either video dimension, otherwise `cover`.
     `drawMirroredVideo` already works from the mapping. Bars are filled with
     the theme background.

4. **Body-scaled colliders** — `baseRadius` per player =
   `clamp(shoulderWidth × 0.22, screenMin × 0.025, screenMin × 0.08)`, falling
   back to the current 3.5% when shoulders aren't visible. Computed in
   `trackPlayers` per person.

5. **Copy** — `messages.intro` gets a line saying half a body also works, and
   `messages.noBody` drops "aléjense". A new `messages.upperBody` toast shows
   once when framing switches to `upper`.

### Tests

- framing hysteresis (switch after 1 s, no switch at 900 ms, zero players keeps state)
- `viewMapping` picks fit for portrait-screen + landscape-video, cover for 16:9 on 16:9
- `punches` / `armOpeners` counting with skeleton fixtures
- routine selection by framing
- collider radius clamps

---

## B. New games

Both implement `MiniGame<S>` with a pure `step`, a separate `render/` file, and
i18n keys under `games.<id>`. They are registered in `registry.ts`.

### B1. Statues (`statues`) — "Estatuas"

Phases cycle in state: `dance` → `freeze` → (`result`) → `dance` ...

| Phase | Duration | Behavior |
|---|---|---|
| `dance` | random 5–12 s | music on, "¡Bailen!" |
| `freeze` | 3 s | music off; first `GRACE_MS = 500` ignored; then motion is measured |
| `result` | 1.2 s | shows who moved, music stays off |

- **Motion metric** (per player id): mean displacement of visible joints between
  consecutive frames, divided by that player's shoulder width, accumulated over
  the freeze window minus grace. A player has *moved* when the accumulated value
  exceeds `MOVE_THRESHOLD` (tuned with real captures; start at 0.6). A player
  with no shoulder width visible that frame is skipped for that frame.
- Joint jitter: displacements below `JITTER = 0.02` × shoulder width are dropped
  before accumulating, so model noise doesn't count as movement.
- Each round where at least one player moved costs **one** team life (3 lives).
  Moved players get a "¡Te moviste!" label above their head in their color.
- Score per round = number of players who stayed frozen. Players who enter
  mid-freeze are not judged that round.
- Ends when lives reach 0. `status()` returns `{ score, lives, music }`.
- Freeze duration shortens 0.1 s per round down to 2 s; dance range unchanged.

### B2. Copy the pose (`copyPose`) — "Copia la pose"

- **Pose library** `src/games/poses.ts`: ~10 upper-body poses defined as target
  angles for 4 segments: left/right upper arm (shoulder→elbow) and left/right
  forearm (elbow→wrist), measured in screen space after mirroring. Examples:
  T, Y, arms down, hands on head, flex, one-arm-up (L/R), dab (L/R), X over chest.
- **Match**: angular error per segment, wrapped to [0, π]; a player matches when
  all 4 visible segments are within `TOLERANCE = 25°`. Missing segments → no match.
- **Round**: pose shown as a silhouette drawn from the target angles; `5 s` to
  match; a player scores when they hold the match for `HOLD_MS = 1000`
  (cumulative within the round, resets if broken for > 250 ms).
- Score += players who scored this round. Lives: a round where nobody scores
  costs one life (3 lives). Round time shrinks 0.25 s per round down to 3 s.
- Next pose is random, never the same as the previous one.
- Per-player progress ring drawn above each head, in their color.

### Tests

- statues: phase transitions, grace window, jitter floor, mover detection, life
  loss once per round, late joiner not judged, music flag per phase
- copyPose: angle wrap, match/no match per segment, hold accumulation and break
  tolerance, life loss when nobody scores, no repeated pose

---

## C. Music

### Architecture — `src/audio/`

```
audio/
  engine.ts      AudioContext lifecycle, unlock on user gesture, master gain, mute
  music.ts       interface MusicSource { play(mood); stop(); dispose() }
  synth.ts       SynthMusic: step-sequencer loops per mood (Web Audio oscillators)
  tracks.ts      TrackMusic: MP3s from public/music/manifest.json
  director.ts    pure: (session, games) → desired { mood | null, playing }
```

- **Moods**: `menu`, `upbeat`, `calm`. Each `MiniGame` gets an optional
  `mood?: Mood` (default `upbeat`; workout `upbeat`, statues `upbeat`,
  copyPose `calm`).
- **`GameStatus.music?: 'on' | 'off'`** — when present, it overrides playing state
  (Statues uses it). Countdown plays the game's mood; game over stops music.
- **Director** is pure and unit-tested; `main.ts` applies its output to the active
  `MusicSource` only when it changes (no per-frame restarts).
- **Source selection**: `TrackMusic` when `manifest.json` lists at least one track
  for the mood and it loads; otherwise `SynthMusic`. A failed fetch or decode
  logs a warning and falls back to synth for that mood. A missing file is not
  treated as silence.
- **Stop is immediate** (gain ramp ≤ 50 ms), which Statues needs.
- **Unlock**: `engine.unlock()` is called inside the "Activar cámara" click
  handler (browser autoplay policy).
- **Mute**: corner button with a Phosphor-style speaker icon drawn like the
  existing ones in `render/icons.ts`, plus the `M` key. Persisted in `localStorage`
  under `game-cam.muted`. Mute is a master-gain change, so phase logic keeps running.

### Tracks

- 2–3 CC0 tracks from OpenGameArt, license verified per track and recorded in
  `public/music/LICENSES.md` (title, author, URL, license). Only tracks
  explicitly marked CC0 are used.
- Encoded at ≤ 128 kbps, ≤ 1.5 MB each, and precached by the PWA (update the
  `vite-plugin-pwa` glob to include `mp3`).

### Tests

- director: menu → menu mood; countdown/playing → game mood; gameOver → null;
  `music: 'off'` → not playing
- source selection fallback (manifest empty / fetch fails → synth), with
  `fetch` injected
- engine/synth are thin Web Audio adapters and are verified in the browser,
  not unit-tested

---

## Cross-cutting

- All new user-facing text goes in `src/i18n/es.json`; code and identifiers stay in English.
- README gets the new games, small-room notes, music and track licenses.
- Each sub-project ends with `pnpm test`, `pnpm build`, and a manual run in the browser.

## Out of scope

Sound effects, per-player (competitive) scoring, user-uploaded music, and a
manual framing toggle.
