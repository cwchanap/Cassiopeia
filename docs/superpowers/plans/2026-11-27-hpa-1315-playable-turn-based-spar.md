# HPA-1315 — Playable turn-based spar (implementation plan)

Source: [Linear HPA-1315](https://linear.app/cwchanap/issue/HPA-1315/playable-turn-based-spar-on-the-sect-training-yard).
Read the companion [design spec](../specs/2026-11-27-hpa-1315-playable-turn-based-spar.md), CLAUDE.md and AGENTS.md first.
Branch: `jack65786656/hpa-1315-playable-turn-based-spar-on-the-sect`. Single draft PR to main; add all implementation, fixes and
verification evidence here. HPA-1310 and HPA-1311 merged. Do not open additional
PRs or pull in HPA-1316/1317/1318 or art/sound tickets.

## 1. Baseline and authored encounter

- [ ] Run the existing check/lint/unit/e2e commands and record baseline failures.
- [ ] Add typed map and encounter data in simulation/battle/encounters.ts.
  Author Sect Training Yard's terrain, positions, facing, kit placements, goal,
  reward policy and Lu's Aggressor profile. Use the merged public battle API.
- [ ] Update item stats, catalog descriptions and hero setup builder. Test
  equipped vs unequipped hero power/HP, charm qi cap, actual reducer damage/
  regen/item restoration, invalid bonus, initial pill counts. Keep unchanged
  template behavior and existing rules/AI test suite. Remove old damage helper.
- [ ] Write a deterministic encounter-level unit journey with real planBattleTurn
  for Lu and explicit legal player moves; prove both victory and defeat with
  the authored setup and record the winning sequence for the UI E2E driver.
  Assert movement paths/terrain/prop alignment and valid spawns. If balance
  adjustments are needed, change only encounter data.

## 2. Game state, quest, inventory and save

- [ ] Replace duel mode and quest event/kind in simulation/types.ts, state.ts,
  quest.ts, dialogue/interaction/villageContent as needed. Introduce battle
  session/intent/result types. Route battle early in stepGame, before village
  mutators; start only on Lu's final dialogue at quest step 5. Pass the returned
  immutable BattleState/events from public applyBattleCommand; reject wrong
  side, wrong phase, wrong actor, invalid input and post-terminal commands.
- [ ] Write state-level tests for entry, no entry before quest step 5 or after
  completion, unchanged village pose/heading/HP/qi/quest/inventory/dash state
  during battle, paused state, invalid and stale commands, counter handoff and
  terminal outcomes. Test direct inventory command calls cannot bypass battle
  ownership. Preserve step 2 dash and step 3 bag/quick-slot assignment.
- [ ] Add result-finalize/retry/return lifecycle. Defeat/retry keeps persistent
  items/seed/quest unchanged and resets HP, qi, pill bag, turn order and
  placement. Victory commits battle pill usage and reward/quest together once,
  normalizes depleted quick slots and returns to exact pre-battle village
  pose. Confirm reward is not re-granted on repeated finalize/return. Test
  defeat return and re-entry; verify save round-trip on win and abandoned
  ongoing fight. Keep save key if shape unchanged; otherwise bump and ignore
  previous saves. Add/adjust runtime/save.spec.ts tests.

## 3. Runtime and playback

- [ ] Add a small pure/testable playback queue/cursor with pre-command display
  snapshot and ordered events. Implement event-driven path movement, strike,
  counter, damage numbers, fall, facing/HP/qi/turn updates and final reconcile.
  Use bounded durations/delta, no battle-rules timers. Expose busy/result-ready
  in readonly presentation/HUD. State transitions remain in stepGame.
- [ ] Wire createGameRuntime.ts: consume input once per RAF, route one legal
  command at a time, gate player/AI by busy/pause/actor, compute Lu's plan once
  per turn, consume the next command only when previous playback drains.
  Invalidate on counter handoff, result, retry, return, dispose; surface
  unexpected AI failure. Send finalize only after terminal events drain,
  persist once and publish. Use one input/selection path for HUD and canvas.
- [ ] Add runtime/playback tests with fake time/dependencies or pure controller:
  state changes instantly while visuals progress in order, no final HP/fall/
  turn early, no input buffering or duplicate AI plan, no new actor command
  until batch finishes, pause/resume, terminal kill/counter-kill without stale
  endTurn, restart/exit/dispose clearing all pending state. No new scheduler.

## 4. Battle scene and projection

- [ ] Extract/reuse kit-building helpers; build render/battleScene.ts from
  map records, switch village/battle roots on mode change inside existing
  renderer. Keep one canvas, one orthographic camera, one GLB load lifecycle.
  Reuse loaded Player/Rival and actual named village kit children when possible;
  procedural equivalent on failure. Hide village NPCs/markers/effects during
  battle. On return restore actor poses and visibility, no duplicate shadows/
  geometry/materials. Cover late GLB load and dispose ownership.
- [ ] Implement pure cell/world transform and inverse screen ground pick based
  on actual WuxiaProjectionFrame/orthoFrustum; use CSS-pixel rect and actual
  rendered frame. Test cell center round trips for 960 × 640 and 1440 × 900,
  smoothed active focus, resize/DPR, grid edges and off-board rejection. Test
  fighter target resolution and facing mapping. Fit whole board with HUD
  insets while following active fighter; reset camera smoothing on mode switch.
- [ ] Draw stone courtyard and mist, grid, reachable jade tiles, highlighted
  path, hovered cell, legal aim/affected/hit cells, side rings and facing
  markers. Use existing engine paths and move-target queries; no renderer
  collision/rules. Drive animation visuals from playback snapshots. Unit test
  overlay/view derivation, selection invalidation and terrain/path labels;
  screenshot test visual placement in browser. Reuse buffers/materials;
  do not recreate all meshes each frame.

## 5. Input and plain HUD

- [ ] Refactor createInputController.ts to route mode-specific discrete inputs
  while retaining village screen-aligned move/dash, interaction and bag.
  Implement the spec's keyboard cursor, selection, confirm/cancel, facing,
  pill choice, result controls and mouse pick. Use single shared intent
  path; reject out-of-range, occupied, unaffordable and stale choices; don't
  submit twice on key repeat, native button activation or HUD click-through.
  Test keyboard-only selection for every action and result; test pointer
  selection/confirmation/cancel and paused/enemy/busy guards.
- [ ] Add BattleHud.svelte and a typed battle snapshot/selection projection.
  Round, actor, phase, HP/qi, actions and costs, pills, preview/forecast,
  facing, result and reward. Forecast via forecastMove; test actual vs
  forecast including counter, insufficient qi and empty target. Disable
  wrong-phase controls and busy actions; accessible labels and stable test IDs.
  Switch hud/layout.ts/+page.svelte by mode; retain pause, dialogue, explore
  HUD and bag without leaking them into battle. Use Svelte MCP docs/autofixer
  for edited Svelte files per repo instructions.
- [ ] Delete real-time duel-only fields, timers, code, old HUD widgets,
  CSS/labels and tests; retain shared dash effects, exploration movement and
  equipment UI. Rename/extract combat.ts helpers into movement/world module.
  Sweep src/ and current docs for legacy duel, hitstun, rival chase,
  lightAttack, qiBurst, attackCooldown, qiCooldown and old reward wording;
  remove dead paths rather than aliasing. Historical specs remain history.
  Update CLAUDE.md and AGENTS.md for new flow, APIs and controls.

## 6. E2E, visual parity and final acceptance

Update src/routes/wuxia-mvp.e2e.ts (keep existing village movement, assets,
dialogue, quest/marker/bag and free-roam regression coverage). Use real rendered
UI/input and actual AI; don't inject engine commands or mark quest complete
to pass the full journey. Focused isolated cases may seed valid step-5
items/quest through localStorage to avoid repeating the long village walk,
but still enter via real Lu dialogue and play through UI. Prefer stable
accessible selectors and state/phase waits over sleeps or wall-clock loops.
No test-only win buttons, fake AI or runtime public mutation hook.

| Gate | Required automated evidence |
| --- | --- |
| Full journey | Fresh game through all five steps, Lu dialogue changes scene, actual victory, result/return restores village location, quest complete and exact reward count/seed, free-roam and reload |
| Mouse-only spar | Enter from step-5 dialogue; hover and click reachable cells; inspect path, choose attack, forecast, confirm, face, wait for real AI; win without keyboard battle commands |
| Keyboard-only spar | Enter same encounter; move/select/cursor/confirm/action/facing and win using only keys in battle; result Return via Enter, no mouse |
| Defeat/retry | Deliberately lose against real AI, assert result/retry; fresh state, full HP/qi, bag counts/seed/quest unchanged; win retry and reward exactly once; also test defeat Return/re-entry |
| Commands/playback | Observe path/strike/damage/fall in order, controls disabled during enemy turn/playback, invalid moves/actions don't change state, no extra command after counter handoff; pause/resume |
| Persistence | Successful used pill consumption reflected on win, defeat restores pills; reward and completed quest persisted together; reload no duplicate; reload during unfinished spar abandons it |
| Visual parity | Actual screenshot comparison to Linear battle-hud-1-move.jpg: isometric stone yard, kit/mist, grid, jade range, gold route/hover, fighter rings/facing, two fighters only; plain HUD exempt from polished panel parity |
| Visual states | Screenshots of move preview, attack/forecast, facing and result, plus village return; 960 × 640 and 1440 × 900 board fits, no overlap/clipping or stale village layers, actual loaded assets and usable fallback |
| Quality | bun run check; bun run lint; bun run test (unit + Playwright); production build; existing CI green; no real-time duel runtime references |

- [ ] Execute the full test suite through an execution MCP and exercise the
  actual built/previewed app through browser MCP (Playwright or Chrome DevTools)
  on desktop Chromium; use the browser MCP to capture and inspect visual
  screenshots against the Linear attachment. One platform is enough.
- [ ] Attach results/screenshots via CI artifacts or PR evidence links; summarize
  visual differences allowed by scope (plain HUD and 1v1) and verify no
  unexpected differences. Do not commit screenshot artifacts or traces.
- [ ] Record actual commands, CI links, acceptance evidence and any failing
  gates or unavailable MCPs in the PR body. CI passing alone does not establish
  MCP visual acceptance; do not mark unavailable checks as passed. No human
  sign-off criterion. Keep this PR draft until implementation and required
  automated acceptance are complete.

## Implementation order and stop conditions

Work in the order above within this one PR; prove the authored encounter
and transactional quest behavior before investing in rendering. A separate
art or sound task must not block these gates. The design uses the existing
engine as-is except the narrow equipment qi initialization extension; do not
extend global combat rules, add a generic game-mode framework, persist live
battle state, or pre-build deployment/arts/audio features. If a prerequisite
or required acceptance check fails, record it and fix it within this PR.
