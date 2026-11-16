# HPA-792 — Wuxia Ink-and-Paper HUD (Implementation Plan)

**Design:** [HPA-792 design specification](../specs/2026-11-15-hpa-792-ink-paper-hud.md)  
**Linear:** [HPA-792](https://linear.app/cwchanap/issue/HPA-792/wuxia-ink-and-paper-hud)  
**Base:** The current main branch, after the merged HPA-790 camera, HPA-791 quest,
and HPA-793 art work.  
**Delivery:** **One PR for this ticket**, initially draft for design review, with
implementation commits added to that same PR. Do not open a second coding PR.  
**Status:** Planning only: no feature implementation, successful test run or visual
acceptance is claimed yet.

## Working rules

Deliver **five green, playable vertical slices** as commits in this **same
HPA-792 draft PR**, rather than a documentation PR followed by an
implementation PR. Every slice must visibly change a usable HUD state,
update the selectors/tests it affects in the same commit, and pass
bun run check, bun run lint and bun run test before the next slice.
Keep the existing GitHub Actions workflows; do not create an OS matrix.

Keep KISS/YAGNI: one route/runtime, one simulation-owned HudSnapshot, one
separate renderer-provided camera frame, one pure hudLayout selector and one
HUD stylesheet. No UI framework, event bus, new save version or camera
reimplementation. Reuse existing HPA-793 ink icons, portraits and paper;
new image art or SFX belong to a different task, **not** this coding PR.

Use the current Linear hud-1 through hud-4 attachments as the visual
reference. Acceptance is automated through browser-capable **MCP**
and existing Playwright/CI; no human approval gate.

## Slice 1 — Tokens, fonts, vitals and medallions

**Visible outcome:** the player can explore and use quick slots with a
round portrait, brush health/qi bars and ink-medallion action bar in the
existing working game.

**Files**

- src/lib/hud/hud.css, Vitals.svelte, TechniqueBar.svelte
- src/lib/hud/layout.ts and layout.spec.ts
- src/lib/game/simulation/types.ts and state.ts plus focused tests
- src/routes/+page.svelte and page.svelte.spec.ts
- One small font-glyph manifest and subset script; static/fonts/wuxia/
  with source license text; a Node glyph-coverage test
- Existing HPA-793 static/images/wuxia/ art (references only)

**Steps**

1. Introduce shared paper/ink/cinnabar/jade/wood tokens, CSS brush shapes,
   keyboard focus indicators and a reduced-motion fallback. Self-host a
   Ma Shan Zheng hanzi subset and Cormorant Garamond Latin font. Small
   hanzi use a system CJK serif stack with the shipped display subset
   as fallback. **Do not include Noto Serif SC.**
2. Commit the exact supported CJK glyphs as one text file and a tiny
   reproducible pyftsubset command/script. Add a Node test that every
   CJK glyph in the current quest titles and fixed HUD labels is
   covered. Extend the manifest and test for region titles in Slice 4
   when those labels are implemented. Fonttools is build-time-only;
   the browser must never contact a font CDN.
3. Add pure hudLayout(hud) in src/lib/hud/layout.ts with vitals,
   map, anchors, techniques, rivalBar, dialogue, banner,
   damageNumbers, itemFeedback and quest mode (full/line/hidden).
   Table-test explore/dialogue/duel × pause × bag. The rival bar
   stays behind duel pause, while damageNumbers is true in explore
   or duel unless paused, in dialogue or with the bag open.
   **itemFeedback remains visible while the bag is open**; this
   supports the existing Playwright quick-slot assignment check.
   The page computes the selector once and passes plain props.
4. Add rivalMaxHealth, dashCooldownMax and qiCooldownMax to
   HudSnapshot from existing FighterState/combat constants (only
   the fields the new visible components need). Retain health/qi
   accessible native meters, including their data-testid/aria labels.
   Keep the playerActionStatus field to display Strike as
   Ready/busy, even though the old action-status row is removed.
5. Medallions use atlas indices, key hints and existing actions:
   Space dash and K Qi burst have countdown arcs (remaining / max);
   J Strike has **no** cooldown sweep, because attackCooldown
   never becomes positive, and indicates busy from
   playerActionStatus instead. Keep quick slots 1–3, I/B bag,
   item counts, disablement and onClick behavior. Do **not**
   delete unused simulation attackCooldown now; that is unrelated
   mechanical cleanup.
6. Update the route's old component selectors as the DOM is
   replaced. Existing bag actions and game loop still work. Unit
   tests cover real resource/max ratios, the busy/disabled states,
   cooldown maxima and the visibility mode table.

**Green checkpoint:** working exploration screenshot of vitals and
medallions; full check/lint/test green.

## Slice 2 — Quest scroll, minimap and anchored exploration HUD

**Visible outcome:** the quest, off-map direction and overhead NPC
labels move correctly while exploring the actual scene.

**Files**

- src/lib/hud/QuestScroll.svelte, MiniMap.svelte, WorldAnchors.svelte
- src/lib/hud/map.ts and pure map.spec.ts
- src/lib/game/simulation/types.ts, villageContent.ts, state.ts,
  plus state.spec.ts and relevant interaction/quest tests
- src/lib/game/render/camera.ts, camera.spec.ts,
  createWuxiaScene.ts and scene tests
- src/lib/game/runtime/createGameRuntime.ts and runtime tests
- src/lib/game/simulation/world.ts (pure footprint helper, if useful)
- src/routes/+page.svelte, route tests and focused Playwright checks

**Steps**

1. QuestScroll displays the chain title, five step dots, the
   authored bilingual current step/instruction and dash progress.
   On quest completion it shows one free-roam line, not a sixth step.
   Keep data-testid=objective-chip and the English instruction so
   existing Playwright checks still work. Collapse to one line in
   duel (using hudLayout), hide in dialogue/bag.
2. Add player position and questTarget { id, position } | null
   to HudSnapshot. For villagers/bell, filter existing
   interactTargets(state) by activeQuestStep().targetId, so Lu
   uses state.rival.position. For markers use the next
   DASH_MARKERS[stepProgress]. Return null on free roam.
   Narrow QuestStep.targetId to InteractTargetId or gate_markers.
   Also add **position: Vec2** to HudInteractTarget and copy the
   existing state.interactTarget.position in hudInteractTarget().
   WorldAnchors can then place the shrine-bell E prompt directly,
   without a villager lookup or questTarget fallback.
3. Add worldDirectionToScreen beside the existing
   screenDirectionToWorld in camera.ts; use the same sine/cosine
   basis and a round-trip/orthogonality test. The round SVG map
   uses it for road/river/bridge/building geometry from the
   _unchanged_ world-layout.json, and for north/target bearings.
   Use the exact building turn % 2 footprint swap already in
   world.ts; share a pure helper or test the parity explicitly.
   A target outside the map radius gets a rim arrow and rounded
   straight-line metres. No canvas renderer, fog, navigation or
   extra map image.
4. Return **WuxiaProjectionFrame | null** from
   WuxiaScene.render(state, dt), using the actual interpolated
   pose and CSS viewport typed with camera.ts types; return null
   on the existing disposed early-exit path. Runtime accepts
   onHudUpdate(snapshot, optionalFrame) and passes a frame only
   after a successful render; zero-dt inventory commands send
   snapshot only. +page.svelte holds the separate frame $state,
   updating it only when provided. Do not copy pose types into
   simulation or add HudSnapshot.projection.
5. WorldAnchors projects heads and quest markers with
   projectWorldToScreen(point, frame.pose, frame.viewport).
   Show the actual hud.prompt interaction text on the E tag at
   **hud.interactTarget.position**, including the shrine bell;
   do not derive its location from hud.villagers or questTarget.
   Hide off-frustum/initial-no-frame tags, keep pointer-events:none,
   and verify CSS-pixel positioning, resize and camera follow lag.
6. **Transition the game-prompt test ID in the same slice:** keep
   the old +page.svelte <p class="prompt"> only when
   hud.mode !== 'explore', and put the single
   data-testid="game-prompt" on WorldAnchors' in-range E tag.
   When exploring without an interaction target, QuestScroll
   carries the objective and game-prompt is absent. Update
   page.svelte.spec.ts and explore assertions in
   wuxia-mvp.e2e.ts (including walk-to-target assertions) in
   the same commit. Never render duplicate game-prompt IDs.
7. Focused tests cover target switching through all five
   stages, shrine-bell and villager E positions, marker
   progress, Lu's live position, typed target IDs, map
   north/inverse, on/off-map distance and pointer clamping,
   turned building footprints, smoothed-camera tag alignment,
   disposed-render null and the explore game-prompt transition.

**Green checkpoint:** real exploration map and labels visible,
player can follow the marker directions, and the full existing
quest/duel remains playable; check/lint/test green.

## Slice 3 — Dialogue, duel and floating damage

**Visible outcome:** dialogue uses the paper handscroll with portraits,
and the duel shows the wide rival bar and damage numbers.

**Files**

- src/lib/hud/DialogueScroll.svelte
- src/lib/hud/DamageNumbers.svelte (or integrate into WorldAnchors
  if that is simpler)
- src/lib/game/simulation/types.ts, dialogue.ts, state.ts
  and focused simulation tests
- src/routes/+page.svelte and relevant component/E2E tests

**Steps**

1. Extend HudDialogue with villagerId directly from GameMode.
   Map to the HPA-793 portrait atlas; render the current
   English speaker, line, progress dots and E Continue on
   paper. Keep the existing E/Esc dialogue progression.
   **Move** data-testid="game-prompt" from the legacy
   non-explore <p> to DialogueScroll for dialogue, retaining
   the same speaker/line text; remove the legacy prompt
   entirely. In duel, replace the obsolete prompt check in
   wuxia-mvp.e2e.ts with rival meter and technique assertions.
   Keep the WorldAnchors explore-only prompt from Slice 2;
   never expose two matching game-prompt elements.
2. Replace the small rival meter with a wide top-center bar.
   Read HudSnapshot.rivalHealth/rivalMaxHealth; keep
   aria-label=Rival health. The quest collapses to a line,
   minimap and normal names hide, and pause leaves the
   rival meter visible underneath.
3. Extend CombatEffect with **optional** damage?: number
   and target?: 'player' | 'rival'; dash effects and existing
   scene test literals keep working. In resolveActiveHits,
   attach actual applied damage (old minus clamped new health)
   and target to hit/qi effects with their existing IDs,
   positions, age and 0.65-second lifetime. toHudSnapshot
   exposes the records. Render through the real camera frame
   even after a killing blow exits duel for explore in the
   same tick; hudLayout.damageNumbers is independent of
   duel mode and hides only in pause/dialogue/open bag.
   No DOM health polling, new timer or balance change.
4. Update dialogue/duel Playwright selectors in the same
   commit: one dialogue game-prompt, no duel game-prompt,
   and the rival meter + J/K controls for duel. Component
   tests cover speaker portrait, line progress, mode
   visibility, paused rival meter, action status and hit
   amount/expiry, including the killing blow **after**
   transition to explore. Keep v2 save and reward behavior.

**Green checkpoint:** visible mockup-aligned dialogue and duel,
with damage indicator and existing combat controls; check/lint/
test green.

## Slice 4 — Named arrivals, bag/pause/results and integration

**Visible outcome:** entering Jadebank Market (or an existing shrine/
monastery region) shows the temporary brush banner, and inventory,
pause, feedback and fallback share the new paper/ink styling.

**Files**

- src/lib/hud/PlaceBanner.svelte and small region-title mapping
- src/routes/+page.svelte and page.svelte.spec.ts
- Existing bag markup or a small InventoryPanel.svelte only
  if useful; no new dependency or modal manager

**Steps**

1. Add a small bilingual region-title table and extend the
   font glyph manifest/coverage test: every region in
   world-layout.json must have a Chinese display title.
   Watch transitions of the existing HudSnapshot.region
   string and display the title only on entering one of
   **Whispering Bamboo Shrine,
   Cloudrest Monastery, Jadebank Market**. Ignore null
   travel areas and repeated frames; use one local timeout/
   transition for fade and cancel it on disposal. No
   Sect Courtyard at spawn and **no edits to
   world-layout.json**: the embedded GLB equality
   contract must stay valid without a Blender rebuild.
2. hudLayout suppresses the banner in dialogue, bag and
   pause, **but keeps item-feedback visible during bag-open
   assignment**. Style bag and pause with paper/ink tokens;
   preserve manageBagFocus trap/return, all item/slot
   actions, their data-testid hooks, and Esc/I/B guards.
   Style feedback and WebGL Retry without restart modes.
3. Test transitions between null and named regions,
   table-driven overlay visibility, temporary banner
   lifecycle and unmount, bag keyboard focus and
   scene click-through. Confirm existing GLB loader,
   asset-contract and gameplay tests remain green.
4. Retain all tests passing during consolidation;
   remove superseded old HUD CSS only after the
   equivalent new panel is visually usable.

**Green checkpoint:** actual arrival banner and modal overlays
visible; fully playable exploration and duel; check/lint/
test green.

## Slice 5 — MCP end-to-end, visual verification and cleanup

**Visible outcome:** all four Linear compositions have automated
functional coverage and four diagnostic screenshots from the
running game in this same PR.

**Files**

- src/routes/wuxia-mvp.e2e.ts and route/component tests
- HUD pure/component tests from earlier slices
- src/routes/+page.svelte, CLAUDE.md, assets/wuxia/README.md

**Steps**

1. Extend the **existing checked-in**
   src/routes/wuxia-mvp.e2e.ts with all new HUD DOM assertions
   using real WASD/E/Esc/Space/J/K/I/B. Preserve Elder,
   ordered markers, Qin/slot, v2-seeded Lu duel, actual hit,
   reward, free roam and reload; assert HUD mode visibility,
   bag focus/feedback, map pointer, prompt-ID uniqueness
   and anchor behavior. It is the **single gameplay E2E
   source** run by CI and invoked/inspected via MCP. The MCP
   agent must **not** repeat the gameplay walkthrough.
   No OS matrix or production-only test API.
2. Add a **focused arrival test in the same E2E file**,
   not another full quest replay. From spawn, use bounded
   real-key frame batches: S+D heads east across the
   **z = 0 bridge** to x >= 21, then S+A heads south along
   **x ≈ 24** toward the market at z >= 27. This avoids
   the RiceFarmhouse footprint at x = 29, z = 17.
   Use existing world waypoint/collision tests to validate
   the route; avoid blind multi-second key holds because
   SwiftShader can render below 5 fps and dt is capped
   at 0.05 seconds. Wait for PlaceBanner's **first visible**
   state and capture immediately before its fade; assert
   market title, minimap and distant quest pointer. No
   teleportation/debug endpoint or browser-only state API.
3. Add named **testInfo.attach() screenshots inside
   wuxia-mvp.e2e.ts**: hud-1-explore, hud-2-dialogue,
   hud-3-duel, hud-4-arrival at 960×640, plus 1180×720
   sanity. CI keeps the artifacts alongside repeatable
   DOM assertions for mode/content/controls/visibility.
   The MCP agent's **only additional role** is to inspect
   the Playwright-generated captures against the four
   Linear mockups and post concrete composition/contrast/
   label/overlap observations to this **same draft PR**.
   Do not run the gameplay a second time or require
   pixel baselines or human sign-off.
4. Check world tags on moving camera and after resize,
   off-map map bearing and distance, duel pause/rival
   meter, effect expiry, focus trap/return, GLB-ready
   and fallback display, and no leaks after unmount.
   For non-visual invariants, prefer cheap deterministic
   pure/component tests over a second long browser walk.
5. Remove dead old styles and redundant markup without
   a general refactor. Update CLAUDE.md and the asset
   README to document the component tree, map/camera
   math, HPA-793 atlas indices, font/glyph file and
   test commands. Preserve all gameplay, collision
   and persistence behavior.
6. Run bun run check, bun run lint and bun run test.
   Verify the existing GitHub Actions build/lint, unit
   and Playwright workflows. Attach screenshots and
   acceptance results to **this draft PR** before
   marking it ready; keep HPA-792 Todo until the actual
   implementation and automated acceptance pass.

## End-to-end acceptance criteria

Criteria below apply to the **implementation**, not this
planning-only revision. There is **no human acceptance** step.

1. **One repeatable CI/MCP browser E2E (one platform):**
   the checked-in Playwright tests, invoked/inspected via
   browser-capable MCP and run in existing Linux Chromium
   CI, use real input from clean progress through Elder,
   markers, Qin/slot and seeded Lu duel, killing blow,
   victory, free roam and reload. All controls, focus,
   market arrival and prompt-ID transitions work at
   960×640. No duplicate agent gameplay run.
2. **Visual checks using Linear mockups:** Playwright
   testInfo.attach records four named 960×640 state
   screenshots and a 1180×720 sanity capture in CI.
   The MCP agent visually compares those **existing**
   artifacts with the four Linear mockups and records
   concrete pass/fail results in this PR. DOM tests
   assert mode visibility, content, prompt uniqueness,
   meters and controls. No duplicate screenshot flow,
   pixel goldens, human sign-off or OS matrix.
3. **Pure and component tests:** hudLayout modes and
   overlays (including explore killing-blow numbers and
   bag-open item-feedback), Vitals, QuestScroll,
   DialogueScroll, actual nullable renderer frame,
   inverse map math, live quest/interact positions
   including the bell, off-map edge pointer, footprint
   turns, CJK glyph/region coverage, hit effect
   lifetime and region transitions pass.
4. **Regression and lifecycle:** paused duel retains
   rivalHealth/rivalMaxHealth, the final damage number
   survives duel-to-explore for its remaining lifetime,
   bag focus returns and feedback remains visible on
   assignment, single game-prompt moves safely across
   slices, anchors use the actual camera frame, the GLB
   equality contract is unchanged, and neither gameplay
   nor save format/art/SFX changes.
5. **Quality gates:** bun run check, bun run lint,
   bun run test, and existing Actions build, unit and
   Playwright workflows pass on the latest commit.
   A single-platform browser acceptance run suffices;
   there is no macOS/Windows-specific HUD implementation.
   Mobile/touch/gamepad checks are out of scope.

## Deliberately omitted

Sect Courtyard layout mutation/GLB rebuild, a second camera
or snapshot projection type, Noto Serif SC, the dead Strike
cooldown sweep, new quest engine, UI store/framework, art/SFX
generation, a second PR, full-map E2E replay, OS runner matrix,
save migration, mobile/touch/gamepad design, and manual sign-off.
