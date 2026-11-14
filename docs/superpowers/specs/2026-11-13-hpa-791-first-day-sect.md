# HPA-791 — First Day at the Sect (Design Spec)

**Linear:** [HPA-791 — Village quest chain](https://linear.app/cwchanap/issue/HPA-791/village-quest-chain-first-day-at-the-sect)  
**Dependency:** HPA-790 (complete); **unblocks:** HPA-792 (HUD).  
**Delivery:** One draft PR for HPA-791, including this spec, its plan, and eventual gameplay implementation.  
**Status:** Proposed design only; no implementation is claimed by this document.

## Goal and journey

Replace the old mentor → one dash → duel tutorial with **入门第一日 / First Day at the Sect** in the existing fixed-isometric village. The quest is data-authored and ends in free roam. Preserve current movement/collision, combat timing, item definitions, reward roll, map, and camera.

1. **拜师 / Pay Respects** — Find Elder Shen in the courtyard; complete his E-advanced dialogue.
2. **轻功 / Lightness Training** — Dash through three ordered markers on the open approach to the village gate. A dash must actually cross each marker.
3. **取药 / Fetch Medicine** — Talk to Auntie Qin outside the Herbalist. Receive two existing Lesser Healing Pills, open the bag, and explicitly assign one to a quick slot.
4. **鸣钟 / Ring the Shrine Bell** — Walk west to Whispering Bamboo Shrine and press E within reach of the bell.
5. **切磋 / Spar with the Rival** — Return to the courtyard, finish Senior Brother Lu's dialogue, win the existing duel, and receive one normal victory reward.

After victory the quest is complete and exploration continues. Defeat respawns the player in the courtyard with full health/qi, still on step 5; talking to the rival starts a rematch. No rest/healing system or repeatable rewards after completion.

## Architecture: small pure modules and one mutator

Keep `stepGame` in `simulation/state.ts` as the only game-state mutator. Do not introduce a quest engine, event bus, generic script interpreter, server persistence, or migrations.

- `simulation/villageContent.ts` contains five stationary villager records, their names/English dialogue, colors, positions, the bell, three dash markers, and five ordered quest step definitions. Step instances are data; five kinds stay in a small code switch: `talk | dashMarkers | receiveItem | object | duel`. Each has a stable ID, target ID, hanzi/English title, one-line instruction, and kind-specific data (e.g. `grant: { itemId, count }`). More content of an existing kind is a data edit.
- `simulation/interaction.ts` selects the nearest eligible villager or bell within `INTERACT_RANGE`, a rename of existing `MENTOR_INTERACT_RANGE` (1.5 m) in `combat.ts`, using existing `distance`. Resolve ties by content order; dash markers are not E targets.
- `simulation/dialogue.ts` handles linear lines and one E edge per line. Ambient dialogue has no quest effect.
- `simulation/quest.ts` evaluates typed completion events for the active step. Use `QuestProgress = { stepIndex: number, stepProgress: number }`: stepIndex 0–5 (5 = complete), stepProgress 0–2 for the next marker or 0/1 for item grant, 0 otherwise. Reset stepProgress to 0 when advancing. Validate based on the active step's required progress, not item-specific saved fields.
- `simulation/world.ts` already reads `world-layout.json` and remains the collision authority. Add a pure `regionAt(position)` over existing region bounds. Keep route and collision logic unchanged.
- `simulation/items.ts` exports a small `grantItem(progress, itemId, count)` wrapper around its existing private `incrementItem`, so the quest never mutates raw inventory counts itself.

### Game mode, pause, dialogue, and overlay

Use `GameState.mode` as a tagged union: `{ kind: 'explore' } | { kind: 'dialogue'; villagerId; lineIndex } | { kind: 'duel' }`, with an independent `paused: boolean` and the existing `inventoryOpen: boolean`. This replaces `GamePhase`, `ActiveGamePhase`, `previousPhase`, the redundant nullable dialogue state, and stored phase-specific objective text. No compatibility alias is needed.

`HudSnapshot` derives a readable mode plus `isPaused` without hiding the underlying duel context when paused. The rival meter stays visible behind the pause overlay; pause toggles do not change the camera's duel framing. Esc pauses/resumes any activity; in dialogue, E advances only while not paused. Do not open the bag while dialogue or pause is active. Existing bag focus and action handling remain in exploration/duels.

`stepGame` processes allowed inventory commands first (including **quest completion triggered by a deliberate assignment**), then handles pause/overlay early returns, dialogue E, exploration movement/interactions/markers, and duel logic. A bag assignment is routed through the existing zero-dt `runInventoryCommand` path, so the receive-item step MUST advance inside `processInventoryCommands`, **before** the `inventoryOpen` early return. Opening the bag and assigning slots never move the player or advance combat.

### Interaction and completion rules

- Elder Shen's step-1 dialogue advances the quest **on the last line**. After step 1, he offers ambient dialogue only. Old Zhu and Peddler Wei always offer ambient lines. Auntie Qin outside step 3 is ambient. E out of range and wrong-step interactions never advance the quest.
- `movePlayer` returns the actual dash segment (`{ from, to } | null`), only when the cooldown allows a dash and `moveThroughWorld` has changed the position. The quest tests that segment against the next marker radius using a point-to-segment distance check; walking, blocked/cooling dashes, out-of-order markers, and a repeated same-frame event do not count. Each successful dash may advance at most one marker.
- In step 3, finishing Auntie Qin's dialogue changes `stepProgress` from 0 to 1 **before** granting two `lesser_healing_pill` via `grantItem`. Reopening dialogue cannot grant again. Because the starter kit already has a healing pill in slot 1, require an explicit `assignQuickSlot` command of `lesser_healing_pill` while at progress 1; it may reaffirm slot 1. Complete the step during that command even with bag open and dt = 0. Combined save of items + quest prevents a partial reload from duplicating pills.
- In step 4, E within range of the bell completes the step. The bell has no other mechanic.
- At step 5, E on Lu starts his short dialogue; the duel begins on the **last line**. Before step 5 he is ambient. Each duel start refills player health and qi to equipment-derived maxima, clears temporary actions/cooldowns and resets rival health, position and AI. On defeat, respawn at a safe courtyard position, refill to max, clear combat effects, and keep step 5 pending. E on Lu repeats the same dialogue and starts the rematch.
- On first victory, call existing `grantVictoryReward` exactly once, mark the quest complete, hide duel-only UI, and resume free roam with non-blocking reward text. After completion Lu is ambient; he cannot start another duel or roll another reward.

### Content reachability

Reuse `world.spec.ts`'s waypoint routes, which already reach the Bamboo Shrine region through `moveThroughWorld`, and add a real-collision Node quest journey. Do not place objects at building centers: `world.spec.ts` explicitly proves (-44, -18), the shrine building center, is **blocked**. Place the bell on walkable shrine frontage, not at the shrine center. Position Auntie Qin outside the Herbalist's collision box at (5, -10), and the peddler on the walkable market path. Keep Elder Shen at (-4, -3) and Lu at the courtyard ring. Tune marker centers along a traversable southbound gate line using test-backed dash paths, not visual guesses.

Test every intended interaction position with `canStandAt` **and** reachability via `moveThroughWorld` from the courtyard, using existing world routes. This is content validation only; do not change world geometry.

## Rendering and temporary HUD

Render data-defined villagers, markers, and bell in the existing Three.js scene without adding models or artwork. Reuse `createDisciple` fallback meshes for the three new villagers. When GLB assets become ready, clone the attached `Mentor` model in the existing `onStatus('ready')` callback (no new loader targets); clone and tint the `Handpainted_Wuxia_Atlas` material per villager as a placeholder, since the GLB has no separate robe material. Share geometry/texture, register cloned materials for disposal, and preserve procedural fallback if assets fail.

Apply `setMeshRenderOrder(…, PLAYER_RENDER_ORDER)` to **all five non-player actors**, both procedural and GLB paths, so the player's ink silhouette cannot draw over them. Marker and bell meshes are visuals only; simulation owns trigger rules.

Extend `HudSnapshot` with the fields HPA-792 explicitly needs: gameplay mode/paused state, quest step/title/instruction and marker progress, speaker/current line/line index, nearest eligible interact target, current region, and villager IDs/names/positions. Keep existing vitals, cooldowns, rival meter and bag/quick-slot fields; do not add a redundant target-position or minimap projection service. The later HUD ticket can add fields required by its actual components.

For HPA-791 only, retain `+page.svelte`'s objective chip and prompt line for the step title, E interaction, dialogue line, markers, medicine instruction and reward. Keep old DOM test IDs where the element survives; remove the old victory/defeat modal and restart action. Initialize the page HUD via `toHudSnapshot(createInitialGameState())` rather than duplicating its object shape; use the same initial state for the renderer. Keep HPA-792's minimap, anchors, ink-paper components, fonts, portraits and mockups out of scope.

## Save and reload

Save a single JSON object **`{ items, quest }`** under `cassiopeia.gameProgress.v2`. The key encodes schema version; do not add a duplicate top-level `version` field. `ItemProgress` retains its internal v1 format and normalization. Validate quest step/progress bounds against the current content; invalid or unreadable data creates fresh items and quest at step 1. Ignore `cassiopeia.itemProgress.v1` entirely, without migration.

Runtime persists only when serialized item/quest data change and retries failed writes. Dialogue, mode, paused flag, position, active duel, cooldowns, effects, and UI overlays are transient. Reload places the player at courtyard spawn, exploring at the saved quest step/substep; it does not restart a conversation or active duel.

## Acceptance criteria

1. **Deterministic end-to-end journey:** one Node `stepGame` test drives real `moveThroughWorld` waypoint navigation, all five quest stages, dialogue E, three actual dash crossings, medicine grant and deliberate slot assignment, bell E, duel victory, one reward, and post-win exploration. Focused Node tests cover distance, cooldown/blocked dash, step ordering, pause/dialogue freeze, defeat respawn/rematch, v2 reload at marker/item stages, idempotency and old-key rejection.
2. **Desktop browser opening:** the existing Playwright E2E exercises real inputs for Elder dialogue → three markers → Auntie Qin → bag assignment. It then seeds the **real v2 localStorage save** at step 5, reloads, starts the actual duel through Lu's dialogue, verifies reward/free roam, and reloads to check completion. The long shrine route is covered by the Node journey, not flaky timed browser key holds. No production debug API.
3. **macOS and Windows end-to-end acceptance:** the focused Playwright browser smoke checks execute with keyboard controls and validate the opening, seeded duel, and persistence. Preserve Linux GitHub Actions as CI, without creating a cross-OS runner matrix solely for this task. iOS touch is out of scope for this keyboard-first prototype.
4. **Visual acceptance (macOS and Windows):** browser checks at 960×640 and a desktop-wide viewport verify visible NPCs, active marker, shrine bell, prompt/dialogue text, and the duel meter with the pause overlay. Capture screenshots as diagnostic artifacts; **no committed screenshot baselines** for temporary HUD art. HPA-791 has no attached UI mockup; HPA-792's four mockups belong to its own ticket.
5. **Quality and lifecycle:** unit tests cover quest/event/data logic and renderer ownership; GLB-ready and fallback paths do not leak cloned materials/meshes/listeners. `bun run check`, `bun run lint`, and `bun run test` stay green at every vertical slice. Linux verification is CI-only; no Android/Linux or human acceptance criterion.

## Explicitly deferred

HPA-792 ink-and-paper HUD, world-anchored name tags and minimap, new image/SFX assets, shops and currency, dialogue choices, villager schedules/pathfinding, new combat moves, gamepad/touch controls, interiors, save migrations and cross-platform CI infrastructure. Keep all HPA-791 implementation in this **one PR**.
