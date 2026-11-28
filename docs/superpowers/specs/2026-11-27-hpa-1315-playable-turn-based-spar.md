# HPA-1315 — Playable turn-based spar (design spec)

## Goal and scope

[HPA-1315](https://linear.app/cwchanap/issue/HPA-1315/playable-turn-based-spar-on-the-sect-training-yard)
replaces the first-day quest's real-time duel with a playable 1v1 tactical spar against
Senior Brother Lu on the Sect Training Yard. HPA-1310 (#6) and HPA-1311 (#7) are on main;
their headless engine and AI are the rules authority. Deliver the design, implementation,
tests and acceptance evidence in this single PR, initially draft.

Include one authored map and encounter, battle entry/exit, movement/action/facing,
mouse and keyboard controls, event playback, plain functional HUD, defeat/retry,
victory/reward, and deletion of real-time combat. No squad deployment, recruitment,
arts scroll, polished ink-and-paper battle panels (HPA-1316), sound (HPA-1318), new
art or map editor. Reuse the existing GLB, procedural geometry and HUD primitives;
asset generation is separately ticketed. No additional game framework or route.

## Current seams

- `simulation/state.ts` owns `stepGame`, quest dialogue completion, inventory and
  the legacy duel. `quest.ts` and `villageContent.ts` currently use the duel step/event.
- `runtime/createGameRuntime.ts` owns RAF, input, projection, HUD publication and
  progress persistence. The existing save contains only items and quest, not live
  positions or combat.
- `simulation/battle/index.ts` exposes `createBattle`, `applyBattleCommand`,
  `getTurnOrder`, `getReachableCells`, `getMoveTargets`, `forecastMove`, the
  content catalogs and `planBattleTurn`. Use those public APIs; do not import cached
  internal reducers or implement damage/range/AI again.
- `render/createWuxiaScene.ts`, `camera.ts` and `wuxiaAssets.ts` own the single
  Three.js renderer, fixed 45°/35° orthographic camera, model loading and disposal.
- `+page.svelte` and `hud/layout.ts` currently render duel-specific UI; the
  existing Playwright first-day journey drives the legacy real-time fight.

## Authored map and encounter

Use two small typed records under `simulation/battle` (e.g. `encounters.ts`), not
a generic registry or ECS. The map contains an ID, terrain strings (size derived
from rows), one cell size and decoration placements (kit piece ID, cell/world
offset, heading); spawn slots with cells/facing are data. The encounter references
the map and defines hero/foe placements, existing template IDs/values, caller-owned
AI profiles, defeat-all goal and existing victory reward policy. Map and encounter
data never contain Three objects.

Proposed starter 8 × 8 courtyard (z rows, x columns, 1.5 m per cell):

```text
........
.T....#.
......#.
........
........
.T....T.
........
........
```

Hero at (1, 3), E; Lu at (5, 3), W, with the existing
`SENIOR_BROTHER_LU_TEMPLATE` and Aggressor profile. Use the existing
`SECT_HERO_TEMPLATE` with equipped stat bonuses. The map is centered at a local
origin; ground is stone, # cells are a low wall, T cells are walkable bamboo cover.
Lantern posts and any perimeter roofs sit outside playable space; don't make
walkable cells look impassable. Verify start cells, connectivity, reachable
opening attacks, and a deterministic achievable victory and defeat against real
Lu AI before wiring the UI. Tune only authored map/setup if needed, not global
rules or AI weights. One map, one encounter; no use of a village subregion as
the battle's collision map.

## Simulation and progress lifecycle

Change `GameMode` to explore/dialogue/battle. A battle session in the battle
variant owns encounter ID, immutable-by-convention `BattleState` returned by the
engine and a result-finalized flag. The map and enemy profiles are resolved
from the encounter, not stored in the rules state or save. Rename the quest step
to battle and event to battleWon. Enter only when step 5's Lu dialogue completes;
after quest completion his normal dialogue must not start another spar.

Extend `stepGame` to accept at most one battle intent per tick and return a
small result describing accepted events/rejection or mode change. It remains the
only writer of GameState. In battle, route pause first, then battle intents;
do not run village movement, dash, interactions, elapsed/cooldown/effect updates
or inventory commands (including direct HUD calls). The village player pose,
resources, markers and quest remain frozen until an explicit result transaction.
Clear village input/hover at mode changes. The battle uses a fresh engine state
at full HP/qi and a copy of the village's two pill counts; never mutate its
previous state or the persistent inventory during a turn.

A player intent must belong to the active squad hero and be legal for the current
state. An internal runtime AI intent is separately tagged and can only act for
the active enemy; never expose it to HUD. Both enter the same reducer. A rejected
command leaves state and events unchanged; display a short reason if necessary.
Move is optional; acting consumes movement opportunity; endTurn requires an
action then a facing. This is the merged rules contract, even though the mockup
mentions skip action. Guard or Gather are the supported alternatives to attacking.
A terminal result or counter-kill handoff must not require another command.

Equipment and items must remain meaningful after deleting the old combat model:

- Replace lightAttackDamageBonus/qiBurstDamageBonus with powerBonus (+2 training
  sword, +4 tempered sword); retain maxHealthBonus (+10/+20 robes), maxQiBonus
  (+20 charm). Update item descriptions, inventory stat helpers, and exploration
  vitals; keep item IDs, counts, quick slots and reward table/seed. No legacy
  combat fields or damage function.
- Construct hero template from its base + equipped power/maxHealth. Add only a
  validated optional non-negative integer maxQiBonus to FighterTemplate if needed
  so createBattle initializes both maxQi and qi from the internal-art base plus
  bonus. Existing templates and AI remain unchanged; regeneration, Gather and
  pills use the engine's fighter maxQi cap. Add focused engine tests for the
  optional bonus and invalid values. Do not modify a live BattleState externally.
- In battle, expose the two actual squadBag pills as one action targeting the
  hero; useItem resolves through rules, not the village inventory path. Outside
  battle, bag/equipment/quick-slot assignment and quest step 3 still work.
  Remove combat-only cooldowns/quick-slot activation from battle; keep village
  bag and exploration quick slots/consumable use as applicable.

At terminal outcome, drain playback first. Runtime then sends a one-shot
finalize-result intent through stepGame; the simulation validates the terminal
outcome and flag. Victory reconciles the two remaining pill counts from the
battle bag into persistent inventory (remove depleted entries/normalize quick
slots consistently with existing item helpers), invokes `grantVictoryReward`
once, advances the quest once and records the result. Persist items and quest
together using the existing runtime save path. The battle result panel displays
the reward; Return restores the untouched village pose, heading, resources and
Lu at his authored post, with the existing reward feedback visible. No retry
after victory. Defeat commits no pills, reward or quest changes; Retry creates
a completely fresh battle from the same unchanged village items and setup.
Return after defeat also leaves the quest at step 5 with no penalty and allows
talking to Lu again. A repeated finalize/return/retry intent cannot duplicate
rewards or apply a stale command. A reload before finalized victory abandons
the in-flight battle (the current save does not persist positions or battles);
after finalized victory reload resumes completed quest and reward exactly once.
Keep the existing v2 progress key if its serialized shape is unchanged; if
implementation changes the shape, bump the version and ignore old saves without
migration.

## Runtime sequencing and presentation

Use a small battle playback controller owned by the runtime (e.g.
`runtime/battlePlayback.ts`), not by rules, plus a pure derived battle HUD/view
projection. The runtime loop consumes input once per RAF; choose at most one
player command or one next AI command only when no playback is active, unpaused,
and the active side matches. Schedule Lu by calling
`planBattleTurn(state, activeId, profile)` once when his turn becomes active,
then replay its short list in order, one command per drained playback batch.
Clear the list when actor changes, terminal state, retry, return or dispose;
never run a stale endTurn after a counter handoff. Unexpected rejected/empty AI
plan in an ongoing enemy turn is a detectable integration error (clear queue,
surface error; no spin or silent turn skip). No timers in the reducer.

The rules resolve synchronously. Capture pre-command display pose/stats and
accepted ordered BattleEvents. Playback is a presentation-only cursor over that
batch: moved follows the returned path; attacked/countered plays a simple strike
pose; damaged shows the applied number and updates displayed HP; defeated
shows a fallen pose; turn/round/facing/qi/item/guard events update visible
presentation in order. Reconcile display exactly to the accepted state when the
batch drains. Do not use post-command positions for a still-moving actor or show
the next fighter/result before the relevant event plays. Keep one batch in
flight; discard input received while busy rather than buffering stale clicks.
Pause freezes playback/AI; resume continues, and dispose cancels RAF and clears
queues. Reduced/zero motion may shorten durations but still consume every event
in order. No animation framework, promises per event, or second rules engine.
Publish HUD through `toHudSnapshot` using a readonly presentation projection for
visual stats; legal choices/forecast always query the authoritative state and
are unavailable while busy. Build legal options on state/selection changes,
not repeated AI/forecast computation every render frame.

## Scene, projection and grid

Keep one WebGLRenderer and one camera; build a separate battle group/root from
map data with `render/battleScene.ts`, switch visibility against the village
root on mode changes. Reuse hero/Lu model instances or safe clones with shared
GLB resources owned by the existing loader; village NPCs, markers, terrain and
effects are hidden in battle, not destroyed. Reuse existing stone courtyard,
wall/lantern/bamboo kit geometry/materials (inspect the named Village GLB
children and procedural helpers), with the current procedural fallback if the
pack fails. Kit placement is authored; don't clone the whole village as the
arena or rely on a new asset. Create the battle group once or dispose its
owned geometry/materials on teardown; shared GLB geometry/textures disposed
only by their owner. Handle late GLB resolution while in battle or after
dispose; no duplicate canvases or leaked resources on retry/return.

Centralize cell-to-world (center/size/origin) and ground-world-to-cell transforms,
using integer (x,z), N = z - 1. Render thin grid lines on ground, jade reachable
cells with a gold dotted path and hover outline, red/amber aim and affected
cells, side rings and cardinal facing triangles for fighters; distinguish
unaffordable, out-of-range and empty/invalid targets. All reachability/path/
affected/hostile IDs come from engine queries (path includes start); visuals
are not legal checks. Use depth offsets to avoid z-fighting and clear stale
overlays on phase/actor/result changes. Show cost/terrain on hovered reachable
cell. Edge mist via a small perimeter fade/fog treatment, not a fullscreen
overlay that obscures the board.

Retain camera azimuth/pitch and shared `orthoFrustum`. Replace duel midpoint
framing with a larger battle view height (start around 18 m, fit projected
board and HUD-safe inset for current aspect), follow the active fighter with
focus clamped so the whole playable grid stays visible. Fit/clamp using the
same projection at supported desktop widths; reset smoothing on mode switch
so the camera doesn't fly across the village. Reapply frustum on resize.
Pointer coordinates come from the canvas CSS rect, not backing pixels. Pick
using a ray to y=0 derived from the actual last-rendered pose/viewport/frustum
(or the actual orthographic camera); resolve fighter hit proxies to their
current cell in target mode. Use one shared projection for cell picking,
hover, camera, overlay and floating damage; reject out-of-bounds clicks.
During a resize/mode transition invalidate stale picks until a new frame
exists. Test round trips across cells, aspect ratios, camera smoothing and
DPR, including edge cells. Never use a nominal desired camera or screen
coordinate approximation.

## Controls and functional HUD

Keep village input and key semantics unchanged except obsolete attack/qi-burst
bindings. In battle, edge-triggered keyboard and pointer intents use the same
selection and confirm handler; keyboard cursor uses N/E/S/W grid axes (arrows
or WASD, labeled on screen), not continuous village movement.

| Phase | Mouse | Keyboard |
| --- | --- | --- |
| Move | Hover jade cell for route/cost, click to commit | M selects Move; arrows/WASD move cursor, Enter commits |
| Attack | Select move button, hover/select aim for forecast, explicit Confirm | 1/2/3 select basic/technique/finisher, arrows/WASD select aim, Enter confirms |
| Item | Select Item and pill, confirm on hero | 4 opens pill choice, arrows/1/2 choose, Enter confirms |
| Guard / Gather | Click labeled action | G / Q |
| Face | Choose facing arrow, confirm End Turn | E selects facing, arrows/WASD select, Enter confirms |
| Result | Retry (defeat) / Return button | R retries defeat, Enter returns |
| Cancel / pause | Cancel selection / pause button | Escape cancels selection first, then pauses/resumes |

Initial cursor at hero cell; keyboard can select valid aim cells including
multi-cell patterns; show same forecast as pointer. For mouse attack, first
selecting the target shows forecast, then confirm (button or explicit second
click on same aim); changing aim/move/actor invalidates prior confirmation.
No end-turn shortcut that skips the required action. Disable unaffordable,
spent or otherwise invalid actions and confirm; only reducer acceptance changes
battle state. No click-through from HUD to canvas, no held-key auto-submission,
no queued combat actions on pause, enemy turn or playback. Prevent browser
scrolling only for handled battle keys while game is active; retain normal
focus/accessible buttons and avoid duplicate keyboard handler plus native
button activation. Result panel is not interactive before playback finishes.

A dedicated plain `BattleHud.svelte` uses a derived battle HUD snapshot:
round/active name/phase, both HP and qi, move list with name/cost, Guard,
Gather, item count/options, cursor/selected aim, path/terrain cost, attack
forecast (damage, counter damage, qi, potential defeat), facing choices and
result/reward. Use engine catalogs and forecast; no UI-side calculations of
damage or qi. Existing explore/dialogue HUD, minimap, quest, bag, banner and
pause remain. Hide village-only HUD in battle. Keep CSS simple and labels
readable; no new font/portrait/icon generation or ink-panel styling required.

## Legacy removal and tests

Delete real-time combat action/phase types and state, hitstun/attack timing
windows, rival chase/duel ring/duel camera, real-time action cooldowns,
light attack / qi burst input and corresponding HUD cooldown widgets and
tests. Keep exploration movement/dash collision and dash marker logic; extract
movement constants/helpers from combat.ts to movement.ts (or existing world
module). Lu's village actor comes from villageContent like other NPCs; retain
existing player/GLB models, ink silhouettes, resource disposal, normal bag
and quest feedback. Refactor item stats and stale text; no compatibility
toggle. Update both CLAUDE.md and AGENTS.md architecture/commands.

## Acceptance

See the companion implementation plan for exact automated gates. The same
single PR must contain a real browser first-day quest to spar victory,
keyboard-only and mouse-only spar journeys, defeat/retry, return and
reward/save checks, plus focused integration and projection/playback tests.
Use a browser MCP (Playwright/Chrome DevTools) and execution MCP for actual
acceptance; Chromium desktop alone is sufficient. No human acceptance gate.

Visual reference: Linear HPA-1315 attachment **Battle HUD mockup 1: move step**
(`battle-hud-1-move.jpg`), inspected during planning. Compare actual battle
screenshots to its scene portion: readable isometric stone courtyard with
perimeter village kit, mist vignette, fine square grid, jade move-range tiles,
gold route and hover outline, fighter base rings and facing markers. The
reference depicts a squad and final ink-and-paper panels; this ticket must
show only two fighters and plain HUD. Do not copy its placeholder stats,
turn order, skip-action label, panel styling or extra actors. Verify aim/area,
forecast and result in additional screenshots. Use the 960 × 640 existing
Playwright viewport and a wider 1440 × 900 viewport for visual fit, with
actual screenshots inspected by browser MCP; include concise comparison
notes and screenshots as CI artifacts or PR attachments, not committed.
Check, lint and full tests must pass. No code or new assets in this planning
commit; implementation and acceptance follow in this PR.
