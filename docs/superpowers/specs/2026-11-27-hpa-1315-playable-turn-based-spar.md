# HPA-1315 — Playable turn-based spar (design spec)

## Goal and boundaries

[HPA-1315](https://linear.app/cwchanap/issue/HPA-1315/playable-turn-based-spar-on-the-sect-training-yard)
replaces the first-day quest's real-time duel with a playable 1v1 turn-based spar
against Senior Brother Lu. HPA-1310 (#6) and HPA-1311 (#7) are merged. The single
draft PR delivers one authored battle grid/encounter, battle entry/exit, mouse
and keyboard actions, ordered playback, functional HUD, victory/reward and
defeat/retry. Delete the real-time duel. No new artwork, audio, map editor,
deployment, arts scroll or polished HPA-1316 battle panels.

## Reuse the training yard

Reuse the existing courtyard at world origin, not a second copy of the village.
The procedural stone pad is 15 × 15 m; the loader attaches the merged Village GLB
as one group rather than providing independently placeable kit meshes. Existing
walls, lanterns and bamboo provide the surrounding environment. The battle map
is a separate **logical** square grid and encounter with its own collision and
fighter placement; its visual set is the existing courtyard. Enter battle mode
with the battle camera, grid, mist edge treatment and only the two combatants
visible. This interprets the ticket's separate battle map as a separate tactical
play space, not a second physical scene or asset pack.

Use fixed constants for an 8 × 8 grid of 1.5 m cells, lower corner (-6, -6);
cell centres are origin + (index + 0.5) × size. Author
`SECT_TRAINING_YARD_TERRAIN` and `LU_PROFILE` beside the battle content,
and a small `createSparSetup(items): BattleSetup` in simulation. Reuse the
existing BattleSetup type (terrain strings derive dimensions; placements contain
side, template, cell and facing; hero ID and squad bag). No encounter ID,
registry, decoration schema, configurable goal or reward policy for one spar.
Use the existing hero and Lu templates, Aggressor AI, and propose hero (1, 3)
facing E and Lu (5, 3) facing W, subject to the encounter test.

Before fixing the terrain, draw the grid over the actual loaded courtyard and
inspect loaded-GLB and forced-fallback browser screenshots. Remove the obsolete
MVP `createShrine` inside the fallback courtyard at (-4.2, -3.35), not the
actual shrine/bell at the authored distant village location. Flatten/remove
the fallback raised stepping slabs at z = -3.2 so ground overlays remain
visible above the pad. Three procedural posts are at z = -5.2 and
x = -1.8, 0, 1.8; move them to appropriate cell centres if necessary. Bamboo
and lantern footprints near grid edges and the existing wall at z ≈ -7 must
be checked against both GLB and fallback, using the existing world layout
and kit helpers. Mark occupied cells #, walkable bamboo cover T; visual
props outside the grid are scenery. A minimal relocation or reuse of existing
prop geometry is acceptable to make terrain readable, not a new kit builder.
Ensure all cells marked obstacle/cover have a clear matching visual, especially
when the asset load falls back; no invisible blockers or walkable solid posts.
The authored grid (not world collision) is the sole movement authority. Prove
deterministic victory and defeat with real Lu AI before investing in HUD;
tune encounter content only, never the global damage or AI rules.

## One session owner

`simulation/state.ts` remains the sole game-state writer. The battle rules
module stays pure, synchronous and unchanged. Consumers use the public
`simulation/battle/index.ts` API: createBattle, applyBattleCommand,
getTurnOrder, getReachableCells, getMoveTargets, forecastMove and planBattleTurn.

Replace GameMode's duel with a battle variant containing a single session:
authoritative battle, shown presentation, pending BattleEvents, event elapsed
time, selection and nullable result. A small simulation helper may hold
the selection and presentation functions; only stepGame calls mutating session
logic. Keep `stepGame(state, input, dt, commands): void`, extending the
existing command union for HUD intents. `toHudSnapshot(state)` remains the
read path. No separate runtime playback owner, tagged AI commands, AI queue,
finalize command, or return protocol. The renderer reads presentation only.

- Enter after Lu's final dialogue at quest step 5; rename quest kind/event
  to battle/battleWon. Normal dialogue after quest completion cannot start
  another spar. Create fresh battle at full HP/qi with copied pill counts.
- Route battle before any village movement, dash, inventory, interaction or
  cooldown update. Village player pose/heading, quest and items remain frozen
  until explicit victory finalization. HUD command array is gated too; no
  direct bag, equip or use-item bypass. Pause freezes playback and AI.
- When an accepted command is reduced, retain pre-command presentation
  separately from the new authoritative state; never mutate a BattleState
  shared with either. Store its ordered event batch. Rejections leave battle
  and events unchanged; reuse item feedback for a short reason.
- Initialize `shown` from `createBattle(setup).state` with `pending = []`;
  initial round/turn are already reflected in state, so Round 1 is ready
  immediately. Apply the same initialization on Retry.
- Age battle-local effects and expire item feedback on every unpaused battle
  tick, including busy, idle hero/enemy and terminal result. Preserve the
  existing 0.65 s damage-number fade; pause freezes those timers too.
  While pending, advance the presentation timer without running commands. Discard all
  combat inputs during playback (including direct HUD commands), not buffer
  them. Fold after-values from events into shown: path interpolation for
  moved, strike/counter pose, healthAfter and applied damage number, fall,
  qiAfter, facingAfter, guard/item/turn/round state and terminal result.
  Presentation is a small view, not another mutable rules state. Do not
  show the next turn/terminal outcome or final HP early; reconcile shown to
  authoritative battle when drained. Reuse damage-number snapshot/component
  and simple model poses; no attack timing or hitstun rules. Keep a
  battle-local effect list so frozen village effects aren't changed; never
  leave the final damage number or rejection toast frozen on the result panel.
- When idle and enemy active, call planBattleTurn(battle, activeId, LU_PROFILE)
  and reduce **only its first command**. Replan at the next drained boundary.
  The merged planner supports already-moved and already-acted fighters; no
  stale endTurn after terminal/counter handoff. An empty or rejected plan in
  an ongoing enemy turn is an explicit error, surfaced once (no spin/skip).
  No AI planning on every frame while busy. Do not add caching without
  measurement; reviewer measured ~0.8 ms per plan on the proposed board.
- When idle and terminal with no result, finalize once inside stepGame.
  Result panel appears only after playback drains. Reduced motion may use
  short/zero durations, but all events still apply in order; pass the preference
  as presentation input, not a rule. Retry/return clears session and selection.

The runtime remains RAF → input → stepGame → render → publish → persist.
It retains only the last projection frame and translates pointer coordinates;
it has no turn, selection, AI or playback state. Mode changes clear stale
input; no command from the exploration/dialogue frame that enters battle is
reinterpreted as a combat command. Use existing idempotent disposal/error path.

## Items, victory and persistence

Replace lightAttackDamageBonus and qiBurstDamageBonus with powerBonus (+2
training sword, +4 tempered sword). Keep robe maxHealthBonus (+10/+20) and
item IDs, bag, quick-slot assignment, deterministic reward table/seed. Build
hero template with base power and maxHealth plus equipment bonuses. Do not
extend FighterTemplate or battle rules for maxQiBonus: starter accessory is
empty and the only reward occurs after the only battle (the default seed
produces Reinforced Training Robe). Keep the existing charm data but label
its battle qi effect as not yet active; actual battle maxQi derives solely
from internal art. Implement charm support when a later battle can use it.
No new inventory/progression system.

Use existing quick slots (1–3) as the Item action; step 3 already teaches
this binding. Slot selects an assigned pill and confirms a useItem command
on the hero; click the slot or press its key, with one common handler.
Counts/availability come from battle.squadBag and shown resources, not
the frozen persistent inventory. Shared pill IDs across slots use the
same count. Disable empty/full-resource/spent/enemy/busy slots. Reuse the
quick-slot portion of TechniqueBar or its existing markup; no new item
submenu. Village bag still permits equipment and quick-slot assignment.
Keep exploration `quick-slot-1..3` visible, with labels/counts and
`usable: false` as read-only loadout indicators for quest step 3; the
bag toggle and slot assignment controls remain usable. Remove village pill
activation entirely: delete `useConsumable`, `InventoryCommand.useItem`,
`handleQuickSlotUse`/`useInventoryItem`, runtime `useInventoryItem`, the page
handler and `bag-use-*` buttons, and their obsolete tests/types. Keep
`ITEM_CATALOG[id].consumable` because the battle reducer reads it. Narrow
slot assignment to a `BattlePillId` for a battle intent; no second resource
mutation path. Keep exploration vitals as an equipment preview, not a second
battle resource.

On victory after playback, reconcile the two battle pill counts into items,
including depleted counts and consistent slot normalization, then call
grantVictoryReward once and advance the quest once in the same stepGame
call. Existing persistProgressIfChanged saves items and quest together.
Store result/reward for the panel; Return restores original village pose,
heading, normal HUD and Lu at his post. No retry after victory. On defeat
do not commit pills/reward/quest; Retry builds fresh battle, or Return
allows talking to Lu again with no penalty. Test duplicate inputs and
repeated result ticks cannot grant extra rewards. Keep the existing
`cassiopeia.gameProgress.v2` save shape and key: stats are catalog data,
nothing battle-shaped is serialized. Reload before victory finalization
abandons the fight; reload after finalization resumes completed quest and
reward once. No migration or in-battle persistence.

## Selection and input

Put selection (cursor, chosen action/aim, facing, confirmation state) in the
session. A pure `selectBattle(selection, battle, intent)` returns updated
selection and optional engine command, called by stepGame. Both raw keyboard/
pointer input and existing HUD command array map to these same intents.
DOM controller emits only edge-triggered discrete keys and pointer CSS
coordinates; no phase/selection rules there. Runtime maps positions through
the last WuxiaProjectionFrame and supplies cells to stepGame. Existing village
movement, interaction and dash remain unchanged.

| Operation | Mouse | Keyboard |
| --- | --- | --- |
| Move | Hover jade cell for route/cost; click reachable cell | M; arrows/WASD; Enter |
| Moves | Choose move button, select aim, then Confirm | J/K/L choose basic/technique/finisher; arrows/WASD; Enter |
| Item | Click assigned quick slot | 1/2/3 |
| Guard / Gather | Click action | G / Q |
| Face / end turn | Automatically enter facing after action; choose facing, Confirm | E focuses facing; arrows/WASD; Enter |
| Result | Retry (defeat) / Return | R retries defeat; Enter returns |
| Cancel / pause | Cancel / pause button | Escape resumes, closes bag, cancels optional selection, or pauses (in that order) |

Optional move → required action → facing endTurn; acting consumes movement
opportunity. Guard/Gather can substitute for attack; no skip-action. Keyboard
grid axes N/E/S/W; label controls. Start cursor on hero and show same path/
forecast as hover; first attack target selection shows forecast, then explicit
confirmation (button/Enter or second click of same aim). New move/aim/actor
clears confirmation. For quick slot use, the explicit slot click/key is the
confirmation of the self-target action; it cannot repeat on held key.
Invalid actions must not change authoritative state. Use public queries and
forecast, plus reducer for validation; disable unaffordable/invalid choices.
Automatically enter facing when the living hero has acted, after pending
playback drains, if outcome is ongoing and the hero is still active; initialize
to current facing. Facing-only selection cannot be canceled or return to
an illegal move/action phase. E is optional, not a prerequisite for endTurn.
Reset cursor/selection at turn/phase/result changes.

Exact Escape precedence in stepGame: if paused, resume; else if bag open,
close bag; else if a cancellable battle selection exists, cancel it; else
pause. Facing and result cannot be canceled into an invalid phase. A HUD
pause/resume button is an explicit pause action, not selection cancel.
The global keyboard listener must not consume Enter/Space or battle hotkeys
from focused interactive elements (buttons, inputs, links, etc.) or modal
dialogs; let native activation and Bag focus trap work. Handle Escape and
existing Bag I/B close shortcuts explicitly without intercepting native
activation; suppress movement while modal/focused input owns keys. Pointer
activation of a BattleHud action button returns focus to scene-host so the
next Enter confirms once, while keyboard activation retains normal focus
semantics. Prevent default only for consumed gameplay keys and avoid HUD
click-through, held-key repeat and duplicate native/global submissions.
Test Bag, pause, fallback Retry and battle buttons, including Enter after
mouse move selection, focused keyboard activation and auto-facing.

## Rendering, projection and HUD

Keep one renderer/canvas/camera and existing GLB/fallback lifecycle. Reuse the
actual courtyard; in battle hide unrelated villagers, markers, village effects
and HUD, render the existing hero and Lu from shown positions/facing, and
add one battle-only grid/overlay group. On Return restore village transforms
and visibility. Allocate overlay resources once and dispose via the current
registry; no new asset loading or alternate scene ownership.

Draw thin grid lines, jade reachable tiles, gold path, hover outline/cost,
aim/affected/hit cells, fighter rings and facing triangles. All path and
target geometry comes from getReachableCells/getMoveTargets; terrain/cell
transform shared for drawing and picking. Use depth offsets and clear overlays
on selection/phase/actor/result changes. Add simple perimeter mist using
existing rendering primitives. No new art.

Keep the 45°/35° orthographic orientation and fixed battle view height
(start at 20 m, larger than village; tune once against HUD clearance).
Centre framing on the board as the baseline. The ticket explicitly asks to
follow the active fighter; cap the focus offset toward that fighter at 0.8 m
from board centre (or tighter if needed). At 18 m the front corner has only
~112 CSS px clearance before HUD, so prioritize visible and clickable cells
above the bottom HUD, not merely fitting the camera frustum. In the early
960 × 640 check and final HUD, verify cell (7,7) is not covered and can be
hovered/picked at the worst permitted northward focus; also check all board
edges and both fighter extremes at 1440 × 900. Prefer a compact HUD or small
fixed height increase over generic camera fitting. No free zoom/rotation. Use existing camera follow helper,
with actual rendered frame for all picking. If the required safe framing
needs a strictly centered view, note that deviation in the PR rather than
silently dropping the requirement.

Extend camera.ts with unprojectToGround next to projectWorldToScreen,
using its fixed basis and orthoFrustum. Use canvas CSS rect and the actual
last-rendered frame, not desired pose or backing pixels; ignore picks when
no battle frame has been rendered or the viewport dimensions differ from it
(one guard at mode/resize, no separate invalidation state). Ground pick
returns cell or null; clicking a fighter uses a simple projected hit proxy
for its current cell in target mode. Test unproject(project(p)) ≈ p for
all grid cell centres at 960 × 640 and 1440 × 900 (including bounded focus
if used) and an off-board point. No dedicated DPR test matrix.

Extend HudSnapshot with battle view. Reuse Vitals and rival status meter
for hero/Lu HP and qi (add Lu qi), DamageNumbers for event damage and
quick-slot UI. A small plain BattleHud.svelte adds round/active fighter,
phase, move buttons and cost, Guard, Gather, aim preview/forecast (damage,
counter, qi and outcome), facing and Retry/Return/reward. Legal options
derive from authoritative state in toHudSnapshot using existing queries;
presentation stats come from shown. Compute straightforward queries on
demand (no memoization requirement; reviewer measured ~0.03 ms for
reachability/three target queries). Do not query forecast for invalid aim.
Hide explore-only HUD in battle; preserve exploration, dialogue, bag, pause
and banner. No polished ink-and-paper battle layout, new fonts or icons.

## Cleanup and acceptance

Delete real-time attack timings, hitstun, chase, cooldowns, duel ring,
duel camera/inputs, `state.rival` and `CombatActionState` in the same
compiling slice as the GameMode switch. Delete obsolete combat.ts after
moving dash and shared movement helpers into world.ts. `villagerPosition`
uses authored data for Lu like other NPCs; no duel-only rival state. Replace
`applyFighter`'s combat-action dependency with a small presentation pose
union (idle/strike/guard/hit/defeated; interpolation driven by shown).
Outside battle, NPCs use idle poses and exploration player movement/dash
remains. Replace stale unit tests and real-time HUD/status labels including
strike/qiBurst in this slice. Update CLAUDE.md (AGENTS.md is its symlink).
Deliver in the same PR with green commits; coordinate cross-cutting type
changes with caller deletion rather than leave uncompilable intermediate
commits or compatibility aliases.

Use the companion plan for deterministic stepGame tests, two browser
journeys with reduced motion and real AI, existing CI, and browser MCP
end-to-end acceptance. Retain the existing CI save bridge across the long
step-4 shrine trek (steps 1–3 and 5 still use actual UI); reload verification
belongs to the keyboard victory journey, not a separate browser boot.
Preserve/update the existing all-five-step simulation journey, including
real shrine bell interaction, so the CI shortcut cannot mask quest regressions.
Record the shortcut explicitly; do not claim uninterrupted full browser play. Reuse browser/CI evidence rather than repeat the
whole suite through different tools. The user requires MCP E2E acceptance
and mockup visual parity; they are not optional. Compare a handful of
screenshots captured by browser MCP to the actual Linear attachment
**Battle HUD mockup 1: move step**: stone courtyard, perimeter kit and mist,
grid, jade range, gold route/hover and facing rings. Check the board at both
existing 960 × 640 and wide 1440 × 900 without a Cartesian matrix of states.
Two fighters, plain HUD and actual engine stats are intentional differences.
No human sign-off, new native platform or committed screenshot artifacts.
