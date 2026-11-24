# HPA-1310 — Turn-Based Battle Rules Engine (Implementation Plan)

**Design:** [Battle rules design](../specs/2026-11-23-hpa-1310-battle-rules-engine.md)  
**Linear:** [HPA-1310](https://linear.app/cwchanap/issue/HPA-1310/battle-rules-engine-for-turn-based-combat)  
**Base:** main at `10dfbe788cbeafdced2b6b5523774682a9159e00`.  
**Delivery:** One PR, initially draft. Add implementation and test commits to this same PR.
Do not open a separate coding PR.  
**Status:** Planning only.

## Working approach

Read the design and repository CLAUDE.md/AGENTS.md. Preserve the SvelteKit + Three.js
architecture. Existing `simulation/state.ts`, `types.ts`, `combat.ts`,
`runtime/save.ts`, route, HUD and renderer stay untouched. At most, share the two pill
effect records with `items.ts` as a behavior-neutral extraction. No new dependency,
save migration, integration flag, visual system, AI, generated art or SFX. HPA-1311
adds AI and HPA-1315 wires the engine into gameplay after this PR.

Work test-first in the five slices below. Each slice must leave the existing game
working, use strict TypeScript and tests in the existing Vitest Node/server project.
Use meaningful typed commands and fixtures; do not invent generic plugin abstractions.
Review the current main again before implementation and adjust the file map if needed.

## Slice 1 — Data, public contracts and grid

Files: `simulation/battle/types.ts`, `content.ts`, `grid.ts`, `index.ts`,
`grid.spec.ts`, and a local test fixture helper if needed (all relative to
`src/lib/game/`).

- Define serializable setup/state types, terrain, cardinal directions, stable IDs,
  art/move/passive records, command/result/event union and forecast shape.
- Author the four external arts (three moves each), three internal arts and starter
  fighter templates with the design's baseline values. Validate catalog invariants
  in tests (unique IDs, valid shapes, free/technique/finisher qi ordering, positive stats).
- Implement terrain lookup, cell distance, weighted reachability and path reconstruction.
  Use stable neighbor/tie ordering; omit living occupied cells other than start.
- Implement single/line/arc targeting and ray blocking independently of action effects.
  Reuse these helpers for later legal-target queries; no UI grid implementation.
- Test 12 x 12 and 16 x 16 grids, out-of-bounds, exact budget, ground cost, bamboo
  extra cost, water/obstacle blocking, both-side occupied cells, cheaper detour over
  thicket, dead fighters not blocking, deterministic equal-cost paths, every area
  shape at edges, line stopping at obstacles, water/occupied cells not blocking rays,
  arc clipping, enemy filtering and empty-center area targeting.
- Run focused Node tests, then check/lint.

## Slice 2 — Battle lifecycle and command phases

Files: `simulation/battle/rules.ts`, `index.ts`, `turns.spec.ts`,
`commands.spec.ts` (extend as necessary).

- Implement construction/validation from copied setup and initial round/turn events.
- Implement stable initiative snapshot, current/next round query, dead-ID skipping,
  regeneration and Guard expiry at the active fighter's next turn.
- Implement move command with path event, Guard, Gather qi, setFacing, endTurn;
  require exactly one action then explicit facing, no second move or action.
- Centralize command actor/phase/terminal validation. Invalid input returns reason,
  unchanged state and zero events. Accepted results return new state with no input
  mutation; events own their value snapshots. Keep turn state in one place.
- Tests: full health/qi on create; wrong actor; invalid setup; agility ties (both
  sides and within side); current/next order; multiple rounds; dead IDs; regeneration
  cap; guard persistence/expiry; gather bonus/cap; skip movement; move once; reject
  movement after action, facing before action, end without facing and duplicate
  action; unchanged facing allowed; JSON round-trip and referential isolation.
- Run focused tests, check/lint and existing unit suite.

## Slice 3 — Arts, deterministic attacks and counters

Files: `simulation/battle/rules.ts`, `content.ts`, `attacks.spec.ts`.

- Resolve legal move ownership, geometry, living hostile targets and qi before mutation.
  Expose legal aim cells and affected cells for AI/HUD use. An area command spends qi once.
- Implement one damage calculation with power, front/side/rear, cover, Guard, passive
  reduction and final integer rounding/clamping. Include all affected targets in order.
- Implement the 12 starter moves from data; implement Guard counter eligibility,
  single-target free counter and ignoreGuard behavior. No per-art switch or recursive
  counter. Guarded actor's basic art identity should not affect counter geometry.
- Implement shared outcome check: hero death first, otherwise no living enemies.
  Stop on terminal, skip dead defenders and stop counters if attacker dies.
- Assert attacked/damaged/defeated/countered/battleEnded sequence and snapshots.
- Tests: side/rear incl. diagonal ties, all facings, non-adjacent bamboo cover vs
  adjacency, combined Guard and Iron Body, qi cost/rejection, exact zero HP,
  friendly/dead exclusion, thrust multi-hit, arc empty-center hit, darts blocking,
  guard front/side adjacent counter, rear/distant no counter, dead defender no counter,
  ignoreGuard bypass, no counter chains, counter kill, hero falls with allies alive,
  and terminal outcomes cannot accept further commands. Add a test-only art definition
  using existing data fields to verify no new rule branch is required.
- Run focused tests, check/lint and existing unit suite.

## Slice 4 — Shared bag, exact forecasts and public API

Files: `simulation/battle/rules.ts`, `index.ts`, `items.spec.ts`,
`forecast.spec.ts`; optionally `simulation/consumables.ts` and existing
`simulation/items.ts` for the shared 35-point effect records.

- Reuse existing pill IDs/effects without importing legacy real-time stats, or duplicating
  the item amounts. Give battle its own copied squad counts. Do not change ItemProgress,
  item save shape, equipment/quick slots, reward or existing village item behavior.
- Test self/adjacent ally, full-resource rejection, cap, absent/depleted pill, enemy or
  defeated/distant targets, non-squad actor rejection, no original bag mutation,
  one action/one count per accepted use and resource/event deltas.
- Implement forecast by applying the same action resolution to copied state and
  projecting its events/result. Return each affected fighter's damage/facing/HP,
  actor qi cost/remaining qi and counter order with actor HP and outcome.
- Table-test forecast vs actual for every move and facing, all terrain/mitigations,
  multi-target areas with a guarded counter, lethal hit, counter kill, and all
  rejection cases (invalid aim, ownership, phase, qi, actor, terminal). Compare event
  order, every target's final HP, actor's final HP/qi, deaths/outcome, no state/input
  mutation. Assert repeated previews and replay from JSON round trip are identical.
- Export the minimum documented APIs via index.ts. Test all public helpers without
  DOM/Three/Svelte or timing dependencies; ensure HPA-1311 can query each reachable
  state by applying a move to a copy and then forecasting attacks. No AI scoring code.
- Run focused tests, check/lint and existing unit suite.

## Slice 5 — Headless E2E, regression and docs

Files: `simulation/battle/battle.e2e.spec.ts` (Vitest Node, not the route Playwright
test suffix), optional fixture data; `CLAUDE.md` and `AGENTS.md` only to document the
new isolated module and its public APIs/commands, while leaving the current runtime
description accurate. Keep both instruction files in sync.

- Script a complete 12 x 12 authored battle using only public construction, queries,
  forecast and commands. Use the starter hero and Lu, plus one squad ally for the
  shared-bag case if needed. Use deterministic, explicitly written opposing turns,
  not new AI. Cover weighted movement, one action, facing and end turn, qi spend/
  regeneration, Guard/counter, Gather and item use; include at least two rounds.
  Assert the forecast's full consequences match the actual events and final HP/qi,
  bag counts, positions, next order and victory. Assert a rejected command changes
  nothing and a terminal command is rejected.
- A second complete fixture reaches hero defeat while a companion stands; prove
  immediate terminal outcome, no later turn/counter, and no mutation after defeat.
  Replay both scripts twice and compare state/events deep-equal, including a
  JSON round trip between commands. Bound scripted turn count; no infinite test loops.
- Run the full automated checks and browser regression below. Document the engine's
  existence, pure boundary and explicit handoff to HPA-1311/HPA-1315.
  Do not modify live GameMode, stepGame, HUD, save or renderer to expose the new engine.

## End-to-end acceptance checklist

All gates are for the eventual implementation, not this planning commit. No manual/human
approval gate. Use the coding agent's available execution MCP for headless E2E commands
and browser-capable MCP (e.g. Playwright) for the browser regression; record command output
and screenshot evidence in this same PR. One Chromium desktop environment is sufficient;
no additional OS/device matrix.

- [ ] All four terrains, four external arts, three internal arts, turn/facing phases,
  Guard/counters, Gather, shared pills, qi regeneration and outcomes are implemented
  according to the design. The unit test cases in slices 1–4 cover both legal and
  rejected commands and deterministic event order.
- [ ] Public API scripted victory and hero-defeat journeys pass in the existing
  Vitest server project with no renderer, no production integration, no AI and no
  new runtime dependency. Capture output via execution MCP. Forecast, outcomes,
  resources, turn order, event sequence and deterministic replay are asserted end-to-end.
- [ ] `bun run check`, `bun run lint`, `bun run test:unit -- --run` and
  `bun run test` pass. The explicit --run makes the unit gate noninteractive.
  Use the repository-pinned Bun and existing Playwright/CI setup; no new workflows.
- [ ] Existing browser E2E tests for first-day quest, real-time duel and inventory/save
  pass unchanged. With browser MCP, run the current village to Lu spar flow before
  and after the implementation at the same 960 x 640 viewport, same quest progress,
  character/camera position and stable HUD state. Capture exploration and duel
  screenshots (settle animation, compare structural layout, not animated pixels).
  HPA-1310 has no mockup and changes no UI: verify the old ink-and-paper HUD, camera,
  controls and duel remain visually/behaviorally unchanged, not parity with future
  battle mockups. Attach comparable screenshots and results to PR or CI artifact;
  do not commit bulky screenshots.
- [ ] Review changed paths/imports: no Three.js/DOM/Svelte imports in battle; no
  new live game path, AI, art, audio, save changes or real-time combat deletion.
  Data and events are JSON-serializable, input remains unchanged on forecast/rejection,
  and consumers can use public functions without copying any combat rules.
- [ ] One PR for HPA-1310 contains design, plan, implementation and evidence.
  HPA-1311 and HPA-1315 remain separate dependent tickets.
