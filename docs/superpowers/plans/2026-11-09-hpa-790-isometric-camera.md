# HPA-790 — Fixed Isometric Camera (Implementation Plan)

**Design spec:** [2026-11-09-hpa-790-isometric-camera.md](../specs/2026-11-09-hpa-790-isometric-camera.md)  
**Linear:** [HPA-790](https://linear.app/cwchanap/issue/HPA-790/25d-isometric-camera-and-screen-aligned-controls)  
**Delivery:** **One PR for HPA-790**. All steps below are commits within that PR, not separate tickets or PRs.  
**Implementation status:** Not started; this document is the reviewable plan, not an implementation claim.

## Approach

Make the smallest change across the pure camera helper, the existing Three.js scene, the existing input controller, and the obsolete simulation field. Keep world and gameplay rules untouched. Integrate and test the full mentor → dash → duel journey before marking the PR ready. Apply each step in this same draft PR, with tests at each checkpoint rather than deferring all verification.

## Step 1 — Define camera orientation and projection math

**Files**

- `src/lib/game/render/camera.ts`
- `src/lib/game/render/camera.spec.ts`
- `src/lib/game/render/createWuxiaScene.ts` (only remove the obsolete camera pose input at this step)

**Work**

1. Replace perspective-oriented offsets with named, fixed camera constants: 45° azimuth, ~35° downward pitch, 14m exploration view height and ~11m duel view height. Keep the existing six-metre cap on fighter midpoint displacement.
2. Remove the unused `playerHeading` input from `WuxiaCameraPoseInput`. Return `viewHeight` along with `position` and `target`. Keep all calculations pure and without `THREE`.
3. Export a small pure `screenDirectionToWorld(right, down)` helper derived from the **same azimuth constant** as the pose, so the input controller imports no Three.js and has no duplicated 45° numbers. Check its down direction against the **normalised horizontal target-to-camera vector** (`pose.position − pose.target`), and check the right direction is perpendicular and screen-right.
4. Export one pure `orthoFrustum(pose, viewport)` returning left/right/top/bottom/near/far; both the renderer and `projectWorldToScreen(point, activePose, viewport)` consume this frustum. The projection helper works in CSS pixels, reports viewport and camera-depth visibility, and safely handles zero-size viewports.
5. Replace the camera tests that pass `playerHeading` (the obsolete `camera.spec.ts` heading-rotation test is **deleted**, not ported). Keep tests for follow translation, duel focus/cap and view height, input-mapping-to-pose invariants, and off-screen/behind-camera points. Add one Node test that creates a real `THREE.OrthographicCamera` with the **same** pure pose/frustum and checks `Vector3.project()` → CSS pixels against `projectWorldToScreen` for multiple world points and a changed viewport aspect.
6. Remove the unused `playerHeading` property at its existing scene call site in this same step so TypeScript remains consistent.

**Checkpoint:** Run `bun x vitest run` and `bun run check`. Confirm the pure projection agrees with Three.js without initializing a WebGL renderer. No persistent active-pose getter or state is created until HPA-792 needs an actual caller.

## Step 2 — Switch the scene to orthographic rendering

**File:** `src/lib/game/render/createWuxiaScene.ts`

**Work**

1. Replace `THREE.PerspectiveCamera` with `THREE.OrthographicCamera` (near/far enough for the authored village). Delete the perspective FOV and remove `scene.fog`.
2. On each render, compute the desired focus and view height, then **lerp both the focus and `viewHeight` by the same existing follow factor** (including the 14 → 11 m duel transition). Reconstruct `camera.position` and `lookAt` from the smoothed focus with the fixed angle. Do not lerp camera position independently, snap the zoom, or retain otherwise-unused active-pose state/getters.
3. **Every render frame**, apply `orthoFrustum` using the smoothed view height and the host's current CSS-pixel aspect ratio, and call `updateProjectionMatrix()`. Keep `renderer.setSize` on viewport resize and the existing capped pixel ratio. Updating projection only inside `resize()` would miss the duel transition.
4. Retune the already existing hemisphere/directional lighting and shadow camera so playable geometry and characters remain legible without distance fog. Avoid new lighting abstractions.
5. Keep all scene object placement and existing model-load/disposal paths otherwise unchanged.

**Checkpoint:** Run `bun x vitest run` and `bun run check` after the renderer change. Smoke-check that the scene starts, the map renders, turning does not rotate the camera, the duel view height transitions smoothly, and resizing changes horizontal coverage rather than actor scale.

## Step 3 — Translate screen direction at the input boundary

**Files**

- `src/lib/game/input/createInputController.ts`
- `src/lib/game/simulation/types.ts`
- `src/lib/game/simulation/state.ts`
- `src/lib/game/simulation/state.spec.ts`
- `src/lib/game/runtime/createGameRuntime.ts`
- `src/routes/+page.svelte` (remove obsolete control hint and drag cursor styles; no HUD redesign)
- `src/routes/wuxia-mvp.e2e.ts` (adjust mentor approach in the same input change)

**Work**

1. Read screen-direction axes from WASD **and** arrows, with left/right arrows becoming movement rather than camera rotation. Convert to world X/Z via the pure helper before returning each `InputSnapshot`.
2. Remove `cameraDelta` from `InputSnapshot`, its initialization in `runInventoryCommand`, and its heading mutation in `movePlayer`. Leave `normaliseMove`, `moveThroughWorld`, dash distance, attack rules, and input edge-trigger lifecycle unchanged.
3. Remove pointer drag-tracking/capture/rotation listeners. Keep pointer-down focus behavior (without initiating a drag gesture). Do not add new drag or click mechanics.
4. Verify single keys, diagonals, and opposite-key cancellation through the **pure camera mapping tests** in `camera.spec.ts`. There is no input-controller test file today; do not create a DOM-bound test solely for this mapping. Existing pause/inventory gating is already owned by `stepGame`, so keep that behavior instead of testing it in input.
5. In `src/routes/+page.svelte`, remove the now-false `Drag to look` hint and the now-misleading drag affordance: delete `cursor: grab;` from `.scene-host` and the `.scene-host:active { cursor: grabbing; }` rule (currently lines 518–523). Keep the host focusable and preserve its `outline: none` and canvas sizing. This is a small input-UX cleanup, not a HUD redesign.
6. In `src/routes/wuxia-mvp.e2e.ts`, remove the existing `a` keydown/keyup from the mentor approach **in the same commit** as the mapping. New `W` maps to the old `A+W` world direction toward the mentor at (-4, -3). Preserve the real `E` interaction and all later duel/reward/persistence assertions.

**Checkpoint:** Run `bun x vitest run`, `bun run check`, and `bun x playwright test src/routes/wuxia-mvp.e2e.ts`. Holding W moves away from the viewer, A left-screen, D right-screen; stationary dash retains heading. Do not leave e2e red until Step 5.

## Step 4 — Replace the player ring with ink silhouette occlusion

**Files**

- `src/lib/game/render/createWuxiaScene.ts`
- `src/lib/game/render/inkSilhouette.ts` (one small Three.js scene-graph helper, no renderer required)
- `src/lib/game/render/inkSilhouette.spec.ts` (new Node unit test)

**Work**

1. Remove the `playerMarker` ring mesh and its per-frame position update.
2. Add one small `addInkSilhouette(root, inkMaterial)` helper. For each original source player `Mesh`, attach one ink child `Mesh` with **identity local transform** and **shared geometry**. Mark ink children and skip them on future traversals, making repeat calls a no-op. A child naturally inherits animation and visibility (including hidden procedural bodies when the GLB is ready).
3. Draw opaque **world → ink → real player**, explicitly setting `renderOrder` on **every ink and original player mesh**, not just on the outer player group (GLTF may contain nested groups). Use one shared `MeshBasicMaterial` registered with the existing scene resources: dark ink, `depthFunc = THREE.GreaterDepth`, `depthWrite = false`; ink clones have `castShadow = false`. Rendering the ink **before** the real player avoids self-occlusion from the player's own limbs, sword, or robe. Keep world objects' existing ordering unless a browser-observed case requires a focused change.
4. Call the helper once for procedural meshes at construction and once on the GLB loader's `ready` callback; skip already processed meshes. On `fallback`, do nothing—the procedural ink children remain. Use existing scene/resource and asset-loader teardown for registered material and source geometry; avoid rebuilding/removal lists or dedicated ink lifecycle management. Shared geometries remain owned by the originals, not separately disposed as clone assets.
5. Add a Node unit test with a nested player scene graph (no WebGLRenderer): one ink child per source mesh, second call no-op, inherited visibility, ink `depthFunc`/`depthWrite`, disabled `castShadow`, and ink `renderOrder` less than real-player render order.
6. Browser-check the player behind a wall/building and fully visible with an arm or sword crossing the torso, including GLB-ready and procedural fallback. If depth order/transparent leaves are wrong, make a focused scene adjustment rather than building postprocessing or raycasting infrastructure.

**Checkpoint:** Run `bun x vitest run`, `bun run check`, and `bun x playwright test src/routes/wuxia-mvp.e2e.ts`. Hidden body parts show ink; **crossing arms and sword do not generate false ink** when unobstructed. No ground ring or duplicate ink children remain.

## Step 5 — Update documentation and end-to-end verification

**Files**

- `src/routes/wuxia-mvp.e2e.ts` (full final regression run; mentor navigation was already corrected in Step 3)
- `src/lib/game/render/camera.spec.ts` and `inkSilhouette.spec.ts` (final regression run)
- `CLAUDE.md`
- `assets/wuxia/README.md`

**Work**

1. Keep the full Playwright mentor → dash → duel → reward/restart → item persistence path green after Steps 3 and 4, rather than postponing its navigation fix until this step.
2. Manually play through the tutorial on a normal desktop viewport and at 960×640. Walk against building walls, along the river, and over bridge openings; confirm screen direction, dash collision, and camera framing.
3. Confirm both GLB-ready and procedural fallback can silhouette an obscured player, while a visible arm/sword over the torso remains un-inked. Verify restart/dispose do not leave extra canvas/meshes or duplicate listeners.
4. Update the repository guides to explain the fixed 2.5D view, screen-space controls, pure frustum/projection helper contract, and removal of camera rotation. Do not redesign the HUD documentation in this PR.

**Validation commands** (unit tests and targeted e2e also run at earlier checkpoints)

```bash
bun x vitest run
bun x playwright test src/routes/wuxia-mvp.e2e.ts
bun run check
bun run lint
bun run test
```

`bun run test` includes browser e2e, so record environment failures separately if a browser/WebGL runtime is unavailable. Do not claim a passing e2e run without observing it.

## PR-level acceptance checklist

- [ ] The 45°/35° orthographic camera follows without rotating; exploration and duel framing work.
- [ ] WASD and arrow keys are screen aligned, with collision and dashing intact.
- [ ] Rotation input, misleading drag-to-look hint, and grab/grabbing scene cursors are removed; keyboard focus and other input controls remain intact. No compatibility toggle remains.
- [ ] World → ink → player mesh order avoids self-inking of crossing limbs/gear; the old ring-only marker is deleted.
- [ ] The ink helper is idempotent, handles GLB-ready and fallback, and is covered by a Node unit test.
- [ ] Pure world-to-screen helper and renderer share `orthoFrustum`; projection agrees with `THREE.Vector3.project()` after resize.
- [ ] Existing mentor → training → duel → reward and persistence e2e coverage is preserved.
- [ ] GLB and fallback loading/disposal behave correctly.
- [ ] `bun run check`, `bun run lint`, `bun run test` pass (or failures are honestly reported with logs).
- [ ] `CLAUDE.md` and `assets/wuxia/README.md` describe the shipped behavior.

## Do not implement in this PR

The HPA-791 dialogue/quest chain, HPA-792 HUD components, new art/SFX, save migrations, new camera settings, combat refactors, or an architecture-wide camera service. They are separate tasks. No additional ticket or PR is necessary to complete HPA-790.
