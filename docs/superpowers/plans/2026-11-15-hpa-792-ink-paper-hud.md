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

Prefer the smallest maintainable component split. The existing SvelteKit route
remains the owner of a single runtime and one HudSnapshot. Simulation logic stays
pure and mutates only through stepGame; the renderer remains the owner of camera
smoothing and WebGL lifecycle. Components under src/lib/hud/ consume only
HudSnapshot as live data. Shared CSS tokens belong in one stylesheet. Do not
introduce a store library, UI framework, generalized anchoring system, second
camera calculation, new save version, migration, or separate art-generation work.

Implement as **five green, playable vertical slices**, all on the existing
HPA-792 branch/PR. A slice is integrated, compiled, tested and reviewable
before the next; keep old HUD sections until their replacement and existing
Playwright selectors are ready in the same commit. Re-run focused tests while
iterating; run the complete quality gate before marking implementation done.
The mandatory CI jobs remain the existing workflows.

## Slice 1 — Presentation snapshot and camera bridge

**Files**

- src/lib/game/simulation/types.ts, state.ts, dialogue.ts, villageContent.ts
- src/lib/game/simulation/state.spec.ts and dialogue.spec.ts
- src/lib/game/render/createWuxiaScene.ts, camera.ts and camera.spec.ts
- src/lib/game/runtime/createGameRuntime.ts and createGameRuntime.spec.ts
- src/lib/game/world-layout.json and world.spec.ts

**Work**

1. Add read-only HUD presentation fields without changing quest mechanics:
   player position, chain title/total steps/completed state, current target
   world position, dialogue villager ID, and display region. Resolve the target
   in one pure helper: Elder Shen; the next actual dash marker (by stepProgress);
   Auntie Qin; the shrine bell; Senior Brother Lu; or null after victory.
   Keep quest goals authored in villageContent.ts, not duplicated in the page.
2. Add one named Sect Courtyard region rectangle in world-layout.json for the
   arrival banner at spawn. Verify it does not overlap the Shrine/Monastery/
   Market region bounds or alter buildings, collisions or pathfinding. Retain
   world.ts regionAt as the region data reader. No GLB geometry rebuild.
3. Add optional HudSnapshot.projection: a plain readonly camera pose +
   viewport record, null until a camera frame exists. WuxiaScene.render()
   returns the **actual interpolated** pose and CSS-pixel viewport after its
   existing followCameraPose/resize logic. In the runtime loop, render first,
   then publish the ordinary toHudSnapshot(state) plus that projection frame.
   Zero-dt inventory-command publishes reuse the most recent frame. Preserve
   the existing mount/start/dispose API, one animation loop, and initial
   toHudSnapshot(createInitialGameState()) page setup.
4. Retain the existing projectWorldToScreen(point, pose, viewport) math. Test
   a moving camera at distinct frames so a name tag does not jump to a desired
   but not-yet-followed camera pose. Cover offscreen and zero-size viewports,
   including resize and duel framing. Do not create a new camera follower in UI.
5. For damage numbers, add optional actual damage and target identification
   to existing hit/qi CombatEffect records only. Compute the displayed damage
   from health actually removed (capped by remaining health); dash effects have
   no damage number. Project active effect positions with their existing
   elapsed/age and expiry. The simulation remains the single source of hit
   occurrence; UI does not infer hits by comparing health between frames.
6. Tests: start-up snapshot contains known quest target, completed quest has
   no target, dialogue portrait ID matches the speaker, marker target advances,
   regionAt returns courtyard at spawn, smoothed frame matches the renderer,
   hit number is emitted once and expires, and runtime dispose remains safe.

**Checkpoint:** run focused simulation/render/runtime tests, bun run check,
bun run lint and bun run test. Existing quest gameplay remains playable with
its temporary HUD.

## Slice 2 — Tokens, fonts, vitals, medallions, and modal restyle

**Files**

- New src/lib/hud/hud.css and src/lib/hud/Vitals.svelte
- New src/lib/hud/TechniqueBar.svelte, optionally InventoryPanel.svelte
- src/routes/+page.svelte and src/routes/page.svelte.spec.ts
- static/fonts/wuxia/ subset font files and redistributable license text
- Existing static/images/wuxia/ assets (referenced, never regenerated)

**Work**

1. Extract the six palette tokens, modest shadows/brush shapes, paper texture,
   focus outlines and reduced-motion treatment to hud.css. Self-host small
   licensed WOFF2 subsets for Ma Shan Zheng, Noto Serif SC and Cormorant
   Garamond, covering fixed hanzi and quest titles. Keep English legible if
   fonts fail. Avoid runtime requests to Google Fonts or other CDNs.
2. Replace the top-left status box with Vitals: 112px-class round portrait,
   rank seal 初, English name, native accessible Health/Qi meters overlaid
   with brush-shaped progress fills, numbers, 气血 and 内力. Delete the
   action-status row, but leave any gameplay action status in the model
   untouched. Keep data-testid=status-cluster and the Health/Qi meter
   accessible names and numeric semantics for existing tests.
