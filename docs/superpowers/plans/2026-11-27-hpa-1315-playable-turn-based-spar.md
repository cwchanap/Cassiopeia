# HPA-1315 — Playable turn-based spar (implementation plan)

Source: [Linear HPA-1315](https://linear.app/cwchanap/issue/HPA-1315/playable-turn-based-spar-on-the-sect-training-yard).
Read the companion [design spec](../specs/2026-11-27-hpa-1315-playable-turn-based-spar.md) and CLAUDE.md.
Branch: `jack65786656/hpa-1315-playable-turn-based-spar-on-the-sect`. One draft PR to main; keep changes in small green
commits in this PR. HPA-1310 and HPA-1311 merged. No art/sound/deployment
or polished-HUD work.

## 1. Courtyard and content

- [ ] Run baseline check/lint/tests; record existing failures. Inspect
  current courtyard and grid via early browser MCP screenshot before
  finalizing terrain. Reuse the existing stone pad, layout and models;
  identify actual prop footprints in GLB and procedural fallback.
- [ ] Author SECT_TRAINING_YARD_TERRAIN and LU_PROFILE in battle/content.ts
  and simple createSparSetup(items) in simulation, returning BattleSetup.
  8 × 8 grid, fixed origin (-6,-6), 1.5 m cells. Align #/T with real props;
  snap procedural posts to centres if needed. No encounter registry/IDs,
  decoration placement schema or second scene.
- [ ] Replace old weapon damage bonuses with powerBonus, keep HP bonuses,
  item IDs and reward behavior. Build hero template from equipment power/HP,
  copy pills; qi from internal art (no engine maxQiBonus extension). Clarify
  charm effect deferred until another battle exists. Test equipped/unequipped
  hero and starting pills. No battle rules or AI changes.
- [ ] Unit journey: deterministic win and loss using real planBattleTurn
  first-command replanning and explicit player commands. Validate spawn,
  reachable attacks and terrain connectivity; tune encounter data only.
  Record reproducible win/loss input sequences for browser tests.

## 2. Session and early playable vertical slice

- [ ] Add battle mode/session in simulation/types.ts; route stepGame before
  village mutators; enter on Lu step-5 dialogue and rename quest event/kind.
  Keep stepGame void and toHudSnapshot(state). Extend existing command
  array for HUD battle intents; no runtime AI/finalize protocol.
- [ ] Implement pure selectBattle helper, selection in session, keyboard
  cursor, move/attack/Guard/Gather/facing and quick slots. Use real public
  reducer, engine queries and forecast. DOM input emits raw discrete
  intents; HUD buttons share the same path. Implement initial session
  playback drain (short/simple durations), one AI command per idle tick
  with replanning, finalize-once, result/retry/return. No AI queue.
- [ ] Add minimal grid, jade tiles, fighter rings and cursor in existing
  createWuxiaScene; use current yard/camera and hide unrelated villagers
  and markers. Add minimal plain controls/HP/qi/turn feedback to page.
- [ ] **Early browser MCP vertical slice:** enter spar via Lu dialogue and
  complete a keyboard-only battle to result/Return using real engine/AI
  before detailed HUD and playback. Confirm the grid fits and the actual
  application loop works. Reuse this journey when final E2E runs.

## 3. Complete session lifecycle and unit coverage

- [ ] Finish ordered presentation events (path, strike, counter, damage,
  fall, HP/qi/facing, guard, turn and round), with separate shown view
  and authoritative state. Advance pending events in stepGame, reconcile
  after drain, then finalize terminal state. Reuse damage-number UI with
  battle-local effects. Keep zero/short reduced-motion path ordered.
- [ ] Add fixed-dt stepGame tests: entry only at step 5, village frozen,
  pause/resume, input discard while busy, direct HUD/inventory command
  gating, actor/phase rejection, selection/confirm invalidation, event
  order/after-values, AI replanning only at idle command boundaries,
  counter kill and terminal no stale endTurn, unexpected AI errors,
  Return/Retry and no lingering effects. Do not create fake-timer runtime
  harness or duplicate rules tests.
- [ ] Implement atomic victory pill reconciliation, existing reward/quest
  advance once; defeat leaves items/seed/quest untouched, Retry fully
  resets battle. Test exact return pose, reward not re-granted, defeat
  Return/re-entry and repeated inputs. Save remains v2 items + quest,
  no battle persistence; test save/load for unfinished and completed
  sessions. Preserve step 2 dash and step 3 slot assignment.
- [ ] Test quick-slot item actions use battle bag, including missing/depleted
  slot, duplicate slots for one pill, full resource, spent action, pause,
  enemy/busy and accepted restoration/consumption. No village pill
  activation; village inventory/assignment remain functional.

## 4. Finish scene, mouse and functional HUD

- [ ] Reuse existing courtyard, Player/Rival and resource lifecycle.
  Add one battle overlay group, full grid, path, hover/cost, targeting/
  affected/hit cells, rings/facing and edge mist. Ensure props align with
  #/T and scene remains legible with assets or fallback. Restore normal
  village visibility/pose on return, clear overlays and dispose resources.
- [ ] Keep fixed orientation and larger view height (~18 m), board-centred
  baseline with bounded active-fighter focus if board fits (ticket asks
  active follow). No general fit/zoom framework. Add unprojectToGround in
  camera.ts based on actual frame and orthoFrustum. Runtime translates
  pointer CSS coordinates to cells; no pick before matching battle frame.
  Test project/unproject for every cell centre at 960 × 640 and 1440 × 900,
  including allowed focus and off-board rejection. No DPR-specific suite.
- [ ] Wire mouse hover/pick/confirm, fighter aim proxies, selection and
  keyboard bindings via common pure selectBattle. Reuse existing command
  plumbing; no duplicate submission, HUD click-through or held-key repeat.
- [ ] Complete BattleHud.svelte: active round/phase, actions/costs,
  forecast, facing and result/reward. Reuse Vitals, Lu meter (add qi),
  DamageNumbers and quick-slot markup. Counts derive from battle bag.
  J/K/L moves and 1–3 pills; same logic for click/key. Compute legal
  options in toHudSnapshot with public APIs; no extra caching unless
  profiling proves a problem. Keep actual rules numbers, not mockup
  placeholder stats. Hide explore HUD during battle; use Svelte MCP
  docs/autofixer for Svelte edits per repo guidance.
- [ ] Delete legacy duel code, old HUD cooldowns and real-time tests;
  keep dash and fold movement helpers into world.ts. Update dialogue,
  quest text, labels and current docs. Update CLAUDE.md once (AGENTS.md
  symlink); historical specs stay historical. Audit source for old
  duel/attack/hitstun/chase runtime paths, no compatibility toggle.

## 5. Final automated acceptance

Keep three focused browser journeys (and existing unrelated village
regressions). Use Playwright reducedMotion: 'reduce' for reliable fast
playback, stable accessible selectors and phase waits; no test-only
mutation hooks or mocked enemy. The normal-duration event ordering and
pause behavior are covered in fixed-dt unit tests, not fragile E2E timers.

| Gate | Evidence |
| --- | --- |
| Full first day | Fresh game, all five quest steps, keyboard-only spar victory, result and return to exact location, reward/quest complete and free roam |
| Mouse spar | Valid step-5 save fixture, real Lu dialogue, mouse-only battle controls; defeat/Retry smoke then win, no key actions in battle |
| Reload | Completed real battle progress saved, reload and verify quest/reward exactly once; reuse first journey's state or focused valid fixture to avoid repeating long traversal |
| Lifecycle | Deterministic stepGame tests cover defeat/return/retry, abandoned battle, pill rollback/commit, exact reward, pause, event ordering, counter handoff, invalid/stale inputs |
| Visual parity | Browser MCP screenshot of move/hover/path against Linear battle-hud-1-move.jpg; stone pad, surrounding kit, mist, fine grid, jade range, gold path, fighter rings/facing |
| Other visuals | A few screenshots of forecast and result (plus returned village if needed); verify board fits at 960 × 640 and 1440 × 900, no clipping/stale village layers; no state × viewport screenshot matrix |
| Quality | bun run check, bun run lint, bun run test, build, existing CI green, legacy duel code removed |

- [ ] Run existing CI/test commands once; use execution MCP when available
  and browser MCP for actual end-to-end acceptance on desktop Chromium.
  Reuse Playwright/CI output and browser MCP screenshots rather than
  duplicating every suite or screenshot state. No native/platform-specific
  acceptance or human sign-off. CI alone does not prove the MCP visual
  check; record unavailable required MCP acceptance honestly.
- [ ] Compare the actual move screenshot to Linear attachment, document
  intentional differences (1v1/plain HUD, reused yard, real engine stats)
  and any deviation in active camera follow. Capture representative
  forecast/result screenshots and verify the second viewport fits.
  Attach screenshots via artifacts or PR evidence links, not tracked files.
- [ ] Record commands, CI links, actual browser MCP evidence and any failing
  gates in the PR. Keep draft until required automated acceptance passes.

## Risks and boundaries

Encounter balance and prop/terrain alignment are checked before the vertical
slice; reduced motion keeps E2E from taking minutes per spar. One GameState
session owns orchestration, no extra runtime protocol or engine contract
extension. No new scene builder, art, audio, registry, middleware or future
deployment support. Separate logical tactical map uses existing courtyard as
the visual set; any deviation from the Linear scene/camera requirements
must be explicitly recorded, not treated as silently approved.
