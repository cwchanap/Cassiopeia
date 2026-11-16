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
   CJK glyph from quest titles, fixed HUD labels and the bilingual
   title table is in that file; every existing world-layout.json region
   must have a bilingual title. Fonttools is a build-time-only
   dependency; the browser must never contact a font CDN.
3. Add the small pure hudLayout(hud) selector in src/lib/hud/layout.ts.
   It returns visibility booleans for vitals, map, anchors, techniques,
   rival bar, dialogue and banner plus quest display mode
   (full/line/hidden). Table-test explore/dialogue/duel × pause × bag.
   In particular, keep the rival bar behind a duel pause; hide all
   normal chrome when the bag opens; dialogue hides other chrome.
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
   interactTargets(state) by the active step's targetId, so Lu
   uses state.rival.position. For gate markers use the next
   DASH_MARKERS[stepProgress]. Return null on free roam.
   Narrow QuestStep.targetId to InteractTargetId or gate_markers;
   do not duplicate the quest target table or villager positions.
3. Add worldDirectionToScreen beside the existing
   screenDirectionToWorld in camera.ts; use the same sine/cosine
   basis and a round-trip/orthogonality test. The round SVG map
   uses it for road/river/bridge/building geometry from the
   *unchanged* world-layout.json, and for north/target bearings.
   Use the exact building turn % 2 footprint swap already in
   world.ts; share a pure helper or test the parity explicitly.
   A target outside the map radius gets a rim arrow and rounded
   straight-line metres. No canvas renderer, fog, navigation or
   extra map image.
4. Return a frame from WuxiaScene.render(state, dt) with the
   **actual interpolated pose** and CSS-pixel viewport, typed
   with WuxiaCameraPose and WuxiaViewport from camera.ts.
   Runtime accepts onHudUpdate(snapshot, optionalFrame); its
   requestAnimationFrame loop sends both after render. Its
   zero-dt inventory publishes send snapshot only. The route
   stores the projection frame in independent $state and updates
   it only when provided. **Do not** add projection to
   HudSnapshot or copy camera types into simulation.
5. WorldAnchors projects each head/quest marker using
   projectWorldToScreen(point, frame.pose, frame.viewport),
   hiding off-frustum and initial-no-frame tags. Show E only
   for hud.interactTarget, anchor it to the correct villager
   or bell, and keep existing game-prompt test ID. Keep
   pointer-events:none and verify canvas CSS-pixel positioning
   at 960×640 and after a resize, including a moving camera
   with real follow lag.
6. Focused tests cover target switching through all five
   stages, marker progress, Lu's live position, type-safe
   IDs, map north/inverse, on/off-map distance and pointer
   clamping, footprint turn parity, smoothed-camera tag
   alignment and zero-size/initial missing projection.

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

1. Extend HudDialogue with villagerId directly from
   GameMode's stable ID. Map it to the HPA-793 portrait
   atlas; render the current English speaker, line,
   progress marks and E Continue on a rice-paper scroll.
   Existing E/Esc progression stays in simulation. Preserve
   one data-testid=game-prompt with the speaker/line.
   hudLayout hides the rest of the HUD while in dialogue.
2. Replace the small rival meter with a wide top-center bar.
   Read HudSnapshot.rivalHealth/rivalMaxHealth; keep
   aria-label=Rival health. The quest collapses to a line,
   minimap and normal names hide, and pause leaves the
   rival meter visible underneath.
3. In resolveActiveHits, record the actual **applied**
   damage (old health minus clamped new health) and target
   actor on the existing hit/qi CombatEffect. Reuse its
   original ID, world position, age and 0.65 s expiry;
   only read live damage-number records through
   toHudSnapshot. No DOM polling for health deltas, new
   timer or gameplay balance change. Project text through
   the actual renderer frame and fade it.
4. Update existing Playwright dialogue and duel selectors,
   with focused component assertions for speaker portrait,
   line progression, the visibility selector, rival meter
   during pause, attack activity and hit value/expiry.
   Keep the same v2 save and post-victory result behavior.

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

