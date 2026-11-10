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
- The view follows the player/fight focus smoothly but **never changes azimuth or pitch**. Smooth both the focus point and the `viewHeight` with the same follow factor on every frame (including the 14 → 11 m duel transition); then reconstruct camera position from the fixed direction. Do not independently interpolate position or snap the view height.
- Build the pose from one constant camera orientation; return `position`, `target`, and `viewHeight` from `computeWuxiaCameraPose`. `playerHeading` is no longer an input to that helper.
- Define one pure `orthoFrustum(pose, viewport)` in `render/camera.ts` returning `left/right/top/bottom/near/far`: with the host CSS-pixel aspect ratio, `left/right = ±(viewHeight * aspect / 2)` and `top/bottom = ±(viewHeight / 2)`. The renderer applies this frustum and updates the projection matrix **every frame**, not only after a viewport resize, so the duel's changing view height is reflected immediately. Pick near/far planes covering the authored map.
- Adjust the sky/background, key light direction/exposure, and shadow-camera footprint for the flat view; preserve the existing daylit scene and shadows. No new postprocessing or shading pipeline.

The pure pose math must not import Three.js, DOM, or Svelte.

### 2. Pure world-to-screen projection contract

Add `projectWorldToScreen(point, activePose, viewport)` beside the pose and shared `orthoFrustum` helpers in `render/camera.ts`.

- `point`: world `{ x, y, z }` (the simulation position remains X/Z; callers choose height such as a head or name tag anchor).
- `activePose`: the actual pose used for the rendered frame, including `viewHeight` after follow smoothing.
- `viewport`: `{ width, height }` in **CSS pixels**, relative to the game host, not the full browser window.
- Output: `{ x, y, inView }` with host-local pixel coordinates and an on-screen / camera-depth visibility flag. A zero-sized viewport returns a safe non-visible result.

