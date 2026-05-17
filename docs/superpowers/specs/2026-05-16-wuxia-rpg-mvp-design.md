# 3D Wuxia RPG MVP Design

## Summary

Cassiopeia's first playable slice is a 3D Wuxia browser RPG prototype called **Mountain Sect Initiate**. The player starts in a misty mountain sect courtyard, meets a mentor, practices a qinggong-style dash, and duels a rival disciple in real time.

The MVP proves the core feel: third-person movement, readable camera framing, Wuxia atmosphere, one martial technique, and a win/loss combat loop. It deliberately avoids inventory, leveling, save files, multi-map exploration, complex dialogue trees, and full RPG stat progression.

## Approved Direction

- Fantasy: **Mountain Sect Initiate**
- Combat feel: **action-lite real-time**
- Visual direction: **Misty Sect Courtyard**
- Runtime stack: **SvelteKit + vanilla Three.js + pure TypeScript simulation**
- Phaser: excluded from the first slice

## Gameplay Loop

1. The player starts in a sect courtyard with a compact objective: meet the mentor.
2. The player approaches the mentor and presses the interact action to begin training.
3. The player practices movement and dash in the courtyard.
4. A rival disciple enters and starts a duel.
5. The player wins by reducing rival health to zero.
6. The player loses when their health reaches zero.
7. Win/loss overlays offer a restart.

## Player Verbs

- Move around the courtyard.
- Rotate or steer the third-person camera.
- Dash with a qinggong-style burst.
- Use a light martial attack.
- Use one qi burst technique.
- Interact with mentor prompts.
- Pause or restart.

## Controls

- `WASD`: movement
- Mouse drag or arrow keys: camera heading
- `Space`: dash
- `J`: light attack
- `K`: qi burst
- `E`: interact
- `Esc`: pause

## Architecture

The SvelteKit page is the browser shell. It mounts the game client-side, renders the DOM HUD, and cleans up the runtime on unmount. Three.js owns only the 3D scene, render loop, camera, lighting, effects, and mesh updates. Pure TypeScript modules own simulation state and rules.

Initial structure:

```text
src/lib/game/
  assets/
  input/
  render/
  simulation/
  ui/
src/routes/+page.svelte
```

### SvelteKit Route Shell

- Mount the game runtime in `onMount` so Three.js runs only in the browser.
- Render HUD, prompt, pause, win, and loss UI as DOM overlays.
- Show a readable fallback if WebGL initialization fails.
- Keep route-level lifecycle responsible for runtime cleanup.

### Three.js Renderer

- Render the sect courtyard, player, mentor, rival, training props, lighting, camera, and qi effects.
- Read simulation snapshots and update scene objects.
- Dispose renderer, materials, geometries, textures, listeners, and animation handles during cleanup.
- Keep gameplay rules out of Three.js meshes and materials.

### Simulation

- Own serializable game state: objective phase, duel phase, positions, health, qi, cooldowns, hit windows, win/loss status, and prompt availability.
- Consume normalized input actions and `deltaTime`.
- Return lightweight snapshots for renderer and HUD.
- Keep hit checks simple for MVP: distance/range based, with clear cooldown windows.

### Input

- Map physical keyboard and mouse events into named actions such as `move`, `dash`, `lightAttack`, `qiBurst`, `interact`, and `pause`.
- Gate combat actions when paused, ended, or outside the duel phase.
- Keep camera-control state explicit so UI overlays do not fight play controls later.

## UI Design

The first playable view uses low-chrome DOM UI to protect the 3D playfield.

- Top-left: compact objective chip with current task and duel phase.
- Top-right: compact status cluster for health, qi, and dash cooldown.
- Bottom-center: transient interaction or restart prompt.
- Pause/help overlay: on demand only.

The normal play view should not use a full-width header, full-width footer, large centered lore cards, or dashboard-style panels.

## Visual Direction

The scene should read as a misty mountain sect courtyard:

- Stone courtyard floor and raised duel space.
- Bamboo, training posts, shrine or mentor area, and mountain mist.
- Stylized placeholder character geometry with readable robe colors.
- Qi glow, dash trail, and ink-like hit effects.
- Restrained green, stone, mist, robe, and warm accent colors, avoiding a single-hue palette.

The first asset pass can use procedural geometry and simple materials. GLB or glTF 2.0 should be the default format when authored character or environment assets are introduced later.

## Data Flow

1. Route mounts game runtime.
2. Input layer records physical input and exposes action state.
3. Each animation frame sends `deltaTime` and actions to simulation.
4. Simulation updates state and produces renderer/HUD snapshots.
5. Renderer applies the latest snapshot to Three.js objects.
6. Svelte HUD renders the latest UI snapshot.
7. Runtime cleanup runs when the route unmounts.

## Error Handling And Fallbacks

- WebGL initialization failure shows a fallback panel instead of a blank page.
- Paused and ended states gate gameplay input.
- Invalid interactions are ignored unless a prompt is active.
- Runtime cleanup is idempotent so route unmount or restart does not leave orphaned loops/listeners.
- Development diagnostics may show frame timing and phase labels, hidden by default.

## Testing And Verification

Unit tests:

- Objective phase transitions.
- Duel start, win, loss, and restart state.
- Health and qi changes.
- Dash and attack cooldowns.
- Attack hit checks by range.

Svelte verification:

- Run the Svelte autofixer on written `.svelte` components.
- Run `bun run check` after implementation.

Browser verification:

- Start the local app.
- Confirm the Three.js canvas is nonblank.
- Confirm HUD objective/status/prompt overlays appear.
- Confirm movement changes player position.
- Confirm attack and qi actions can reduce rival health.
- Confirm win/loss restart returns to the opening state.

## Out Of Scope For MVP

- Phaser integration.
- Inventory.
- Equipment.
- Leveling.
- Save files.
- Multi-map exploration.
- Dialogue tree editor.
- Full quest log.
- Networked play.
- Auth or backend persistence.

## Open Implementation Notes

- Use vanilla Three.js for direct scene, camera, renderer, and loop control.
- Add physics only if the first hand-authored collision checks become insufficient; Rapier is the likely later choice.
- Keep the first implementation procedural and lightweight before investing in custom GLB assets.
- Keep the DOM HUD sparse and readable on desktop and mobile.