3. Replace the bottom tile strip with TechniqueBar: the existing eight atlas
   cells, round medallions, key legends and item counts. Dim J/K when not
   dueling; show a conic-gradient sweep and remaining seconds using existing
   DASH_COOLDOWN/LIGHT_ATTACK_COOLDOWN/QI_BURST_COOLDOWN. Maintain disabled
   buttons and quick-slot IDs. Keep I/B and 1–3 inventory behavior.
4. Retheme bag, pause, error fallback and existing feedback/result note.
   Preserve *all* inventory item, assign/use/equip IDs and the current
   manageBagFocus attachment and focus return. Check the transparent HUD
   overlay still allows keyboard scene input but does not click through modal
   controls. The result is the existing win/defeat feedback, not a new mode.
5. Update the route component test and browser opening selectors in the same
   slice so old test IDs remain meaningful. Use the shared art atlas indices
   rather than a new image mapping or generated icons.

**Checkpoint:** vitals/techniques render in a real browser, bag use/assign/
focus-return work, pause and fallback remain usable; check, lint and test pass.

## Slice 3 — Quest scroll, SVG minimap and world anchors

**Files**

- New src/lib/hud/QuestScroll.svelte, MiniMap.svelte, WorldAnchors.svelte
- New src/lib/hud/map.ts for small pure geometry helpers and map.spec.ts
- src/routes/+page.svelte and route/component tests
- src/lib/game/world-layout.json (already updated in Slice 1)

**Work**

1. Render the hanging scroll with chain name, active bilingual step title,
   English instruction, active/complete marks for five stages and marker
   progress (0/3 to 3/3). When quest=null, keep one short free-roam state.
   Preserve data-testid=objective-chip, including the quest text the
   existing E2E suite searches for. Collapse this scroll to a one-line
   version only while mode=duel; hide it during dialogue.
2. Build a single SVG round viewport, centered on the player, with roads,
   river, bridges, building footprints and region outlines from the existing
   world-layout.json. Map world coordinates to a fixed 45-degree
   screen-aligned view with the same screenDirectionToWorld basis that drives
   movement. Draw a fixed player marker and 北 north direction. Overlay the
   currently authored quest goal. For a point outside the circle, clamp to
   the rim and display its outward direction and rounded straight-line
   distance in metres. Hide entirely during dialogue/duel/bag. Do not add
   fog, texture baking, zoom, a navigation mesh, or extra map art.
3. Project each villager head with projectWorldToScreen and the **actual
   HudSnapshot.projection**. Hide out-of-frustum tags. Differentiate the
   active quest villager with the diamond, and render E prompt only when its
   stable ID equals hud.interactTarget.id; include the shrine bell object
   interaction. Keep the existing data-testid=game-prompt on whichever
   current exploration prompt is visible, rather than maintaining two
   competing prompt nodes.
4. Prevent projected labels from blocking scene clicks (pointer-events:none);
   position relative to scene-host CSS pixels, not WebGL drawing-buffer
   pixels. Clamp/hide near HUD corners as needed without introducing a
   collision-avoidance engine. Use fixed appropriate head-height offsets.
5. Unit tests: map north/target bearings, player-centered transform, bridge
   positions, target 0 m/in-range/out-of-range clamp, actual pose projection,
   offscreen/edge names, and current target switch across all quest steps.
   Component tests cover quest dots, progress, completion and the prompt.

**Checkpoint:** exploration and arrival scenes are usable with camera motion,
map pointer correctly guides to the distant shrine/market target; check,
lint and test pass.

## Slice 4 — Dialogue, duel, floating damage and place arrival

**Files**

- New src/lib/hud/DialogueScroll.svelte and PlaceBanner.svelte
- New src/lib/hud/DamageNumbers.svelte (or integrate into WorldAnchors if simpler)
- src/routes/+page.svelte and route/component tests
- src/lib/game/simulation/dialogue.ts/state.ts and focused tests

**Work**

1. Dialogue uses the matching HPA-793 portrait atlas cell, the current
   English speaker and line, progress dots and E Continue. Keep all
   dialogue progression in existing simulation/dialogue.ts. Hide status,
   quest, minimap, labels and medallions in dialogue. Preserve a single
   data-testid=game-prompt containing the speaker/current line so the
   established E2E assertions continue to work.
2. Duel shows player vitals, wide enemy native meter at top center,
   collapsed quest and medallions, with no minimap or village name tags.
   Keep meter aria-label=Rival health. DamageNumbers projects damage
   effects above player/rival to CSS pixels and fades with their existing
   0.65-second lifetime. No timers or collision changes to produce numbers.
3. PlaceBanner watches changes in hud.region and shows the matching
   bilingual name (Sect Courtyard, Shrine, Monastery, Market). Show once on
   initial spawn and on entering a *different* named region; ignore null
   transit areas. Fade after a short presentation duration using one local
   component state/transition; do not persist banner state or modify
   quest progression. Hide it during dialogue and bag/pause overlays.
