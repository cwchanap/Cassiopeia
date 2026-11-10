# HPA-790 — Fixed Isometric Camera and Screen-Aligned Controls (Design Spec)

**Status:** Proposed for implementation  
**Issue:** [HPA-790](https://linear.app/cwchanap/issue/HPA-790/25d-isometric-camera-and-screen-aligned-controls)  
**Repository:** `cwchanap/Cassiopeia`  
**Scope:** One implementation PR for HPA-790. No new art assets.

## Problem and goal

The current village is rendered through a perspective camera with a diagonal follow offset. Left/right arrow keys and pointer dragging can rotate the player heading independently of movement, while WASD currently maps directly to the world's X/Z axes. A 2.5D wuxia presentation needs a fixed, predictable isometric view, consistent screen-relative navigation, readable actors behind foreground architecture, and a pure projection helper for the later HUD ticket.

This change is limited to the renderer, input mapping, and the smallest required removal of obsolete camera input from simulation types/state. Keep the existing village geometry, tutorial, dash, combat, collision, inventory, rewards, and saved item data intact.

## Existing architecture

- `src/lib/game/render/camera.ts` computes a pure `computeWuxiaCameraPose` (currently position and target, perspective offsets).
- `src/lib/game/render/createWuxiaScene.ts` owns `THREE.PerspectiveCamera`, fog, camera follow, lighting, and the ground ring marker.
- `src/lib/game/input/createInputController.ts` collects keys plus pointer-drag deltas into `InputSnapshot`.
- `src/lib/game/simulation/state.ts` handles `cameraDelta` by changing player heading, then moves and dashes using world-space `moveX/moveZ`.
- `src/lib/game/runtime/createGameRuntime.ts` collects one snapshot per frame and renders the game.
- `src/lib/game/render/wuxiaAssets.ts` asynchronously attaches the GLB player under the existing player group, retaining fallback geometry if loading fails.

## Proposed behavior

### 1. Camera projection and framing

Use a single `THREE.OrthographicCamera` with a constant 45° azimuth from the **+X/+Z** quadrant and approximately 35° downward pitch. Remove the perspective-camera path, distance fog, and all player camera-rotation/zoom controls.

- Exploration: approximately **14 world metres** of vertical coverage.
- Duel: approximately **11 world metres** of vertical coverage; retain the existing player/rival focus blend and six-metre displacement cap.
- The view follows the player/fight focus smoothly but **never changes azimuth or pitch**. Smooth the focus point (and, if necessary, the view height) rather than independently smoothing camera position, which would transiently change the angle.
- Build the pose from one constant camera orientation; return `position`, `target`, and `viewHeight` from `computeWuxiaCameraPose`. `playerHeading` is no longer an input to that helper.
- On resize, use the host's CSS-pixel aspect ratio to set `left/right = ±(viewHeight * aspect / 2)` and `top/bottom = ±(viewHeight / 2)`; update the projection matrix. Choose near/far planes that cover the authored map and keep a stable vertical world span.
- Adjust the sky/background, key light direction/exposure, and shadow-camera footprint for the flat view; preserve the existing daylit scene and shadows. No new postprocessing or shading pipeline.

The pure pose math must not import Three.js, DOM, or Svelte.

### 2. Pure world-to-screen projection contract

Add `projectWorldToScreen(point, activePose, viewport)` beside the pose helper in `render/camera.ts`.

- `point`: world `{ x, y, z }` (the simulation position remains X/Z; callers choose height such as a head or name tag anchor).
- `activePose`: the actual pose used for the rendered frame, including `viewHeight` after follow smoothing.
- `viewport`: `{ width, height }` in **CSS pixels**, relative to the game host, not the full browser window.
- Output: `{ x, y, inView }` with host-local pixel coordinates and an on-screen / camera-depth visibility flag. A zero-sized viewport returns a safe non-visible result.

Projection uses the camera's orthonormal **right**, **up**, and **forward** axes derived from `position` and `target`, with `scale = viewport.height / viewHeight`. Project a point relative to the target: `x = width/2 + dot(delta,right)*scale`, `y = height/2 - dot(delta,up)*scale`. `inView` must check the resulting bounds and camera depth. Unit-test both the orientation and resize behavior. This is groundwork for [HPA-792](https://linear.app/cwchanap/issue/HPA-792/wuxia-ink-and-paper-hud); do **not** implement name tags or modify `HudSnapshot` here.

### 3. Screen-aligned controls

The input controller converts keys into world-space movement before emitting the existing `moveX/moveZ` fields. With the selected camera azimuth:

- `W` / Up = away from the viewer = world `(-X,-Z)`.
- `S` / Down = toward the viewer = world `(+X,+Z)`.
- `D` / Right = screen right = world `(+X,-Z)`.
- `A` / Left = screen left = world `(-X,+Z)`.

For raw screen inputs `right = D-A` and `down = S-W`, emit:

```ts
const factor = Math.SQRT1_2;
moveX = (right + down) * factor;
moveZ = (down - right) * factor;
```

Keep diagonal normalization in the existing simulation's `normaliseMove`. The player faces the direction actually travelled; stationary dash still follows the last heading. Remove `InputSnapshot.cameraDelta`, pointer-drag rotation, and the corresponding heading mutation in `stepGame`. Retain click-to-focus on the canvas and all other controls (E, Space, J/K, Escape, inventory, and quick slots). There is no legacy input flag or compatibility branch.

### 4. Player occlusion

Replace the ring-only player marker with a **flat dark-ink silhouette where the player is hidden by an opaque foreground object**.

Preferred minimal renderer solution:

- Render the normal player as today.
- Reuse the player's existing mesh geometry for a second ink-only pass. Attach lightweight mesh clones as siblings of the real meshes under their animated parent transforms so the silhouette follows the existing animations without a separate animation system.
- Use a shared unlit ink material with depth testing configured to draw fragments **behind already-drawn depth** (`THREE.GreaterDepth`), `depthWrite: false`, and a late render order. Visible player fragments retain their original rendering; hidden fragments appear as a monochrome silhouette over the blocker.
- Rebuild the ink mesh set when the asynchronous GLB load replaces procedural fallbacks; remove clones and release silhouette-only materials on dispose. Share existing geometry rather than owning duplicate vertex buffers.
- Verify the depth behavior in the browser with rooftops, walls, trees, and the procedural fallback; if a GLB material's transparency makes depth-only occlusion unreliable, limit the adjustment to that scene's existing mesh/material setup. Avoid raycast services, outline postprocessing, or adding new art.

The silhouette is a player-locator aid, not a change to collision or enemy visibility.

## Non-goals and boundaries

- No quest, dialogue, HUD redesign, world geometry, NPC behavior, combat, or save-system changes.
- No sprite conversion, toon shaders, new textures, camera rotation, zoom UI, mobile touch controls, or graphics settings.
- Do not make the simulation aware of camera angles or viewport dimensions. The dependency direction remains: input translates screen intent to world movement; simulation consumes world movement; renderer chooses a view.
- No backward-compatibility adapters for the removed perspective/rotation inputs.

## Acceptance criteria

1. The player, rival, and village render with a fixed 45°/35° orthographic view. The camera follows without rotating when the player turns; the duel framing is tighter.
2. WASD and arrow keys move according to **screen directions**, including diagonals. Dashing and collision still work at buildings, the riverbank, and bridge openings.
3. When architecture obscures the player, the ink silhouette is visible; a fully visible player is not ink-tinted. The old ring-only marker is gone.
4. World-to-screen calculations use CSS-pixel viewport coordinates and agree with the rendered camera's active pose, including after resize and when following movement.
5. The existing mentor → dash → duel → reward/restart and inventory persistence journey still works. No HUD or item-data regression.
6. `bun run check`, `bun run lint`, and `bun run test` pass; browser smoke checks cover both the GLB-ready and fallback path.

## Risks and mitigation

- **Depth-buffer ordering:** ink clones must render after opaque blockers and not write depth. Verify with a live GLB scene before changing anything more complex; keep material/rebuild lifecycle isolated to `createWuxiaScene.ts`.
- **HUD projection drift:** project against the **active, smoothed** focus and `viewHeight`, not the unsmoothed desired target; keep pose/projection functions pure.
- **Navigation test drift:** the old e2e `A+W` route was written for world-aligned movement and must be updated based on screen direction, not weakened by skipping the mentor interaction.
- **Scope growth:** defer any HUD anchors and quest state to their already tracked tickets HPA-792 and HPA-791.

## Follow-on work

HPA-790 unblocks [HPA-791 (village quest chain)](https://linear.app/cwchanap/issue/HPA-791/village-quest-chain-first-day-at-the-sect) and [HPA-792 (ink-and-paper HUD)](https://linear.app/cwchanap/issue/HPA-792/wuxia-ink-and-paper-hud). Both stay in separate, single-ticket PRs.
