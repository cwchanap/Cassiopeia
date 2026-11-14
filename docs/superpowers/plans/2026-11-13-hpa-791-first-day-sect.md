# HPA-791 — First Day at the Sect (Implementation Plan)

**Design spec:** [2026-11-13-hpa-791-first-day-sect.md](../specs/2026-11-13-hpa-791-first-day-sect.md)  
**Linear:** [HPA-791](https://linear.app/cwchanap/issue/HPA-791/village-quest-chain-first-day-at-the-sect)  
**Base:** current `main` with HPA-790's isometric camera and CI in place.  
**Delivery:** **Exactly one PR for HPA-791**. These steps are implementation checkpoints and commits in the same draft PR, not follow-up PRs.  
**Current status:** Planning only. The documentation PR does not implement or validate gameplay.

## Working rules

Keep YAGNI/KISS: no general quest engine, persistence framework, event bus, AI system, or compatibility layer. Simulation stays pure TypeScript; `stepGame` owns state changes, `toHudSnapshot` owns the HUD read boundary, and Three.js reads state without applying gameplay rules. Every new static character reuses existing models/colors; no asset-generation task is required.

Preserve the existing architecture and controls:

- `src/lib/game/input/createInputController.ts` already maps WASD/arrows to screen-aligned movement and sends a single E edge event; reuse it unchanged unless a failing integration test identifies a specific need.
- `src/lib/game/simulation/world.ts` / `world-layout.json` already enforce building, wall, water, bridge and bounds collisions. Do not create a second collision system.
- `src/lib/game/simulation/items.ts` already handles inventory, quick slots, consumables, equipment-derived max stats and randomized rewards. Use those functions; do not fork item logic.
- `src/lib/game/render/camera.ts` already supports duel/non-duel framing and has a pure world-to-screen helper. Only adjust its phase input to the new mode contract; leave projection/orientation unchanged.
- The existing production-build Playwright journey tests mentor → one dash → duel → restart. Replace obsolete phase/restart assertions, retaining bag, focus, reward, loading, input and persistence coverage.

## Step 1 — Add authored village content and pure interaction/dialogue/quest helpers

**Files**

- `src/lib/game/simulation/villageContent.ts` (new)
- `src/lib/game/simulation/interaction.ts`, `interaction.spec.ts` (new)
- `src/lib/game/simulation/dialogue.ts`, `dialogue.spec.ts` (new)
- `src/lib/game/simulation/quest.ts`, `quest.spec.ts` (new)
- `src/lib/game/simulation/types.ts` (shared plain-data types)

**Work**

1. Define exactly five stable villager IDs and positions, with Elder Shen = existing mentor (-4,-3) and Senior Brother Lu = existing rival near the ring. Add Auntie Qin in a walkable spot beside the Herbalist at (5,-10), Old Zhu near the Bamboo Shrine frontage at (-44,-18), and Peddler Wei near the walkable Jadebank Market road. Store names, robe colors, role, and English dialogue lines as content; no schedules or extra AI.
2. Define one ordered five-step `FIRST_DAY_QUEST` array with stable IDs, display hanzi/English title, one-line instruction, target ID, and completion kind. Keep existing combat action and item IDs untouched. Define three ordered dash-marker positions on the open courtyard/gateway route and a bell position on the approach to the shrine.
3. Verify all villager, marker, and bell positions through `canStandAt` in Node tests (the collision radius includes a 0.28 m body and the gateway has wall fixtures). Adjust **data positions**, not collision or world geometry. A dash-marker sweep along its segment may intersect a marker even when the dash ends past its center.
4. `interaction.ts`: pure nearest-in-range selection with one 1.5 m range and deterministic ties, excluding inactive quest objects/markers. Tests: closest eligible target, no target outside radius, ambient NPC target, blocked/wrong-step quest target, tie behavior.
5. `dialogue.ts`: pure start/advance/finish with one E edge per line; return a completion event only after the last line. Test no skipping, empty/missing lines handled at data-validation time, and non-quest ambient dialogue never advancing a step.
6. `quest.ts`: helpers to expose current step and advance it from typed events; test all five steps, wrong-order events, only one step change per valid completion, full-chain completion, and mid-step state. Implement a small point-to-segment proximity check for ordered marker crossings. A valid dash consumes at most one marker, and cooldown/blocked/non-dash movement never advance it.

**Checkpoint:** `bun x vitest run src/lib/game/simulation/interaction.spec.ts src/lib/game/simulation/dialogue.spec.ts src/lib/game/simulation/quest.spec.ts` and `bun run check`. No renderer or UI dependency appears in simulation imports.

## Step 2 — Replace the phase machine with quest-driven game modes

**Files**

- `src/lib/game/simulation/state.ts`, `state.spec.ts`
- `src/lib/game/simulation/types.ts`
- `src/lib/game/render/camera.ts`, `camera.spec.ts`
- `src/lib/game/runtime/createGameRuntime.ts` (type and initial-state callers)
- `src/lib/game/render/createWuxiaScene.ts` (temporary initial-state and mode call sites)

**Work**

1. Remove `GamePhase` / `ActiveGamePhase` and old objective constants; use `mode`, `previousMode`, `quest` and nullable `dialogue`. The initial state starts at step 1 (or a saved quest progress supplied by the runtime) in exploration. Derive objective and prompt from current quest content rather than storing a second independently mutated phase string.
2. Keep one `stepGame` path, with early returns for pause, inventory and dialogue. Route E to the nearest eligible villager/object while exploring, or advance current lines while in dialogue. Do not move, dash, attack, use quick slots or tick enemy AI while dialogue/overlays are active. Esc toggles paused ↔ prior mode; bag commands and existing focus rules still work outside dialogue.
3. After Elder Shen's last line, increment quest. Recognize successful dash motion through marker 1, then 2, then 3; disallow accidental progression from the `input.dash` flag alone. Expose partial marker progress in snapshot and objective/prompt text.
4. Handle Auntie Qin's dialogue ending once: grant two `lesser_healing_pill` and set `medicineReceived`. Reuse existing inventory UI command `assignQuickSlot` to recognize a deliberate assignment of those healing pills after the dialogue; do not auto-complete from starter slot 1. Preserve the one-time grant even if the dialogue repeats. A corresponding quick-slot key use remains available in duels.
5. Handle E at the shrine bell (in range) to complete step 4. Derive `currentRegion` from existing `layout.regions`; return null elsewhere, without adding map geometry.
6. Expand `toHudSnapshot` with mode, quest title/step/progress, current dialogue speaker/line/index, nearby interaction target, villager locations, active target location and region; retain existing vital/equipment/quick-slot fields. Update the camera tests and `computeWuxiaCameraPose` input: duel framing applies only to `mode === 'duel'`, including when paused from a duel. Do not change the fixed camera or its pure projection math.
7. Replace old `state.spec.ts` phase setup helpers with quest-to-duel setup helpers while preserving combat and item assertions. Add tests for dialogue freeze, ESC/bag gating, marker progression, medicine idempotence, region result, incorrect step interactions, and derived HUD data. Update the renderer's hard-coded `createInitialRenderState` to reuse a real initial game state rather than maintaining a duplicate shape.

**Checkpoint:** `bun x vitest run src/lib/game/simulation src/lib/game/render/camera.spec.ts` and `bun run check`. Obsolete phase types/strings are removed, not supported through compatibility aliases.

## Step 3 — Complete the duel, defeat respawn, and free-roam loop

**Files**

- `src/lib/game/simulation/state.ts`, `state.spec.ts`
- `src/lib/game/simulation/quest.ts`, `quest.spec.ts`

**Work**

1. Show the rival as an idle stationary NPC when not dueling. E on Senior Brother Lu starts a duel **only at step 5**, after the player has returned from the shrine. Start from a legal courtyard/ring position, reset the rival to its anchored spawn, restore player health/qi to equipment-derived maxima, clear temporary action/cooldown state and activate the existing rival AI. Reuse ``canStartAction`, `updateRival`, `resolveActiveHits`, and the existing timing/damage rules.
2. On rival death, call `grantVictoryReward(state.items)` exactly once, mark step 5 complete, deactivate the rival and return to exploration. Keep the reward in the existing item progress and show it through the existing HUD feedback. The player may immediately continue walking and open the bag; no `victory` terminal mode or restart requirement.
3. On player death, respawn safely in the courtyard at playable health/qi, clear combat action/effects, deactivate/restore the rival's standing location and return to exploration with step 5 still pending. E on the rival begins a rematch with full resources. Do not give the reward on defeat and do not modify item/equipment progression.
4. Test one-time victory reward, post-win movement and bag usage, defeat respawn, no free reward on rematch start, paused duel resume and fresh duel resources. Preserve the old startup/active/recovery/hitstun regression tests.

**Checkpoint:** `bun x vitest run src/lib/game/simulation/state.spec.ts` and `bun run check`.

## Step 4 — Persist quest and items together under a new key

**Files**

- `src/lib/game/runtime/save.ts`, `save.spec.ts`
- `src/lib/game/runtime/createGameRuntime.ts`, `createGameRuntime.spec.ts`
- `src/lib/game/simulation/types.ts` and/or `quest.ts` for validated progress type

**Work**

1. Replace the old item-only adapter with `loadGameProgress` / `saveGameProgress` using `cassiopeia.gameProgress.v2`, storing `{version: 2, items, quest}`. Keep `ItemProgress.version === 1` inside the new envelope; apply existing `normalizeItemProgress`, and validate quest step 0–5, marker 0–3, medicine flag, and combinations appropriate to the active step.
2. Ignore `cassiopeia.itemProgress.v1` completely. Missing, invalid, or inaccessible v2 storage starts with fresh items and step 1. No migration, storage shim, or silent preservation of the old item save.
3. Runtime loads quest/items together, creates exploration state, and persists only when the serialized envelope changes. Keep existing retry-on-write-failure behavior: advance `lastSaved` only after success. Transient dialogue/mode, position, duel state and UI overlays are not serialized.
4. Update `createGameRuntime.spec.ts` mocks and tests for new method names and combined payload; test failed-write retry, save after marker/bag updates, load/resume mid-marker step, reload after medicine pickup (no second grant), completion after reload, and malformed older data.

**Checkpoint:** `bun x vitest run src/lib/game/runtime` and `bun run check`. Storage remains browser-only and graceful when unavailable.

## Step 5 — Draw villagers, dash markers, and bell without new art

**Files**

- `src/lib/game/render/createWuxiaScene.ts`
- `src/lib/game/render/createWuxiaScene.spec.ts` (or focused new renderer-helper tests)
- `src/lib/game/render/wuxiaAssets.ts` only if a minimal asset-clone helper is required

**Work**

1. Render Elder Shen and Senior Brother Lu using existing targets, visible at their data-defined locations while idle. Add Auntie Qin, Old Zhu and Peddler Wei with `createDisciple` in distinct robe colors. Avoid a generalized NPC renderer.
2. When `mountain-sect.glb` loads, clone an existing disciple mesh/group for these three villagers, share immutable geometry, clone/tint only materials that need distinct robe colors, and register owned materials for disposal. Do not add new loader targets requiring GLB model names the file does not contain. Fall back to procedural villagers if the GLB is missing/fails.
3. Draw the three quest marker meshes in the courtyard/gate during step 2, emphasizing only the next marker; draw a simple interactable bell at the shrine using primitives. Markers and bell are **visuals only**; their trigger positions and progress remain the pure content/simulation data. Reuse existing scene ownership/disposal patterns. No scene text sprites or new art files.
4. Map scene actor positions from the same content/state used by simulation; when a duel starts, existing rival movement/attack rendering continues. In exploration, keep rival visible at the data-defined courtyard position.
5. Test presence/visibility of five villagers, marker step switching and object cleanup, plus both `data-assets="ready"` and `fallback` paths. Avoid GPU leaks when the route is unmounted/remounted.

**Checkpoint:** `bun run check` and targeted renderer tests. Confirm the GLB loader still accepts only `Player`, `Mentor`, `Rival` and `Village` from the existing file.

## Step 6 — Minimal temporary HUD, end-to-end journey and documentation

**Files**

- `src/routes/+page.svelte`, `src/routes/page.svelte.spec.ts`
- `src/routes/wuxia-mvp.e2e.ts`
- `CLAUDE.md`, `assets/wuxia/README.md` (update only gameplay/runtime paragraphs)

**Work**

1. Replace obsolete `phaseLabel` / phase-dependent status checks with quest/mode fields. Retain the objective chip and prompt line as temporary display: title in hanzi/English, marker 1/3–3/3, the current dialogue line/speaker, medicine quick-slot instruction, E interaction text, and quest completion/reward. Keep current bag layout, quick-slot buttons, pause overlay, focus restoration and existing `data-testid` hooks.
2. Hide combat/action hints in dialogue; block bag UI there. Keep duel vitals, rival bar and cooldown readout in duel only. Remove `showRestart`/`end-state` result gating and the old `restart-button` path for normal wins/defeats. Do not implement HPA-792 paper UI or world-anchored tags.
3. Replace the existing short Playwright journey with the actual five-step route through walkable village corridors, using WASD/arrow inputs, E, three legal dashes, bag quick-slot assignment, bell E and duel attacks. Keep the current item-count/reward assertions and the software WebGL timing safeguards. Add a second focused reload-at-mid-step test and a defeat/rematch test using real inputs or deterministic in-page simulation hooks only if already exposed; do not add production debug APIs for tests.
4. Make visual assertions/screenshot references at 960×640 and 1440×900 for the new in-world markers/bell/villagers and the temporary dialogue/objective text. HPA-791 contains no UI mockups; do **not** treat HPA-792's four art-direction mockups as acceptance targets, and do not create HUD art for this ticket.
5. Run the full suite, fix issues within this **same PR**, and update architecture documentation to describe modes, content-driven quest, five villagers, E interaction, free roam and new save key. Document that the current HUD presentation is temporary until HPA-792.

**Validation commands**

```sh
bun install --frozen-lockfile
bun run check
bun run lint
bun x vitest run
bun x playwright test src/routes/wuxia-mvp.e2e.ts
bun run test
```

The existing GitHub Actions workflows provide Linux build/unit/Playwright CI. The application is keyboard-first; for user-facing acceptance, run/collect automated desktop Chromium E2E evidence on **macOS and Windows**. iOS touch/gamepad and Android/Linux acceptance are outside the ticket. Report actual runs and failures; the planning commit has not run these checks.

## PR acceptance checklist

- [ ] A clean-storage session plays Pay Respects → three real dash-marker crossings → medicine/quick-slot assignment → shrine bell → courtyard duel, without hardcoded test skips.
- [ ] Dialogue advances exactly one line with E, blocks movement/combat, respects pause and does not trigger unrelated quest actions.
- [ ] All five villagers, the bell, and markers use collision-safe data coordinates; nearest eligible E target selection is deterministic.
- [ ] Combat, health/qi refill, single victory reward, defeat courtyard respawn/rematch, inventory and post-victory free roam behave correctly.
- [ ] A v2 save reload restores quest and marker/medicine progress alongside items; old v1 saves are ignored without migration; duplicate pills/rewards are prevented.
- [ ] GLB-ready and fallback views work; cloning/material ownership and route unmount leave no duplicate objects/listeners.
- [ ] On macOS and Windows desktop browsers, automated E2E journeys and visual screenshot checks pass at 960×640 and 1440×900. No separate HPA-791 mockup exists; no HPA-792 visual redesign is included.
- [ ] Existing CI, `bun run check`, `bun run lint` and `bun run test` pass; failures, if any, are reported with evidence rather than assumed away.
- [ ] `CLAUDE.md` and the assets README describe the shipped architecture and controls. The implementation stays in this one draft PR until it is ready for review.

## Explicitly deferred

The HPA-792 ink-and-paper HUD (minimap, name tags, paper dialogue scroll and world-to-screen anchors), any new image or SFX generation, branching dialogue, NPC schedules, shops, currency, new interiors, touch controls, save migrations and new combat moves are not implementation sub-tasks of HPA-791.
