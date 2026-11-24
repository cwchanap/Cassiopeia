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
`runtime/save.ts`, route, HUD, renderer and `items.ts` stay untouched. Read the two
pill effects from the existing pure ITEM_CATALOG. No new dependency,
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

- Define serializable setup/state types, terrain, cardinal directions, closed
  ExternalArtId/InternalArtId/MoveId unions and typed Record catalogs, command/result/event
  union and forecast shape. Derive BattlePillId from ItemId via Extract, use named
  basic/technique/finisher move slots and a single/line/arc discriminated targeting union.
- Author the four external arts (three moves each), three internal arts and starter
  fighter templates with the design's baseline values. Use string rows with
  `.`, `#`, `~`, `T` for terrain; derive width/height rather than accepting either.
  Test catalog invariants (unique move ownership, shapes, free/technique/finisher qi
  ordering, positive stats); no injectable test catalog.
- Implement terrain lookup, cell distance, weighted reachability and path reconstruction.
  Use stable neighbor/tie ordering; omit other living occupied cells. Paths include
  both origin and destination; the zero-cost start has a one-cell path.
- Implement single/line/arc targeting and ray blocking independently of action effects.
  Reuse these helpers for later legal-target queries; no UI grid implementation.
- Test small rectangular grids, out-of-bounds, exact budget, ground cost, bamboo
  extra cost, water/obstacle blocking, both-side occupied cells, cheaper detour over
  thicket, dead fighters not blocking, deterministic equal-cost paths, every area
  shape at edges, line stopping at obstacles, water/occupied cells not blocking rays,
  arc clipping, enemy filtering and empty-center area targeting.
- Run focused Node tests, then check/lint.

## Slice 2 — Battle lifecycle and command phases

Files: `simulation/battle/rules.ts`, `index.ts`, `turns.spec.ts`,
`commands.spec.ts` (extend as necessary).

- Implement construction from copied setup and initial round/turn events. Bad authored
  fixtures throw (empty/ragged/unknown terrain, invalid spawns, duplicate IDs or missing
  hero/opponent, invalid stats, negative or noninteger starting pill counts); zero
  or omitted counts mean none. No runtime art-ID schema. One content test constructs
  every authored fixture via createBattle.
- Implement stable initiative snapshot, current/next round query, dead-ID skipping,
  regeneration and Guard expiry at the active fighter's next turn.
- Implement move command with path event, Guard, Gather qi and endTurn with required
  facing. Two phases, before/after action, plus a move-used flag. EndTurn sets facing
  and advances atomically, recording old/new facing on turnEnded.
- Centralize command actor/phase/terminal validation. Invalid input returns reason,
  unchanged state and zero events. Accepted results return new state with no input
  mutation; events own their value snapshots. Keep turn state in one place.
- Tests: full health/qi on create; wrong actor; invalid setup; agility ties (both
  sides and within side); current/next order; multiple rounds; dead IDs; regeneration
  cap; guard persistence/expiry; gather bonus/cap; skip movement; move once; reject
  movement after action, end before action and duplicate action; assert endTurn
  applies the selected facing and advances once, including unchanged facing;
  JSON round-trip and referential isolation.
- Implement getReachableCells(state, fighterId?): default to active legal movement
  (empty after movement/action); explicit living ID uses its full current-cell
  budget regardless of phase/turn. Both modes return [] for terminal or dead/unknown
  fighter. Verify a non-active fighter's own budget, path and occupied-cell blocking,
  including enemy-occupied candidate cells; no input mutation.
- Run focused tests, check/lint and existing unit suite.

## Slice 3 — Arts, deterministic attacks and counters

Files: `simulation/battle/rules.ts`, `content.ts`, `attacks.spec.ts`, `damage.spec.ts`.

- Resolve legal move ownership, geometry, living hostile targets and qi before mutation.
  Expose legal aim cells and affected cells for AI/HUD use. getMoveTargets returns
  [] in terminal/afterAction states, without a living active fighter, for an unowned
  move or insufficient qi. Use the same validator for enumeration and commands;
  each returned aim must be accepted by useMove on the unchanged state. Test legal
  aims after optional movement and each empty-result case. An area spends qi once.
- Export one pure computeDamage helper from rules.ts and use it for every hit and counter.
  Multiply integer base, power and percentage factors (100 neutral) before one final
  division/floor; use the design's denominator and minimum-one clamp. Unit-test this
  helper directly with independent hand-calculated expected values, including both
  known 21-not-20 rounding cases, facing/cover/Guard/Iron Body combinations and the 50%
  counter factor. Apply clamping to actual HP loss and process targets in order.
