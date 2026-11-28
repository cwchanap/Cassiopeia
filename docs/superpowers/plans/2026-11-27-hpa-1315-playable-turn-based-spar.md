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
  identify actual prop footprints in GLB and procedural fallback. Delete
  obsolete fallback createShrine on the pad, not the actual distant shrine
  or bell. Flatten/remove the fallback raised stepping slabs. Inspect both
  loaded GLB and forced fallback with grid before fixing #/T; ensure posts,
  bamboo and lantern cells align (including fallback) and are clickable.
- [ ] Author SECT_TRAINING_YARD_TERRAIN and LU_PROFILE in battle/content.ts
  and simple createSparSetup(items) in simulation, returning BattleSetup.
  8 × 8 grid, fixed origin (-6,-6), 1.5 m cells. Align #/T with real props;
  snap procedural posts to centres if needed. No encounter registry/IDs,
  decoration placement schema or second scene.
- [ ] Build hero setup from equipment power/HP and copied pills; qi from
  internal art (no engine maxQiBonus extension). Use the existing weapon's
  lightAttackDamageBonus value as the power increment until its coordinated
  powerBonus rename in §2; no duplicate catalog fields or compatibility
  alias. Keep HP bonuses, item IDs and reward behavior. Clarify charm effect
  deferred until another battle exists. Test equipped/unequipped hero and
  starting pills. No battle rules or AI changes.
- [ ] Unit journey: deterministic win and loss using real planBattleTurn
  first-command replanning and explicit player commands. Validate spawn,
  reachable attacks and terrain connectivity; tune encounter data only.
  Record reproducible win/loss input sequences for browser tests.

## 2. Session, legacy deletion and early playable vertical slice

- [ ] Add battle mode/session in simulation/types.ts; route stepGame before
  village mutators; enter on Lu step-5 dialogue and rename quest event/kind.
  Keep stepGame void and toHudSnapshot(state). Extend existing command
  array for HUD battle intents; no runtime AI/finalize protocol.
- [ ] In the same compiling cutover, remove the real-time duel and all
  incompatible fields/callers/tests: state.rival, CombatActionState,
  attack timings/hitstun/chase/cooldowns, duel camera/ring, lightAttack/
  qiBurst input/HUD and old damage helper. Replace weapon stats with
  powerBonus in catalog/types/setup and descriptions; keep dash and move
  shared helpers into world.ts, delete combat.ts. Lu uses authored village
  position; applyFighter uses simple presentation poses, not combat state.
  Update interaction, dialogue, quest, layout, camera, scene and state
  tests and stale HUD labels. Remove village useConsumable, inventory
  useItem command, state/runtime useInventoryItem/handleQuickSlotUse,
  page use handler and bag-use-* buttons; keep catalog consumable data,
  bag/equip/slot assignment and disabled explore quick-slot indicators.
  Update legacy E2E selectors/assertions with the cutover. Run check and
  unit tests before committing; group coupled edits in one green commit.
- [ ] Implement pure selectBattle helper, selection in session, keyboard
  cursor, move/attack/Guard/Gather/facing and quick slots. Use real public
  reducer, engine queries and forecast. DOM input emits raw discrete
  intents; HUD buttons share the same path. Implement initial session
  playback drain (short/simple durations), one AI command per idle tick
  with replanning, finalize-once, result/retry/return. Initialize shown
  from created state with no pending startup events; auto-enter facing
  after hero action drains if still active, non-cancellable. Escape
  resumes > closes bag > cancels optional selection > pauses; explicit HUD
  pause/resume bypasses cancellation. No AI queue.
- [ ] Add minimal grid, jade tiles, fighter rings and cursor in existing
  createWuxiaScene; use current yard/camera and hide unrelated villagers
  and markers. Add minimal plain controls/HP/qi/turn feedback to page.
  Start at 20 m battle view and cap active focus offset at 0.8 m; verify
  front corner (7,7) clears the HUD at 960 × 640 under northward focus.
- [ ] **Early browser MCP vertical slice:** enter spar via Lu dialogue and
  complete a keyboard-only battle to result/Return using real engine/AI
  before detailed HUD and playback. Confirm the grid fits and the actual
  application loop works. Reuse this journey when final E2E runs.

## 3. Complete session lifecycle and unit coverage

- [ ] Finish ordered presentation events (path, strike, counter, damage,
  fall, HP/qi/facing, guard, turn and round), with separate shown view
  and authoritative state. Advance pending events in stepGame, reconcile
  after drain, then finalize terminal state. Reuse damage-number UI with
  battle-local effects. Age battle effects (0.65 s damage fade) and item
  feedback on every unpaused tick, including idle/result; never tick frozen
  village effects. Keep zero/short reduced-motion path ordered.
- [ ] Add fixed-dt stepGame tests: entry only at step 5, village frozen,
  pause/resume, input discard while busy, direct HUD/inventory command
  gating, actor/phase rejection, selection/confirm invalidation, automatic
  facing/non-cancellation and exact Escape precedence; verify first turn and
  retry immediately ready, effect/toast expiry in idle/result and pause.
  Test event order/after-values, AI replanning only at idle command boundaries,
  counter kill and terminal no stale endTurn, unexpected AI errors,
  Return/Retry and no lingering effects. Do not create fake-timer runtime
  harness or duplicate rules tests.