4. Keep Escape behavior in dialogue/duel and bag guards unchanged. Restyle
   the victory/defeat notification but do not create a separate results
   modal or restore the old restart API. Use pointer-events:none on
   purely decorative world labels and damage indicators.
5. Component tests: portrait index per speaker, line progress, correct
   hide/show for explore/dialogue/duel, rival health on paused duel,
   damage amount/expiry, arrival region transitions, and safe missing
   camera frame.

**Checkpoint:** dialogue and the full duel remain playable; every four-mode
layout is visually close to the matching ticket mockup; check, lint and
test pass.

## Slice 5 — E2E visual acceptance, cleanup and documentation

**Files**

- src/routes/wuxia-mvp.e2e.ts and src/routes/page.svelte.spec.ts
- Focused src/lib/hud/*.spec.ts or pure tests beside the helpers
- src/routes/+page.svelte, CLAUDE.md and assets/wuxia/README.md

**Work**

1. Update the existing Playwright keyboard quest test to retain gameplay,
   potion/slot assignment, final duel, one reward, free roam and reload.
   The long trip to the shrine is already covered by the deterministic
   Node gameplay journey; don't add a second flaky timed full-map browser
   walk. Reuse the real v2 save seed to reach step five when testing duel
   and reward states. No production-only test hooks.
2. Capture four **named diagnostic screenshots** as Playwright attachments
   at 960×640: exploration, dialogue, duel and Jadebank Market arrival.
   Create a short automated visual-review checklist in the test or PR
   description explicitly comparing each to hud-1-explore.jpg through
   hud-4-arrival.jpg from Linear. Include a 1180×720 resize/layout sanity
   capture. Do not commit brittle pixel-baseline files or require human
   review as an acceptance condition.
3. Validate realistic overlays: off-map shrine target at market with
   directional rim arrow and distance, world labels aligned while following
   camera, non-intercepting click targets, dialogue hiding, paused duel rival
   meter, focus trapping and restore in bag, and win/defeat feedback after
   overlay transitions. Check GLB-ready and procedural fallback when feasible
   using existing renderer tests.
4. Remove superseded +page styles, redundant objective/prompt markup, and
   dead CSS. Keep reusable HUD components lean; avoid splitting static
   fragments just to increase the component count. Update CLAUDE.md and
   assets/wuxia/README.md to explain the new snapshots, art indices,
   layout tokens and testing commands.
5. Run bun run check, bun run lint, bun run test and verify the existing
   GitHub Actions build/lint, unit and Playwright workflows. Add results
   and diagnostic screenshot links to this **same draft PR** before moving
   it out of draft. Do not mark HPA-792 Done solely because the plan is merged.

## End-to-end acceptance criteria

These are implementation acceptance criteria, **not** claims about the docs-only
draft PR. No human sign-off requirement is included.

1. **macOS desktop browser:** run the OS-neutral keyboard Playwright flow
   from a clean localStorage state. At 960×640, the player speaks with Elder,
   completes the marker/medicine bag interactions, reaches the seeded duel
   flow, sees damage numbers and correct cooldown, wins once and reloads into
   free roam. All four screenshots are programmatically captured and checked
   against the corresponding ticket mockup checklist. Inspect bag focus,
   pause, 1180×720 resize and off-map quest pointer.
2. **Windows desktop browser:** run the **same** Playwright commands and
   assertions (no OS-specific gameplay code). Verify the exact same four
   HUD modes, visual mockup checks, keyboard E/Esc/J/K/I/B bindings, bag
   focus-return, duel result and reload. The suite must be runnable on
   Windows even if no dedicated Windows CI runner is provisioned; do not
   claim execution without logs.
3. **Shared logic and accessibility:** Vitals, QuestScroll and
   DialogueScroll component tests pass; pure minimap and camera projection
   tests cover offscreen/edge/camera-follow behavior; hit numbers reflect
   resolved health changes only. Existing meter aria labels, quick-slot IDs,
   quest selectors, and bag focus trap remain intact.
4. **Visual/source-of-truth match:** hud-1 through hud-4 reflect their four
   Linear mockups (composition, imagery, paper/ink tokens, language and
   on-screen hints), with art read from HPA-793's already committed
   resources. No extra art/SFX work is bundled into the coding task.
5. **Automated gate:** existing CI workflows pass with bun run check,
   bun run lint and bun run test. Linux and Android have CI-only coverage,
   no separate user-facing acceptance; iOS touch controls/layout remain
   explicitly out of scope for this keyboard-first prototype.

## Deliberately omitted

A generalized HUD state machine, new UI packages, mobile layouts, a second
camera state, a standalone minimap rendering engine, gameplay tuning,
localization, generated art/SFX, save migration, a cross-OS CI matrix,
committed screenshot goldens, and any second PR for HPA-792.