- Implement the 12 starter moves from data; implement Guard counter eligibility,
  single-target free counter and ignoreGuard behavior. Use the guarding fighter's
  designated basic move, attackPercent 50 and effective front facing (100) on
  every counter, including if the original attacker faces away; retain its Iron
  Body/other normal mitigation. Never mutate facing in the attack resolver.
  No per-art switch, counter recursion or splash.
- Implement shared outcome check: hero death first, otherwise no living enemies.
  Stop on terminal, skip dead defenders and stop counters if attacker dies.
  If the active fighter dies to a counter and the battle is ongoing, use the
  normal turn-transition helper to auto-end its turn with unchanged facing and
  advance to the next living fighter; reset phase/move-used and apply the normal
  next-turn regeneration/Guard expiry. Terminal death ends the battle instead.
- Assert ordered attack/damage/defeat/counter events; verify auto-end emits
  countered, damaged, defeated, turnEnded, optional roundStarted, turnStarted
  in that order. Terminal battleEnded is last, with no auto-advance.
- Tests: side/rear incl. diagonal ties, all facings, non-adjacent bamboo cover vs
  adjacency, combined Guard and Iron Body, qi cost/rejection, exact zero HP,
  friendly/dead exclusion, thrust multi-hit, arc empty-center hit, darts blocking,
  guard front/side adjacent counter, rear/distant no counter, dead defender no counter,
  ignoreGuard bypass, no counter chains, counter damage unchanged by the attacker's
  stored facing (including Iron Body), counter-kill of a companion and a non-last
  enemy while ongoing (including round wrap and dead-ID skipping), hero falls with
  allies alive, and terminal outcomes cannot accept further commands. Exercise all 12 starter moves
  via the data-driven path; do not inject a custom catalog.
- Run focused tests, check/lint and existing unit suite.

## Slice 4 — Shared bag, exact forecasts and public API

Files: `simulation/battle/rules.ts`, `index.ts`, `items.spec.ts`,
`forecast.spec.ts`.

- Read the existing two consumable definitions from `ITEM_CATALOG` in ../items.ts.
  Its transitive combat.ts import is pure TypeScript; no reason to refactor it.
  Use Partial<Record<BattlePillId, number>> for the copied battle bag. Do not call
  useConsumable, extract consumables.ts, duplicate amounts or change ItemProgress,
  save shape, equipment/quick slots, rewards or existing village item behavior.
- Test self/adjacent ally, full-resource rejection, cap, absent/depleted pill, enemy or
  defeated/distant targets, non-squad actor rejection, no original bag mutation,
  one action/one count per accepted use and resource/event deltas.
- Implement forecast by calling the non-mutating reducer directly with useMove and
  projecting its events/result (no additional copy or formula). Return each affected
  fighter's damage/facing/HP, actor qi cost/remaining qi and counter order with actor
  HP and outcome, plus resulting active fighter ID/round. Actor resource deltas
  belong to the original actor even if the command auto-advances the turn.
- Focus projection tests on a single hit, multi-target area with guarded counter,
  lethal primary hit and lethal counter (terminal hero defeat and non-terminal
  companion death with actor HP 0 and next living actor). Assert each projected
  field, counter order and resulting turn against the applied result; one representative rejected
  forecast matches the command's reason, with no mutation on either path. Assert
  repeated forecasts do not change their input. Keep comprehensive numeric coverage
  on computeDamage in slice 3 rather than testing the same resolver against itself.
- Export the minimum documented APIs via index.ts. Ensure HPA-1311 can query each
  reachable state by applying a move to the unchanged original state and forecasting
  attacks from the accepted result. Verify explicit non-active reachability can
  query squad approach cells in those candidate states with correct occupancy and
  full movement budgets; no enemy-occupied destination. Reuse shared grid target
  geometry when HPA-1311 needs attack range; no duplicate movement/LOS rules.
  Focused unit tests may import pure internal helpers.
  No DOM/Three/Svelte, timing dependencies or AI scoring code.
- Run focused tests, check/lint and existing unit suite.

## Slice 5 — Headless E2E, regression and docs

Files: `simulation/battle/battle.journey.spec.ts` (Vitest Node), optional fixture data;
`CLAUDE.md` to document the new isolated module and its public API while leaving the
current runtime description accurate. Edit CLAUDE.md only; AGENTS.md is its symlink.