- [ ] Implement atomic victory pill reconciliation, existing reward/quest
  advance once; defeat leaves items/seed/quest untouched, Retry fully
  resets battle. Test exact return pose, reward not re-granted, defeat
  Return/re-entry and repeated inputs. Save remains v2 items + quest,
  no battle persistence; test save/load for unfinished and completed
  sessions. Preserve/update existing all-five-step simulation journey with
  real movement, step 2 dash, step 3 slot assignment, actual shrine bell
  interaction and step 5 spar; the CI shrine shortcut is not a substitute.
- [ ] Test quick-slot item actions use battle bag, including missing/depleted
  slot, duplicate slots for one pill, full resource, spent action, pause,
  enemy/busy and accepted restoration/consumption. No village pill
  activation; village inventory/assignment remain functional and visible
  quick slots report counts/labels but usable=false outside battle.

## 4. Finish scene, mouse and functional HUD

- [ ] Reuse existing courtyard, Player/Rival and resource lifecycle.
  Add one battle overlay group, full grid, path, hover/cost, targeting/
  affected/hit cells, rings/facing and edge mist. Ensure props align with
  #/T and scene remains legible with assets or fallback. Restore normal
  village visibility/pose on return, clear overlays and dispose resources.
- [ ] Keep fixed orientation and larger view height (start at 20 m),
  board-centred baseline with active-fighter focus capped at 0.8 m or
  tighter. Verify all edge cells, especially (7,7), remain visible and
  hoverable/clickable above actual bottom HUD at 960 × 640 under worst
  northward follow. Verify wide viewport too. No general fit/zoom framework.
  Add unprojectToGround in
  camera.ts based on actual frame and orthoFrustum. Runtime translates
  pointer CSS coordinates to cells; no pick before matching battle frame.
  Test project/unproject for every cell centre at 960 × 640 and 1440 × 900,
  including allowed focus and off-board rejection. No DPR-specific suite.
- [ ] Wire mouse hover/pick/confirm, fighter aim proxies, selection and
  keyboard bindings via common pure selectBattle. Reuse existing command
  plumbing; no duplicate submission, HUD click-through or held-key repeat.
  Gate global battle keys/Enter/Space on interactive/modal focus; allow
  native focused-button activation, Bag focus trap and existing I/B/Escape
  close. Pointer-clicked BattleHud buttons refocus scene-host; keyboard
  activation remains native. Test exact once Enter after pointer selection,
  native button activation in Bag/fallback, pause while selected then
  resume with one Escape, and automatic facing confirmation.
- [ ] Complete BattleHud.svelte: active round/phase, actions/costs,
  forecast, facing and result/reward. Reuse Vitals, Lu meter (add qi),
  DamageNumbers and quick-slot markup. Counts derive from battle bag.
  J/K/L moves and 1–3 pills; same logic for click/key. Compute legal
  options in toHudSnapshot with public APIs; no extra caching unless
  profiling proves a problem. Keep actual rules numbers, not mockup
  placeholder stats. Hide explore HUD during battle; use Svelte MCP
  docs/autofixer for Svelte edits per repo guidance.
- [ ] Audit the §2 legacy deletion and stale tests/text, ensure old duel/
  attack/hitstun/chase/item-use runtime paths are gone. Update CLAUDE.md
  once (AGENTS.md symlink); historical specs stay historical. No
  compatibility toggle.

## 5. Final automated acceptance

Keep two focused browser journeys (and existing unrelated village
regressions). Retain the existing documented step-4 localStorage save bridge
in wuxia-mvp.e2e.ts to avoid the ~90 m shrine round trip in software WebGL;
steps 1–3 and 5 are real UI. Preserve the all-five-step simulation journey
including the actual bell interaction. Fold actual post-victory reload into
Journey 1; never seed completed battle/reward. Use Playwright
reducedMotion: 'reduce', stable accessible selectors and phase waits; no
test-only mutation hooks or mocked enemy. Normal-duration event ordering,
focus handling and pause are covered by deterministic tests; browser MCP
also verifies representative focus/interaction behavior. Do not claim the
CI bridge is uninterrupted five-step browser play.

| Gate | Evidence |
| --- | --- |
| First-day + reload | Fresh game steps 1–3 via UI, existing step-4 save bridge, real Lu dialogue, keyboard-only spar victory, result/return to exact location, reward/quest complete, free roam and reload verifies same actual reward once |
| Mouse spar | Valid step-5 save fixture, real Lu dialogue, mouse-only battle controls; defeat/Retry smoke then win, no key actions in battle |
| Lifecycle | All-five-step simulation journey incl. shrine bell; deterministic stepGame tests cover defeat/return/retry, abandoned battle, pill rollback/commit, exact reward, pause/Escape, auto-facing, startup, idle/result effect expiry, event ordering, counter handoff, invalid/stale inputs |
| Visual parity | Browser MCP screenshot of move/hover/path against Linear battle-hud-1-move.jpg; stone pad, surrounding kit, mist, fine grid, jade range, gold path, fighter rings/facing |
| Other visuals | A few screenshots of forecast and result (plus returned village if needed); verify 960 × 640 front corner (7,7) hover/pick above HUD at worst follow, wide 1440 × 900 fit, no clipping/stale village layers; no state × viewport screenshot matrix |
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

Encounter balance, loaded/fallback prop alignment and bottom-HUD clearance
are checked before/during the vertical slice. Reduced motion and retaining
the existing shrine save bridge keep browser CI fast; actual full-quest
simulation coverage stays mandatory. One GameState
session owns orchestration, no extra runtime protocol or engine contract
extension. No new scene builder, art, audio, registry, middleware or future
deployment support. Separate logical tactical map uses existing courtyard as
the visual set; any deviation from the Linear scene/camera requirements
must be explicitly recorded, not treated as silently approved.