1. Watch transitions of the existing HudSnapshot.region
   string, and display the corresponding bilingual region
   title only on entering one of **Whispering Bamboo Shrine,
   Cloudrest Monastery, Jadebank Market**. Ignore null
   travel areas and repeated frames; use one local timeout/
   transition for fade and cancel it on disposal. No
   Sect Courtyard at spawn and **no edits to
   world-layout.json**: the embedded GLB equality
   contract must stay valid without a Blender rebuild.
2. hudLayout suppresses the banner in dialogue, bag and
   pause. Style the bag and pause with shared paper/ink
   tokens while retaining manageBagFocus trap/return,
   all item/use/equip/quick-slot hooks and Esc/I/B guards.
   Style existing feedback and WebGL fallback Retry
   without resurrecting results/restart modes.
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

1. Have a browser-capable **MCP** agent execute one desktop
   E2E acceptance flow at 960×640, using real WASD/E/Esc/
   Space/J/K/I/B and Playwright's existing seeded-v2-save
   shortcut for the Lu duel. Check Elder dialogue, ordered
   dash markers, medicine/slot assignment, duel damage,
   one reward, free roam and reload. Reuse the current
   Playwright e2e as the repeatable CI check. No separate
   macOS/Windows matrix and no production debug API.
2. For the arrival composition, use a focused bounded
   real-input route to an existing named region (the
   Jadebank Market mockup is the target), rather than
   replaying a long full five-step quest route. Check
   region name, banner, map and distant quest pointer.
   If the route needs stabilization, use the pure world
   waypoint/collision test as its guide; do not teleport
   by adding a production-only state mutation API.
3. Attach named screenshots from the game for
   **hud-1-explore**, **hud-2-dialogue**, **hud-3-duel**
   and **hud-4-arrival** at 960×640, plus a 1180×720
   layout sanity capture. The MCP agent visually compares
   them to the four existing Linear mockups and records
   concrete composition/contrast/label/overlap results
   in this PR. DOM assertions separately verify visible
   mode elements and text, resource meters, controls and
   numeric data. No pixel baselines and no human review/
   sign-off acceptance gate.
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

1. **MCP-controlled desktop browser E2E (one platform):**
   from clean v2 progress, real inputs complete the
   Elder/markers/Qin/bag opening, then the existing
   save fixture reaches Lu duel, damage displays, victory,
   free roam and reload. Interactions and focus/keyboard
   controls still work at the existing 960×640 viewport.
2. **Visual checks using Linear mockups:** the browser
   agent captures four state screenshots at 960×640 and
   a 1180×720 layout capture, compares them visually to
   the attached explore/dialogue/duel/Jadebank Market
   mockups, records results and failures in the PR, and
   leaves diagnostic artifacts. DOM tests assert the
   actual visible/hidden mode elements and their content.
   No goldens, human sign-off or platform-specific matrix.
3. **Pure and component tests:** hudLayout table,
   Vitals health/qi, QuestScroll five stages/completion,
   DialogueScroll speaker/line/portrait, real camera
   frame and inverse transform, questTarget live location,
   SVG target clamp and north, exact building orientation,
   font glyph/region mapping, effect amount/expiry,
   and region transitions all pass.
4. **Regression and lifecycle:** duel pause keeps
   rivalHealth/rivalMaxHealth visible; bag focus returns
   and blocks openings in dialogue/pause; world anchors
   do not drift with camera smoothing; Three.js GLB
   equality contract is unchanged; no new save format,
   quest mechanics, art or SFX. The app remains playable
   in the existing Linux Chromium automated CI.
5. **Quality gates:** bun run check, bun run lint,
   bun run test, and existing Actions build, unit and
   Playwright workflows pass on the latest commit.
   A single-platform browser acceptance run suffices:
   there is no macOS/Windows-specific HUD implementation.
   Mobile/touch/gamepad checks are out of scope.

## Deliberately omitted

Sect Courtyard layout mutation/GLB rebuild, a second camera
or snapshot projection type, Noto Serif SC, the dead Strike
cooldown sweep, new quest engine, UI store/framework, art/SFX
generation, a second PR, full-map E2E replay, OS runner matrix,
save migration, mobile/touch/gamepad design, and manual sign-off.
