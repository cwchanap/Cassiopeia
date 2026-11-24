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
- `index.ts`: the small public API used by future consumers and the scripted journey.
  Focused unit tests may import pure helpers directly from their owning modules.

Use integer `Cell = { x, z }` and cardinal facing N/E/S/W (N = z - 1, E = x + 1).
Do not reuse continuous-world coordinates, heading, cooldowns or legacy FighterState.
Use closed `ExternalArtId`, `InternalArtId` and `MoveId` string unions and typed
`Record` catalogs, following the existing ItemId/ITEM_CATALOG pattern. Art records refer to
typed move IDs; a move must still belong to the acting fighter's external art.
Authored content is trusted TypeScript, not an untyped input format.

A battle setup contains terrain as readable string rows (`.` ground, `#` obstacle,
`~` water, `T` bamboo), ordered fighter placements with unique IDs, hero ID and
starting squad pill counts. Row index is z, column index is x; derive width and height
from the rows, never accept independent dimensions or a flat terrain array. A single
typed terrain lookup maps characters to the four terrain types. Starter fighter templates
provide max health, power, agility and art IDs; the setup supplies cell and facing.
All fighters start alive at maximum health and derived maximum qi, without Guard.
Copy input to prevent aliasing. Bad authored setup is a programmer error: throw on empty
or ragged rows, unknown terrain character, nonpositive/noninteger stats, duplicate IDs,
missing squad hero/opponent or invalid/overlapping spawn cells. Do not add runtime art-ID
schema validation; closed IDs and typed records catch typos. A content test constructs
every authored fixture via createBattle. No map parser framework or catalog injection.

BattleState contains the map, fighters with current resources/cell/facing/guarding flag,
hero ID, squad bag, round number, ordered turn IDs and cursor, action/move-used flags and
outcome (ongoing, victory, defeat). Defeated fighters remain addressable for playback, but no
longer occupy cells or act. No Set/Map/classes/functions in persisted state or events;
temporary collections inside calculations are fine.

Public contract (names illustrative, semantics required):

- `createBattle(setup)` returns initial state and round/turn-start events; throws for invalid authored setup.
- `getTurnOrder(state)` returns living IDs for this round (including the active ID and marking
  already acted entries separately) and next round based on currently living fighters.
  A terminal state has no active/next turn. No speculative future deaths.
- `getReachableCells(state)` returns legal destinations, movement cost and deterministic paths
  for the active fighter (including its start at zero cost for previews/AI, not a move command).
- `getMoveTargets(state, moveId)` returns legal aim cells and affected cells/targets for that
  move from the current position. A move from a hypothetical position is previewed by applying
  a legal movement command to the original state and reading its accepted result. Queries
  and the reducer have no side effects.
- `applyBattleCommand(state, command)` returns a discriminated accepted result with next state
  and ordered events or rejection with a stable reason, unchanged input state and no events.
  All commands identify the acting fighter to reject stale/out-of-turn input.
- `forecastMove(state, actorId, moveId, aim)` returns the exact action resolution preview
  (or same rejection reason); no mutations, no time or randomness.

Commands: `move` to cell, `useMove` by move ID and aim cell, `useItem` by pill ID and
target ID, `guard`, `gatherQi`, and `endTurn` with required actorId and facing.
Two phases (before and after action), with a move-used flag:

1. Before action: zero or one movement command. The player may act without moving.
2. Exactly one action: a move, item, Guard or Gather qi.
3. After action: choose facing (including unchanged facing) in `endTurn { actorId, facing }`.
   This atomically applies the facing and advances the turn. No separate setFacing command,
   faced phase or facingChanged event. Reject ending before action, or moving/acting again.
   Terminal outcomes end immediately; no subsequent endTurn is required or accepted.

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

Damage is deterministic. Proposed starter tuning uses integer base damage, power and
integer percentage factors (100 is neutral). No fractional intermediates or intermediate
rounding.

- Determine front, side or rear relative to the defender's facing and attacker position,
  not attack direction or the attacker's facing. Compare absolute forward dot product with
  absolute lateral component: strictly dominant positive forward is front, negative rear;
  otherwise side (including diagonal ties). Facing percentages: front 100, side 125,
  rear 150.
