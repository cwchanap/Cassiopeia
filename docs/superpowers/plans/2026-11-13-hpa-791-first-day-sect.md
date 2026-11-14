# HPA-791 — First Day at the Sect (Implementation Plan)

**Design spec:** [2026-11-13-hpa-791-first-day-sect.md](../specs/2026-11-13-hpa-791-first-day-sect.md)  
**Linear:** [HPA-791](https://linear.app/cwchanap/issue/HPA-791/village-quest-chain-first-day-at-the-sect)  
**Base:** Current `main`, including HPA-790's camera and the existing GitHub Actions.  
**Delivery:** **One PR for HPA-791**, with these steps delivered as commits within that PR. Never split into a second implementation PR.  
**Status:** Documentation only; implementation and validation are not yet complete.

## How to work

Use six **green, playable vertical slices**. Each slice must end with `bun run check`, `bun run lint`, and `bun run test` passing, with the browser E2E adapted to the currently shipped quest stages in that slice. Do not remove the old phase model in a code-only commit while `+page.svelte` and the browser test still require it; change them together. Keep the completed five-step version for the final PR review.

Follow YAGNI/KISS: a few pure functions and authored data, not a generic game framework. `state.ts` is still the only mutator; no Svelte, DOM or Three.js dependencies in `simulation/`. Reuse `combat.ts`, `items.ts`, `world.ts`, camera and existing renderer ownership. There are no legacy users, so do not add migration or compatibility layers. New visual assets/SFX are not part of this ticket.

## Slice 1 — Move modes, dialogue and interaction to a playable two-step loop

**Files**

- `src/lib/game/simulation/types.ts`, `state.ts`, `state.spec.ts`
- New `simulation/villageContent.ts`, `dialogue.ts`, `interaction.ts`, `quest.ts` and focused pure tests
- `src/lib/game/simulation/combat.ts`
- `src/lib/game/render/camera.ts` and its tests
- `src/lib/game/render/createWuxiaScene.ts`
- `src/lib/game/runtime/createGameRuntime.ts` and its tests
- `src/routes/+page.svelte` and `src/routes/wuxia-mvp.e2e.ts`

**Work**

1. Define two temporary initial quest steps with stable IDs, **Pay Respects → Spar**, using authored data for Elder Shen (-4, -3), Lu near the courtyard ring, and their short English dialogue. The final ordered list will gain three steps in later slices. Use stable quest kind/target IDs and one switch over step kinds, not a script engine.
2. Add a tiny pure `nearestInteractable` function over villagers within renamed `INTERACT_RANGE` (1.5 m). Reuse `distance` in `combat.ts`. Add pure `advanceDialogue` (one E edge per line) and `advanceQuest` using `QuestProgress = { stepIndex, stepProgress }`. Tests: nearest/ties/out-of-range, active vs ambient dialogue, quest wrong-step events.
3. In `GameState`, replace old `GamePhase`/`ActiveGamePhase`/`previousPhase` with tagged `mode`: `{kind:'explore'} | {kind:'dialogue', villagerId, lineIndex} | {kind:'duel'}`; keep `paused` and `inventoryOpen` as independent booleans. One source of truth for dialogue; no separate nullable dialogue. Derive the HUD objective from the current quest, not another stored phase string.
4. Implement E dialogue/interact gating, Esc pause (including in dialogue/duel), inventory guards and duel refill. At step 2, Lu's dialogue begins the existing duel on the **last line**; before that he can be ambient. One victory gives one reward and returns to roam; defeat resets the player and rival to courtyard positions at full health/qi, leaving step 2 available for a rematch. Once complete, Lu is ambient and cannot roll another reward.
5. Keep duel framing when paused by using `mode.kind` for the camera and rival meter, and `paused` only for the overlay. Keep the fixed isometric pose. Remove obsolete `restartGame`, `GameRuntime.restart`, restart modal and related `showRestart` fields; do not leave dead exported APIs. Initialize the Svelte HUD as `toHudSnapshot(createInitialGameState())`; similarly replace the renderer's hand-built `createInitialRenderState` with `createInitialGameState()`.
6. In **this same slice**, update `+page.svelte` bindings, `state.spec.ts` duel helpers, and the Playwright test so the short Elder dialogue → Lu dialogue → duel → reward → free roam works, including bag/focus regression. Preserve existing `data-testid` hooks when possible. Rendering can still show only existing two actors; defer new NPC/marker/bell art to later slices.

**Green checkpoint:** `bun run check`, `bun run lint`, `bun run test`. The page compiles and the currently available short quest completes in the browser. Pure dialogue/interaction tests also pass.

## Slice 2 — Combined v2 item/quest save

**Files**

- `src/lib/game/runtime/save.ts`, `save.spec.ts`
- `src/lib/game/runtime/createGameRuntime.ts`, `createGameRuntime.spec.ts`
- `src/lib/game/simulation/quest.ts`, `quest.spec.ts`
- `src/routes/wuxia-mvp.e2e.ts` (persistence assertions)

**Work**

1. Extend current save adapter to `loadGameProgress`/`saveGameProgress` with the new key `cassiopeia.gameProgress.v2`. Payload is **`{ items, quest }`**, not a redundant outer version field. Keep existing `normalizeItemProgress` and its `ItemProgress.version === 1`. Ignore the legacy `cassiopeia.itemProgress.v1` key entirely.
2. Normalize `stepIndex` and `stepProgress` against the current quest step's required event count. Invalid, missing or unavailable storage yields starter items and step 1, never partial/mismatched progress. Do not serialize dialogue, player location, mode, paused flag or duel runtime state.
3. Runtime compares a single serialized object before writing and advances `lastSaved` only on success, retaining the existing retry-on-failed-write behavior. `createInitialGameState` takes the loaded items/quest and respawns the player in courtyard exploration.
4. Update mocks, tests and browser persistence assertions. Verify reload after completion and corrupted/old saves. The temporarily two-step quest format may be reset when in-PR development inserts new steps; no migration needed.

**Green checkpoint:** `bun run check`, `bun run lint`, `bun run test`; failed-write retry and v2 round-trip tests pass.

## Slice 3 — Insert the ordered three-marker qinggong step

**Files**

- `src/lib/game/simulation/villageContent.ts`, `quest.ts`, `quest.spec.ts`
- `src/lib/game/simulation/state.ts`, `state.spec.ts`
- `src/lib/game/render/createWuxiaScene.ts` and focused render tests
- `src/routes/+page.svelte`, `src/routes/wuxia-mvp.e2e.ts`

**Work**

1. Insert **Lightness Training** between Pay Respects and Spar in the data. Seed three positions along the legal courtyard → gate corridor, test reachable marker centers with `canStandAt` and actual dash paths through `moveThroughWorld`. Tune centers for feasible screen-aligned W+D movement through the open gate rather than an impossible path through the wall.
2. Change `movePlayer` to return `{from,to} | null` for an **actually applied dash**, using the position immediately before and after `moveThroughWorld`. It returns null for cooldown, non-dash, or no movement due to collision. Test a point-to-segment proximity function against only the **next** marker. Advance `stepProgress` once per successful dash; after marker 3 advance to the next step and reset progress to 0. Normal walking, blocked/cooling dashes and skipping markers cannot advance.
3. Draw three lightweight marker meshes from the same content positions, with the active marker highlighted. Markers are visuals only; register and dispose them with existing scene resources.
4. Add current marker progress to `HudSnapshot` and objective/prompt chip. Extend the existing Playwright opening to three real dash key presses, with the appropriate cooldown spacing and actual marker checks; preserve the two-step duel/reward continuation.

**Green checkpoint:** `bun run check`, `bun run lint`, `bun run test`. Marker logic is proven with pure tests and the currently playable browser quest.

## Slice 4 — Insert the medicine step and deliberate bag assignment

**Files**

- `src/lib/game/simulation/villageContent.ts`, `quest.ts` and tests
- `src/lib/game/simulation/items.ts` and its tests
- `src/lib/game/simulation/state.ts` and its tests
- `src/lib/game/render/createWuxiaScene.ts`
- `src/routes/+page.svelte`, `src/routes/wuxia-mvp.e2e.ts`

**Work**

1. Insert **Fetch Medicine** after the marker step. Add Auntie Qin as a static NPC on the walkable street outside the Herbalist building footprint (building center (5, -10)); use the existing procedural `createDisciple` placeholder at first.
2. Export `grantItem` in `items.ts` as a thin wrapper of private `incrementItem`. Define the reward `{ itemId: 'lesser_healing_pill', count: 2 }` in the step data. On completion of Qin's dialogue, move `stepProgress 0 → 1` and grant the pills once. Other visits play ambient lines, not another grant.
3. In **`processInventoryCommands`**, after the normal `assignQuickSlot` branch, recognize a deliberate assignment of the same healing pill **while `stepProgress === 1`** and advance the quest. This path must run even with `inventoryOpen === true` and with `deltaTime === 0`, just as `GameRuntime.assignQuickSlot` currently calls it. The starter slot-1 assignment does not auto-complete the step; reassigning it intentionally does.
4. Tests simulate the real runtime command while the bag is open with zero input and dt=0, and assert the step advances. Reopened dialogue and reload at `stepProgress=1` never duplicate pills; incorrect item/command never completes. Preserve existing item count, equipment and quick-slot tests.
5. Extend the Playwright opening through Qin dialogue and a real bag assignment using existing button/test IDs. Preserve the duel/reward continuation, and test temporary prompt text.

**Green checkpoint:** `bun run check`, `bun run lint`, `bun run test`; bag open/zero-dt completion and idempotent granting pass.

## Slice 5 — Insert the shrine bell, prove the full route in Node

**Files**

- `src/lib/game/simulation/villageContent.ts`, `quest.ts`, `quest.spec.ts`
- `src/lib/game/simulation/world.ts` and `world.spec.ts`
- `src/lib/game/simulation/state.ts` and `state.spec.ts`
- `src/lib/game/render/createWuxiaScene.ts`
- `src/routes/wuxia-mvp.e2e.ts`

**Work**

1. Insert **Ring the Shrine Bell** before the final Spar step. Place the E target on the **walkable frontage** of the Bamboo Shrine; (-44, -18) is blocked by the building and is **not a valid actor/bell position**. Reuse and extend `world.spec.ts`'s proven courtyard → (-17,8.5) → (-44,8.5) → (-44,-9) route for the shrine approach. Validate reachability and E interaction range; leave world geometry unchanged.
2. Add the shrine bell visual using inexpensive primitives. Add Old Zhu beside the shrine, with ambient dialogue. The bell is the quest E target; Old Zhu must not steal it when the player is in range of the bell (choose reachable positions and deterministic eligible-target priority). Expose `regionAt(position)` in `world.ts` over existing `layout.regions`. Include region and bell interactions in the HUD snapshot/temporary prompt.
3. Create a deterministic **Node full-journey** test driving `stepGame`/real `moveThroughWorld`: Elder dialogue, three actual dashes, Qin dialogue/grant/explicit slot assignment, walkable shrine waypoints and bell E, return to courtyard, Lu dialogue, scripted J/K attacks until rival defeated, one reward, post-victory walking/bag. This test proves navigability and gameplay ordering without flaky long browser key holds.
4. Add focused Node coverage for reload at partial marker/item progress, defeat/full-health respawn and Lu rematch, wrong-target interactions, pause/dialogue freeze and no repeat reward.
5. Keep the **short Playwright browser test**: real keys for steps 1–3, then seed a valid `cassiopeia.gameProgress.v2` localStorage object at step 5 and reload (same public save boundary the runtime uses; **no debug API**). Use Lu dialogue, the existing duel attack loop, verify reward/free roam, then reload and verify completion. The full shrine round trip is covered by the Node journey.

**Green checkpoint:** `bun run check`, `bun run lint`, `bun run test`. Node proves all five steps via real collision; the browser proves interaction, save boundary, real duel, UI and persistence.

## Slice 6 — Finish NPC visuals, fallback, docs and acceptance

**Files**

- `src/lib/game/simulation/villageContent.ts`
- `src/lib/game/render/createWuxiaScene.ts` and focused renderer tests
- `src/routes/+page.svelte` and its component tests
- `src/routes/wuxia-mvp.e2e.ts`
- `CLAUDE.md`, `assets/wuxia/README.md`

**Work**

1. Add the fifth villager, Peddler Wei, at a verified walkable Jadebank Market coordinate, with ambient dialogue. Ensure Elder Shen, Senior Brother Lu, Auntie Qin, Old Zhu and Peddler Wei all appear as stationary actors in exploration. Test content positions and the existing route toward the market.
2. Reuse `createDisciple` procedural models for all extra villagers and keep them available if GLB fails. In the existing `loadWuxiaAssets` ready callback, clone the attached rigid `Mentor` group via `Object3D.clone()` for the new villagers; **do not change loader targets** or introduce new art. The model uses `Handpainted_Wuxia_Atlas` rather than a separate robe material: clone/tint that material for each new NPC, retain shared geometry/textures, register new materials in `resources.materials` and clean them up on unmount.
3. Apply `setMeshRenderOrder(npc, PLAYER_RENDER_ORDER)` for **every non-player NPC** on procedural **and** GLB-ready paths. Verify the player's ink silhouette never draws over them. Add/retain GLB-ready and fallback appearance/disposal checks.
4. Finish temporary quest chip/prompt strings for step/marker progress, English dialogue and named regions; preserve bag keyboard focus and pause/duel meter behavior. Keep no redundant Svelte HUD literal: derive from `toHudSnapshot(createInitialGameState())`. Do **not** add HPA-792's paper HUD/minimap/anchored tags in this PR.
5. Capture automated browser diagnostics at 960×640 and 1440×900: assertions check that quest text and dialogue are visible/not obscured, the active marker and bell appear in the scene, the rival meter remains visible under pause, and GLB/fallback works. Store screenshots as run/PR artifacts **without committed screenshot baselines**. No HPA-791 UI mockup exists; HPA-792 has its own four mockups.
6. On **macOS and Windows**, run the focused browser E2E acceptance covering opening, seeded duel, save/reload and visual assertions. Use existing Linux GitHub Actions for repeatable CI; do not add macOS/Windows CI runners just to replicate the long journey. iOS touch, Android and Linux manual acceptance are out of scope. Tests must be automated, not human sign-off.
7. Update repository guidance with quest/mode, interactions, five villagers, free roam and the new save key. Include the temporary-HUD boundary with HPA-792.

**Final checkpoint:** `bun run check`, `bun run lint`, `bun run test` green; successful Node journey and Playwright opening/seeded-duel paths. Confirm actual test results before making pass claims.

## Commands (run at every slice boundary)

```sh
bun install --frozen-lockfile
bun run check
bun run lint
bun x vitest run
bun x playwright test src/routes/wuxia-mvp.e2e.ts
bun run test
```

At each checkpoint report any red result; fix it in the same draft PR before beginning the next slice. Existing CI on Linux is useful verification but is not a separate user-facing Linux acceptance requirement.

## PR acceptance checklist

- [ ] The full **five-step** quest succeeds in the deterministic Node journey using real `stepGame`, dash/collision and waypoints; win yields one reward and free roam.
- [ ] The focused Playwright browser E2E succeeds through Elder dialogue → marker dashes → Qin/bag assignment and a seeded step-5 save → Lu dialogue → duel → reward → reload. No 100 m timed keyboard walk or debug API is introduced.
- [ ] E advances dialogue one line; out-of-range/wrong-step objects, bad dashes and ambient lines do not advance the quest. The pause flag preserves duel camera/rival bar, and bag-open zero-dt assignments can complete the medicine step.
- [ ] Defeat respawns at max health/qi, supports Lu dialogue/rematch, never rewards defeat; post-completion Lu is ambient with no extra rewards.
- [ ] Combined v2 `{ items, quest }` storage preserves marker/item/complete progress without duplicates; old v1 and invalid saves start fresh, with no migration or redundant envelope version.
- [ ] All five NPCs, ordered markers and bell have reachable, collision-safe positions. Procedural and GLB paths render correctly with proper ink ordering and no leaked materials/meshes/listeners.
- [ ] On macOS and Windows desktop browsers, focused automated keyboard E2E/visual assertions and screenshots at both viewports confirm readable temporary HUD, NPCs, markers, bell, duel/pause and persistence; no committed image baselines or human sign-off.
- [ ] `bun run check`, `bun run lint`, `bun run test` pass at each slice boundary and in existing CI. The PR stays draft until implementation evidence exists.
- [ ] `CLAUDE.md` and assets guide describe actual shipped gameplay and architectural boundaries. HPA-792 stays separate.

## Not part of HPA-791

No HUD redesign, new art/SFX, extra models, pathfinding/schedules, shops, currency, interiors, branching dialogue, gamepad/touch, save migration, combat redesign, or cross-OS CI matrix. These are not reasons to open another implementation PR for this ticket.