Projection uses the camera's orthonormal **right**, **up**, and **forward** axes derived from `position` and `target`, with scale and visibility bounds derived from the **same** `orthoFrustum` that configures the renderer. Project a point relative to the target into host-local pixels; `inView` must also check the camera's near/far depth. A Node test constructs a `THREE.OrthographicCamera` using the pure pose/frustum and compares its `Vector3.project()` result to the helper across several points and viewport aspect ratios. The projection helper has no HUD caller yet, so do **not** retain otherwise-unused camera state or add a getter now; [HPA-792](https://linear.app/cwchanap/issue/HPA-792/wuxia-ink-and-paper-hud) adds the integration point when needed. No name tags or `HudSnapshot` changes here.

### 3. Screen-aligned controls

The input controller converts keys into world-space movement before emitting the existing `moveX/moveZ` fields. With the selected camera azimuth:

- `W` / Up = away from the viewer = world `(-X,-Z)`.
- `S` / Down = toward the viewer = world `(+X,+Z)`.
- `D` / Right = screen right = world `(+X,-Z)`.
- `A` / Left = screen left = world `(-X,+Z)`.

For raw screen inputs `right = D-A` and `down = S-W`, call `screenDirectionToWorld(right, down)` from the pure camera helper. Derive its basis from the **same azimuth constant** used for the camera pose, not a second hard-coded 45° transform:

```ts
const toViewer = { x: Math.sin(CAMERA_AZIMUTH), z: Math.cos(CAMERA_AZIMUTH) };
const screenRight = { x: Math.cos(CAMERA_AZIMUTH), z: -Math.sin(CAMERA_AZIMUTH) };
return {
  x: right * screenRight.x + down * toViewer.x,
  z: right * screenRight.z + down * toViewer.z
};
```

For 45°, these reduce to the listed screen directions. Unit-test that down maps to the camera's horizontal direction toward the viewer, and that right is perpendicular to it (and points screen-right), rather than only testing hard-coded coordinate signs.

Keep diagonal normalization in the existing simulation's `normaliseMove`. The player faces the direction actually travelled; stationary dash still follows the last heading. Remove `InputSnapshot.cameraDelta`, pointer-drag rotation, and the corresponding heading mutation in `stepGame`. Retain click-to-focus on the canvas and all other controls (E, Space, J/K, Escape, inventory, and quick slots). Update the obsolete `Drag to look` hint in `src/routes/+page.svelte` alongside the input change; this is copy correctness, not a HUD redesign. There is no legacy input flag or compatibility branch.

### 4. Player occlusion

Replace the ring-only player marker with a **flat dark-ink silhouette where the player is hidden by an opaque foreground object**.

Preferred minimal renderer solution:

- Render opaque **world geometry → ink silhouettes → normal player**, in that order. Explicitly set per-**mesh** `renderOrder` for ink and original player meshes; assigning it only to an outer GLTF group is not sufficient because nested groups affect Three.js sort order. The silhouette must run before the real player so the player's own overlapping limbs, clothing and gear cannot count as occluders.
- Attach an ink clone as a **child of each source player mesh** with identity local transform and shared geometry. This naturally follows all joints/animation and inherits source visibility: procedural meshes disappear with their ink children when the GLB loads.
- Use one registered, unlit dark-ink material with `depthFunc: THREE.GreaterDepth`, `depthWrite: false`; ink clones have `castShadow = false`. Because only world depth has been rendered when ink is drawn, unobstructed player fragments do not ink themselves.
- Add ink children once to the procedural player at construction, then to newly attached GLB meshes on `ready`. The helper skips already-inked meshes; `fallback` changes nothing and requires no rebuild. The registered shared material uses existing scene cleanup; reused source geometry remains owned by its original mesh/asset loader, with no dedicated ink disposal machinery.
- Unit-test the ink graph helper in Node (one child per source, idempotence, inherited visibility, render order, depth settings and disabled shadows), then verify depth behavior in the browser with rooftops, walls, trees, and the procedural fallback. Check arms or swords crossing the torso do **not** produce ink speckles. If transparency makes world occlusion unreliable, apply only a focused scene material/order adjustment; avoid raycast services, outline postprocessing, or adding new art.

The silhouette is a player-locator aid, not a change to collision or enemy visibility.

## Non-goals and boundaries

- No quest, dialogue, HUD redesign, world geometry, NPC behavior, combat, or save-system changes.
- No sprite conversion, toon shaders, new textures, camera rotation, zoom UI, mobile touch controls, or graphics settings.
- Do not make the simulation aware of camera angles or viewport dimensions. The dependency direction remains: input translates screen intent to world movement; simulation consumes world movement; renderer chooses a view.
- No backward-compatibility adapters for the removed perspective/rotation inputs.

## Acceptance criteria

1. The player, rival, and village render with a fixed 45°/35° orthographic view. The camera follows without rotating when the player turns; the duel framing is tighter.
2. WASD and arrow keys move according to **screen directions**, including diagonals. Dashing and collision still work at buildings, the riverbank, and bridge openings.
3. When architecture obscures the player, the ink silhouette is visible; a fully visible player (including arms, hair and sword crossing the torso) is not ink-tinted. The old ring-only marker is gone.
4. World-to-screen calculations use CSS-pixel viewport coordinates and the shared frustum; a Node test checks agreement with `THREE.Vector3.project()` for the rendered pose, including after aspect changes.
5. The existing mentor → dash → duel → reward/restart and inventory persistence journey still works. No HUD or item-data regression.
6. `bun run check`, `bun run lint`, and `bun run test` pass; browser smoke checks cover both the GLB-ready and fallback path.

## Risks and mitigation

- **Self-occlusion:** world must render before ink, and ink **before** real player meshes. Set render order per mesh and verify crossing limbs/sword do not ink themselves, even with a loaded GLB.
- **HUD projection drift:** derive renderer and projection frustum from the same pure helper; test agreement against a Three.js camera. HPA-792 will pass the **active, smoothed** pose when it adds a caller.
- **Navigation test drift:** switch the e2e mentor approach from `A+W` to `W` in the same change as input remapping. The new `W` matches the old diagonal world direction, preserving the real mentor interaction rather than skipping it.
- **Scope growth:** defer any HUD anchors and quest state to their already tracked tickets HPA-792 and HPA-791.

## Follow-on work

HPA-790 unblocks [HPA-791 (village quest chain)](https://linear.app/cwchanap/issue/HPA-791/village-quest-chain-first-day-at-the-sect) and [HPA-792 (ink-and-paper HUD)](https://linear.app/cwchanap/issue/HPA-792/wuxia-ink-and-paper-hud). Both stay in separate, single-ticket PRs.
