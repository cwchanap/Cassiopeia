# HPA-1310 — Turn-Based Battle Rules Engine (Design Specification)

**Linear:** [HPA-1310](https://linear.app/cwchanap/issue/HPA-1310/battle-rules-engine-for-turn-based-combat)  
**Base:** main at `10dfbe788cbeafdced2b6b5523774682a9159e00` (existing village quest, real-time duel and ink-and-paper HUD).  
**Delivery:** One draft PR for the specification, plan and eventual implementation.  
**Status:** Proposed design; no code or acceptance result is claimed.

## Goal and boundaries

Implement a deterministic, headless square-grid battle engine for a squad of martial artists.
HPA-1311 (enemy AI) and HPA-1315 (playable spar) consume its public API.
HPA-1310 deliberately does not wire it into the current game.

The repository currently has a pure TypeScript simulation with `stepGame` as the only game-state
mutator, a real-time `FighterState` and `combat.ts`, and `InventoryCommand` in
`simulation/types.ts`. Keep all of these behaviorally unchanged. The new module has its own
battle-local types, not a second live game runtime. HPA-1315 will replace the duel and call the
battle reducer from stepGame. No renderer, HUD, GameMode, input, save, camera, quest, equipment
mapping, AI, levels, status effects, mastery, new art, SFX, height or knockback in this PR.
No new dependencies or generic ECS, event bus, effects DSL or pathfinding package.

## Module and API

Under `src/lib/game/simulation/battle/`:

- `types.ts`: plain-data cells, terrain, definitions, fighters, battle setup/state, discriminated
  command/result/event types and forecast DTO.
- `content.ts`: authored external/internal arts, starter hero and opponent templates and a small
  fixture map. These are data records, not class instances or rule callbacks.
- `grid.ts`: bounds, terrain lookup, Manhattan distance, weighted reachability, paths and
  target geometry. Keep rule-independent math here.
- `rules.ts`: construction, turn lifecycle, action validation, damage, counters, outcomes,
  item use, command application and forecast. Split only if a cohesive responsibility warrants it.
- `index.ts`: public exports; tests import the same public entry point future consumers use.

Use integer `Cell = { x, z }` and cardinal facing N/E/S/W (N = z - 1, E = x + 1).
Do not reuse continuous-world coordinates, heading, cooldowns or legacy FighterState.
A battle setup contains width/height, row-major terrain, ordered fighter placements with unique
IDs, hero ID, and starting squad pill counts. Starter fighter templates provide max health,
power, agility, external/internal art IDs; the setup supplies each cell and facing. Derived max
qi, movement and regeneration come from the internal art and stats. All fighters start alive,
at maximum health and qi, without Guard. Copy the input to prevent aliasing. Validate positive
integer stats, valid art IDs, one squad hero, at least one opponent, correct terrain length,
unique IDs and distinct standable in-bounds cells at setup; reject invalid authored fixtures
rather than silently repair them.

BattleState contains the map, fighters with current resources/cell/facing/guarding flag,
hero ID, squad bag, round number, ordered turn IDs and cursor, turn phase/move-used flag and
outcome (ongoing, victory, defeat). Defeated fighters remain addressable for playback, but no
longer occupy cells or act. No Set/Map/classes/functions in persisted state or events;
temporary collections inside calculations are fine.

Public contract (names illustrative, semantics required):

- `createBattle(setup)` returns initial state and round/turn-start events.
- `getTurnOrder(state)` returns living IDs for this round (including the active ID and marking
  already acted entries separately) and next round based on currently living fighters.
  A terminal state has no active/next turn. No speculative future deaths.
- `getReachableCells(state)` returns legal destinations, movement cost and deterministic paths
  for the active fighter (including its start at zero cost for previews/AI, not a move command).
- `getMoveTargets(state, moveId)` returns legal aim cells and affected cells/targets for that
  move from the current position. A move from a hypothetical position is previewed by applying
  a legal movement command to a copy of state. Queries have no side effects.
- `applyBattleCommand(state, command)` returns a discriminated accepted result with next state
  and ordered events or rejection with a stable reason, unchanged input state and no events.
  All commands identify the acting fighter to reject stale/out-of-turn input.
- `forecastMove(state, actorId, moveId, aim)` returns the exact action resolution preview
  (or same rejection reason); no mutations, no time or randomness.

Commands: move to cell, use move by move ID and aim cell, use item by pill ID and target ID,
guard, gather qi, set facing, end turn. Explicit phase sequence:

1. Before action: zero or one movement command. The player may act without moving.
2. Exactly one action: a move, item, Guard or Gather qi. A movement or a facing command
   cannot be used as the action.
3. Pick facing (including unchanged facing), then end turn. No action or movement after the
   action. No turn advance before facing is selected. Terminal outcomes end immediately;
   no subsequent facing/end command is required or accepted.

A successful command is atomic and does not mutate its input; implement a simple copied state
and shared helpers, not a state-management framework. Only the returned state becomes authoritative.
Rejections (wrong actor, wrong phase, occupied/unreachable cell, invalid aim, insufficient qi,
invalid item/target, terminal state) never change resources, phase, events or order.
Use a straightforward typed reason union, not exceptions for expected input errors.

## Grid and targeting

Movement uses four-neighbor weighted shortest paths. Ground costs 1; bamboo thicket costs 2 to
enter; obstacle and water are impassable. Living fighters of either side block passage and
destination, except the active fighter's starting cell. Dijkstra with a small deterministic
frontier is adequate for 12 x 12 to 16 x 16 maps. Fixed neighbor order N, E, S, W; stable
insertion order for equal-cost paths; no diagonal movement or corner cutting.
Budget = 2 + floor(agility / 10) + internal-art movement bonus. A move uses a complete
reachable path once, including its destination; moving to the same cell is not a command.

Attack range uses Manhattan distance (no diagonal single-target adjacency). The three
shape primitives are data-driven:

- **Single:** one chosen cell; adjacent attacks have range 1. Ranged darts choose a cardinal
  ray cell within the move's maximum distance; obstacles between origin and aim or at aim
  block it. Water and occupied cells do not block rays.
- **Line:** choose a cardinal direction via the adjacent aim cell; trace the authored length
  starting one cell from the actor. Stop before an obstacle or map edge. Sword thrust hits
  enemies in both reachable cells, not just the first. The ray passes through water.
- **Arc:** choose the adjacent cardinal aim cell; the pattern is that cell and its two lateral
  neighbors (three cells across the front of the actor). The aim is range 1, with lateral
  cells Manhattan distance 2 as part of the area. Clip out-of-bounds and obstacle cells;
  this is not a straight-line ray. No independent diagonal line-of-sight calculation.

Aim is a cell, not a mandatory fighter ID, so an arc or thrust can hit enemies even if its
anchor is empty. A legal attack must affect at least one living enemy; no friendly fire,
self-hit or wasted qi on empty attacks. A blocked/out-of-bounds aim is invalid. In all cases
use the same grid helper for target enumeration, forecast and actual resolution. Stable
pattern order (line near to far; arc center then left then right) determines target/event order.

## Combat and rounds

At round start sort all living fighters by descending agility, squad before enemy on a tie,
then original setup order within a side. A round uses that snapshot; defeated IDs are
skipped, never inserted or re-sorted mid-round. Recompute at the next round. Starting a
fighter's turn clears its own prior Guard, resets movement/action phase, regenerates its
internal art's qi amount up to maximum and emits turn-start data including any qi change.
The first turn also regenerates, capped at the initially full pool.

Damage is deterministic. Proposed starter tuning (all integers unless a multiplier):

- Base = move base damage x attacker power / 10.
- Determine front, side or rear relative to the defender's facing and attacker position,
  not attack direction or the attacker's facing. Compare absolute forward dot product with
  absolute lateral component: strictly dominant positive forward is front, negative rear;
  otherwise side (including diagonal ties). Multipliers: front 1, side 1.25, rear 1.5.
- Defender in bamboo takes 0.75x from attacks originating at Manhattan distance greater
  than 1; adjacent attacks ignore cover.
- Guard multiplies damage by 0.5 unless a move ignores Guard. Iron Body multiplies incoming
  damage by 0.8. Apply all factors together and floor once, minimum 1 for a successful hit.
  Actual HP loss is clamped to remaining HP; both calculated damage and actual loss are
  distinguishable in forecast/events. Never let HP or qi become negative or exceed max.

Guard lasts until the guarding fighter's next turn start. A surviving guarding defender
counters an adjacent attacker from front or side, never rear; Guard's damage reduction
still applies from rear. A move with ignoreGuard bypasses both reduction and counter.
Counter is a single-target basic strike at 0.5x the defender's own basic base damage
with its power and normal defender mitigation/facing; no qi cost, no turn/action consumed,
no repositioning, no area splash and no counter to a counter.

Use a single resolution path: debit qi once; emit attacked with ordered affected cells;
apply all primary hits and defeats in pattern order; evaluate terminal outcome; if still
ongoing, process each eligible living defender's counter in the same order, stopping when
the attacker dies or battle ends. Check outcome after every counter. Dead defenders cannot
counter; no counter after a terminal primary result. Hero defeat takes precedence over
victory if both conditions hold. Otherwise victory means no living enemies; loss means
hero HP zero even if squad allies remain. Emit battle-ended once, and freeze state.
No round/turn start events after terminal outcome.

Gather qi restores a fixed 20 qi plus the internal art's gather bonus, capped at max.
Gather/Guard are legal actions even if qi is full. Items are squad-only shared bag actions:
the acting squad fighter uses a Lesser Healing Pill or Lesser Qi Pill on itself or a
living adjacent squad ally. Reuse the existing 35 HP/35 qi effects and IDs from
`simulation/items.ts`; extract just these two immutable effect definitions into a small
pure `simulation/consumables.ts` shared by the existing item catalog and battle content
if needed to avoid importing real-time combat transitively. Preserve old item behavior and
tests. Battle owns a copy of pill counts; no ItemProgress, equipment, reward seed or save
mutation. Reject missing pills, enemy/defeated/distant targets and full target resource
without spending the action or pill. Consume exactly one and clamp restoration on success.
Enemy item use is not allowed (no enemy bag in this ticket).

## Starter content

Proposed baseline values for tuning, not permanent balance. Each external art has exactly
three data-defined moves, one free, one technique and one finisher. Values below are
base damage / qi cost / geometry; power 10 means baseline damage before mitigation.

- Sect Sword Form: Sword Cut 12/0/single adjacent; Piercing Thrust 17/25/line length 2;
  Cloud Sweep 24/45/arc 3.
- Stone Palm: Palm Strike 15/0/single adjacent; Mountain Palm 23/25/single adjacent;
  Stone Breaker 36/45/single adjacent, ignoreGuard.
- Monk Staff: Staff Sweep 9/0/arc 3; Crossing Staff 14/25/arc 3;
  Whirling Staff 21/45/arc 3.
- Willow Darts: Dart Toss 7/0/single cardinal range 3; Twin Darts 12/20/single cardinal
  range 4; Falling Willow 20/40/single cardinal range 4.

Internal art record fields: maxQi, qiRegen, gatherBonus, damageTakenMultiplier and
moveBonus; neutral defaults where not used. Sect Breathing Method: max 100, regen 10,
gather bonus 10. Iron Body: max 70, regen 8, damage taken multiplier 0.8.
Flowing Cloud Steps: max 90, regen 10, move bonus 1.
Use art IDs for lookup only; no art-name branches in rule code. Adding an art that combines
existing fields and shapes must only require a data edit.

Include a starter hero template (100 HP, power 10, agility 20, sword/breathing) and Lu
opponent (100 HP, power 9, agility 10, sword/breathing), plus small deterministic test
fixtures spanning all arts/terrain. These are headless data, not the final HPA-1315 map,
encounter, or character stats. Use a 12 x 12 fixture for the scripted battle; exercise
16 x 16 as well. No encounter editor or map art.

## Events and exact forecast

Return plain ordered events with stable IDs/cells and before/after values sufficient for
future playback, never references to mutable fighter objects. At minimum: roundStarted
(order), turnStarted (actor, regeneration), moved (full path), attacked (move, actor,
aim, cells, qi before/after), damaged (source/target, calculated and actual damage,
facing, mitigation, HP before/after), guarded, qiGathered, itemUsed (resource delta,
bag count), countered, defeated, facingChanged, turnEnded and battleEnded (outcome).
On initialization, roundStarted precedes turnStarted. On transition, turnEnded precedes
any roundStarted and next turnStarted. For attack, attacked precedes damaged/defeated;
countered precedes its damage/defeat. Battle-ended is last. No events for failed commands.

Forecast must be a projection of the same validated action resolution used by
applyBattleCommand, not an independent formula. Run the resolver on a copy, derive a
forecast from the result/events (per-hit facing modifier, cover/Guard/passive modifiers,
HP before/after, actual damage, qi cost and actor qi after, ordered counter damage and
actor HP after, possible defeat/outcome). Compare all affected fighters and the actor;
do not merely compare the first target's damage. No hidden RNG, Math.random, wall clock,
renderer imports or event playback timers. Repeated forecasts and commands from the
same input produce deep-equal outputs. Returned events must not change if a later
command changes state. JSON round trip of state must preserve legal queries and results.

## Acceptance

See the companion plan for explicit test cases. The headless public-API journey is the
feature's E2E gate (not a private-helper-only test): construct an authored battle, move,
attack, observe opposing turns, item/Qi/Guard and facing, finish at victory, assert
event ordering and final resources. A second journey reaches hero defeat with a living
companion. Run via the coding agent's execution MCP with test evidence.
All existing check, lint, unit and browser E2E tests remain green. As no UI changes or
HPA-1310 mockups exist, use browser-capable MCP to capture before/after screenshots
of the same existing village HUD and real-time spar state, verifying no visual or
interaction regression; no new tactical HUD or mockup parity expected yet. Attach
evidence to the same PR, not a human acceptance gate.