- Script a complete 12 x 12 authored battle using only public construction, queries,
  forecast and commands. Use the starter hero and Lu, plus one squad ally for the
  shared-bag case if needed. Use deterministic, explicitly written opposing turns,
  not new AI. Cover weighted movement, one action, facing and end turn, qi spend/
  regeneration, Guard/counter, Gather and item use; include at least two rounds.
  Assert forecast consequences match actual events and HP/qi after attacks, plus
  bag counts, positions, turn order and victory. Use forecast-derived HP/qi and
  relational assertions for regeneration/item clamping rather than hard-coded
  balance-sensitive HP totals. Keep the authored script deterministic and bounded,
  with clear assertions on victory and rejected/terminal commands.
- Replay the one journey twice and compare state/events deep-equal, including a JSON
  round trip between commands. Hero defeat while a companion lives is covered by
  the focused slice-3 combat test; no second full journey.
- Run the full automated checks and inspect the existing Playwright exploration
  screenshot as described below; no second browser pass. Document the engine's
  existence, pure boundary and explicit handoff to HPA-1311/HPA-1315.
  Do not modify live GameMode, stepGame, HUD, save or renderer to expose the new engine.

## Risks and mitigations

- Floating-point off-by-one damage: integer percentages with one final floor, independently
  expected regression values (21, not 20) and direct computeDamage tests.
- Journey fragility when starter balance changes: derive HP/qi expectations from forecasts,
  check exact values in damage unit tests, keep the journey bounded and assert explicit
  outcomes and resource/turn invariants rather than fixed damage totals.
- Non-terminal counter-kill stalls the initiative cursor: use the normal shared
  turn-advance helper and regression-test both sides, round wrap, event order
  and forecast handoff. A terminal counter-kill must not start another turn.
- HPA-1311/HPA-1315 query-contract drift: test explicit non-active reachability
  separately from current legal movement; validate each returned aim with the
  same useMove checks, including qi/phase, and keep geometry shared.

## End-to-end acceptance checklist

All gates are for the eventual implementation, not this planning commit. No human
approval gate. Use execution MCP to run the headless journey and inspect the
existing Playwright screenshot via an available MCP/artifact viewer. Retain command
output/CI and screenshot evidence in the same PR. One Chromium desktop environment
is sufficient; no separate browser pass, new screenshot baseline or OS/device matrix.

- [ ] All four terrains, four external arts, three internal arts, turn/facing phases,
      Guard/counters, Gather, shared pills, qi regeneration and outcomes are implemented
      according to the design. The unit test cases in slices 1–4 cover both legal and
      rejected commands and deterministic event order.
- [ ] One public API scripted victory journey passes in the existing Vitest server
      project with no renderer, production integration, AI or new runtime dependency.
      Use execution MCP; assert forecasts, resources, turn order, event sequence and
      deterministic replay end-to-end. Focused unit tests prove terminal hero defeat
      with a surviving companion and automatic turn advancement after non-terminal
      counter-kills, including forecast parity for that handoff.
- [ ] `bun run check`, `bun run lint` and `bun run test` pass (test already runs
      the unit suite with --run plus Playwright). Existing first-day quest, real-time
      duel and inventory/save browser tests pass unchanged. Use the repository-pinned
      Bun and existing Playwright/CI setup; no duplicate full unit run or new workflows.
- [ ] HPA-1310 changes no UI and has no mockup. Reuse the 960 x 640
      `hud-1-explore.png` already produced by `attachHudShot` in
      `src/routes/wuxia-mvp.e2e.ts` during the existing Playwright suite.
      Inspect that image from test-results or the uploaded `playwright-report` CI
      artifact (.github/workflows/playwright.yml) via an available MCP/artifact viewer.
      Verify canvas, vitals, quest scroll, minimap and technique bar remain intact;
      link the run/artifact in the PR. No extra browser run or screenshot capture,
      before/after replay, new baseline, future mockup comparison or committed images.
- [ ] Review changed paths/imports: no Three.js/DOM/Svelte imports in battle; no
      new live game path, AI, art, audio, save changes or real-time combat deletion.
      Data and events are JSON-serializable, input remains unchanged on forecast/rejection,
      and consumers can use public functions without copying any combat rules.
- [ ] One PR for HPA-1310 contains design, plan, implementation and evidence.
      HPA-1311 and HPA-1315 remain separate dependent tickets.
