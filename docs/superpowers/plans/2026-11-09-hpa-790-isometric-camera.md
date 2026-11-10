# HPA-790 — Fixed Isometric Camera (Implementation Plan)

**Design spec:** [2026-11-09-hpa-790-isometric-camera.md](../specs/2026-11-09-hpa-790-isometric-camera.md)  
**Linear:** [HPA-790](https://linear.app/cwchanap/issue/HPA-790/25d-isometric-camera-and-screen-aligned-controls)  
**Delivery:** **One PR for HPA-790**. All steps below are commits within that PR, not separate tickets or PRs.  
**Implementation status:** Not started; this document is the reviewable plan, not an implementation claim.

## Approach

Make the smallest change across the pure camera helper, the existing Three.js scene, the existing input controller, and the one obsolete simulation field. Keep the world and gameplay rules untouched. Integrate and test the full mentor → dash → duel journey before marking the PR ready.

## Step 1 — Define camera orientation and projection math

**Files**
- `src/lib/game/render/camera.ts`
- `src/lib/game/render/camera.spec.ts`

**Work**
1. Replace perspective-oriented offsets with named, fixed camera constants: 45° azimuth, ~35° downward pitch, 14m exploration view height and ~11m duel view height. Keep the existing six-metre cap on fighter midpoint displacement.
2. Remove the unused `playerHeading` input from `WuxiaCameraPoseInput`. Return `viewHeight` along with `position` and `target`. Keep all calculations pure and without `THREE`.
3. Export a small pure `screenDirectionToWorld(right, down)` helper from the same module so the input controller shares the exact camera orientation without importing Three.js. This avoids duplicated 45° constants and a new service/configuration layer.
4. Add `projectWorldToScreen(point, activePose, viewport)`, working in CSS pixels. Derive right/up/forward from the pose, project relative to `target`, and report whether the point lies in the viewport and camera depth range. Handle zero width/height without division errors.
5. Add tests for fixed orientation when heading changes, follow translation, duel focus and view height, W/S/A/D basis vectors, center projection, off-screen and behind-camera points, and viewport resize/aspect ratio.

**Checkpoint:** Pure math and tests are complete before changing Three.js objects. Ensure the projection contract can use the smoothed **rendered** pose rather than a target-only pose.

## Step 2 — Switch the scene to orthographic rendering

**File:** `src/lib/game/render/createWuxiaScene.ts`

**Work**
1. Replace `THREE.PerspectiveCamera` with `THREE.OrthographicCamera` (near/far enough for the authored village). Delete the perspective FOV and remove `scene.fog`.
2. On each render, compute the desired focus, smooth the focus (including transition to duel if necessary), then reconstruct `camera.position` and `lookAt` from that focus at the **fixed angle**. Preserve the active pose in local renderer state for future world-to-screen callers. Do not independently lerp camera position toward a moving target.
3. On viewport resize and view-height changes, recompute orthographic left/right/top/bottom from the CSS-pixel aspect and `viewHeight`; call `updateProjectionMatrix()`. Keep `renderer.setSize` and existing capped pixel ratio.
4. Retune the already existing hemisphere/directional lighting and shadow camera so playable geometry and characters remain legible without distance fog. Avoid new lighting abstractions.
5. Keep all scene object placement and existing model-load/disposal paths otherwise unchanged.

**Checkpoint:** The scene starts, the entire map still renders, character turns do not rotate the view, and resizing a browser changes horizontal coverage rather than character size.

## Step 3 — Translate screen direction at the input boundary

**Files**
- `src/lib/game/input/createInputController.ts`
- `src/lib/game/simulation/types.ts`
- `src/lib/game/simulation/state.ts`
- `src/lib/game/runtime/createGameRuntime.ts`
- Related existing unit tests and test snapshots

**Work**
1. Read screen-direction axes from WASD **and** arrows, with left/right arrows becoming movement rather than camera rotation. Convert to world X/Z via the pure helper before returning each `InputSnapshot`.
2. Remove `cameraDelta` from `InputSnapshot`, its initialization in `runInventoryCommand`, and its heading mutation in `movePlayer`. Leave `normaliseMove`, `moveThroughWorld`, dash distance, attack rules, and input edge-trigger lifecycle unchanged.
3. Remove pointer drag-tracking/capture/rotation listeners. Keep pointer-down focus behavior (without initiating a drag gesture). Do not add new drag or click mechanics.
4. Add or adjust pure input controller tests as appropriate; verify the transform with one key, diagonals, and opposite keys. Ensure a paused or inventory-open game does not create movement from controls.

**Checkpoint:** Holding W visibly moves up-screen (world -X/-Z), A moves left-screen, D moves right-screen; walking and stationary dash preserve sensible facing. Existing gameplay state tests still pass.

## Step 4 — Replace the player ring with ink silhouette occlusion

**Files**
- `src/lib/game/render/createWuxiaScene.ts`
- Existing scene/resource tests where available

**Work**
1. Remove the `playerMarker` ring mesh and its per-frame position update.
2. Add a minimal local helper to install a second, unlit dark-ink render of the current player's meshes. Create mesh siblings under the same parent transforms using shared geometry; set `depthFunc = THREE.GreaterDepth`, `depthWrite = false`, and render order after opaque world meshes. The silhouette must never change the depth buffer or shadow map.
3. Rebuild the silhouette mesh set when `loadWuxiaAssets` calls back with GLB `ready` or `fallback`. Take a snapshot of source meshes before attaching siblings, and remove prior copies before rebuilding so they are never cloned recursively. Keep procedural player fallback working.
4. Dispose ink-only materials and clone objects without disposing geometries owned by the original player or GLB asset loader. Respect the existing idempotent `dispose` behavior, including asynchronous model completion after teardown.
5. Browser-check an actor behind a building/wall and an unobstructed actor. If depth order/transparent leaves are wrong, make a focused render-order/material adjustment rather than introducing raycast infrastructure or an outline pipeline.

**Checkpoint:** Hidden body parts have an ink silhouette; fully visible body parts keep their original materials. No ground ring remains.

## Step 5 — Update documentation and end-to-end verification

**Files**
- `src/routes/wuxia-mvp.e2e.ts`
- `src/lib/game/render/camera.spec.ts`
- Existing relevant simulation/input tests
- `CLAUDE.md`
- `assets/wuxia/README.md`

**Work**
1. Update the Playwright mentor navigation path: its existing `A+W` movement assumes the old world-axis mapping. Keep the real interaction, dash, duel, reward and persistence checks; only change the route and controls needed for isometric movement.
2. Add targeted test coverage for off-map projection, resizing, fixed camera orientation, and new input direction mapping. Keep collision tests against the authored world unchanged.
3. Manually play through the tutorial on a normal desktop viewport and at 960×640. Walk against building walls, along the river, and over bridge openings; confirm the correct direction, dash collision and camera framing.
4. Confirm both the GLB-ready and procedural fallback rendering paths can show an obscured player's ink silhouette, and confirm restart/dispose do not leave extra canvas/meshes or duplicate listeners.
5. Update the repository guides to explain the fixed 2.5D view, screen-space controls, projection helper contract, and removal of camera rotation. Do not redesign the HUD documentation in this PR.

**Validation commands**
```bash
bun run check
bun run lint
bun run test
```

`bun run test` includes browser e2e, so record environment failures separately if a browser/WebGL runtime is unavailable. Do not claim a passing e2e run without observing it.

## PR-level acceptance checklist

- [ ] The 45°/35° orthographic camera follows without rotating; exploration and duel framing work.
- [ ] WASD and arrow keys are screen aligned, with collision and dashing intact.
- [ ] Rotation input is removed from the snapshot/controller/simulation; no compatibility toggle remains.
- [ ] Player silhouette appears only through occluders; the old ring-only marker is deleted.
- [ ] Pure world-to-screen helper returns host-local CSS pixels consistent with the active camera and resize.
- [ ] Existing mentor → training → duel → reward and persistence e2e coverage is preserved.
- [ ] GLB and fallback loading/disposal behave correctly.
- [ ] `bun run check`, `bun run lint`, `bun run test` pass (or failures are honestly reported with logs).
- [ ] `CLAUDE.md` and `assets/wuxia/README.md` describe the shipped behavior.

## Do not implement in this PR

The HPA-791 dialogue/quest chain, HPA-792 HUD components, new art/SFX, save migrations, new camera settings, combat refactors, or an architecture-wide camera service. They are separate tasks. No additional ticket or PR is necessary to complete HPA-790.