- Bamboo cover: 75 when the attacker is more than one Manhattan step away; otherwise 100.
- Guard: 50 unless ignored by the move; otherwise 100. Iron Body: 80, otherwise 100.
- Export one pure `computeDamage` helper from rules.ts for direct unit tests. The regular
  attack factor is 100; a counter uses 50. Compute the integer numerator first and
  divide/floor exactly once: `Math.floor(base * power * facing * cover * guard * passive * attackPercent / (10 * 100 ** 5))`. Clamp successful damage to at least 1. Products
  for starter content and realistic power are well within the safe integer range.
  Test the independent exact results of base 12/power 14/side and base 14/power 16/
  bamboo/side (both 21, not 20), plus combined reductions and the counter factor.
- Actual HP loss is clamped to remaining HP; both calculated damage and actual loss are
  distinguishable in forecast/events. Never let HP or qi become negative or exceed max.

Guard lasts until the guarding fighter's next turn start. A surviving guarding defender
counters an adjacent attacker from front or side, never rear; Guard's damage reduction
still applies from rear. A move with ignoreGuard bypasses both reduction and counter.
Counter is a single-target basic strike using the defender's own basic base damage,
attackPercent 50 in computeDamage, its power and normal defender mitigation/facing;
no qi cost, no turn/action consumed,
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
living adjacent squad ally. Read the existing consumable effects directly from
`ITEM_CATALOG` in `../items.ts` (pure TypeScript; its combat.ts dependency contains pure
constants/helpers). No extraction or change to the village item module. Use a closed
`BattlePillId` union of lesser_healing_pill and lesser_qi_pill and a
`Partial<Record<BattlePillId, number>>` bag. Battle owns a copy of pill counts; do not
call the mutating useConsumable helper or change ItemProgress, equipment, reward seed or save. Reject missing pills, enemy/defeated/distant targets and full target resource
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

Internal art record fields: maxQi, qiRegen, gatherBonus, damageTakenPercent and
moveBonus; neutral defaults where not used (damageTakenPercent 100). Sect Breathing
Method: max 100, regen 10, gather bonus 10. Iron Body: max 70, regen 8, damageTakenPercent 80.
Flowing Cloud Steps: max 90, regen 10, move bonus 1.
Use art IDs for lookup only; no art-name branches in rule code. Adding an art that combines
existing fields and shapes requires only extending the typed IDs and content records.

Include a starter hero template (100 HP, power 10, agility 20, sword/breathing) and Lu
opponent (100 HP, power 9, agility 10, sword/breathing), plus small deterministic test
fixtures spanning all arts/terrain. These are headless data, not the final HPA-1315 map,
encounter, or character stats. Use a 12 x 12 fixture for the scripted battle; use small
rectangular fixtures for grid unit tests. No separate large-map test or encounter editor/map art.

## Events and exact forecast

Return plain ordered events with stable IDs/cells and before/after values sufficient for
future playback, never references to mutable fighter objects. At minimum: roundStarted
(order), turnStarted (actor, regeneration), moved (full path), attacked (move, actor,
aim, cells, qi before/after), damaged (source/target, calculated and actual damage,
facing, mitigation, HP before/after), guarded, qiGathered, itemUsed (resource delta,
bag count), countered, defeated, turnEnded (actor, facing before/after) and battleEnded (outcome).
On initialization, roundStarted precedes turnStarted. On transition, turnEnded precedes
any roundStarted and next turnStarted. For attack, attacked precedes damaged/defeated;
countered precedes its damage/defeat. Battle-ended is last. No events for failed commands.

Forecast must be a projection of the same validated action resolution used by
applyBattleCommand, not an independent formula. Call the non-mutating reducer directly
with useMove; derive a forecast from the result/events (per-hit facing percentage,
cover/Guard/passive percentages,
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
event ordering and final resources. Replay this one journey twice with a JSON round trip.
A focused combat unit test covers hero defeat with a living companion.
Run the journey through the coding agent's execution MCP and retain test output.
The full check, lint and test commands (test includes unit and Playwright) remain green.
No live UI files change and HPA-1310 has no mockup, so retain only a lightweight
browser MCP screenshot check of the existing village HUD after implementation,
reusing the existing browser smoke flow where possible. No paired before/after
replay, new screenshot baseline or separate spar screenshot gate is needed.
Record evidence in the same PR; no human acceptance gate.
