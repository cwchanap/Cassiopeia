# HPA-791 — First Day at the Sect (Design Spec)

**Linear:** [HPA-791 — Village quest chain](https://linear.app/cwchanap/issue/HPA-791/village-quest-chain-first-day-at-the-sect)  
**Depends on:** HPA-790 (complete); **unblocks:** HPA-792 (HUD)  
**Delivery:** One draft PR for HPA-791, containing this spec, the implementation plan, and subsequent implementation.  
**Status:** Proposed design only; gameplay changes are not implemented in this documentation commit.

## Goal and player journey

Replace `seekMentor → trainDash → duel → victory/defeat` with one data-authored quest, **入门第一日 / First Day at the Sect**, playable in the existing fixed-isometric village. Preserve the existing fight, item definitions, reward roll, movement, world collisions, and camera.

1. **拜师 / Pay Respects** — Courtyard: approach Elder Shen and advance his dialogue with E. Complete when his dialogue finishes.
2. **轻功 / Lightness Training** — Courtyard to village gate: dash through three visible markers in order. Complete at the third marker crossed by a successful dash.
3. **取药 / Fetch Medicine** — Village street: speak with Auntie Qin, receive existing healing pills, then explicitly assign a pill to a quick slot in the bag. Complete after dialogue, one-time grant and assignment.
4. **鸣钟 / Ring the Shrine Bell** — Whispering Bamboo Shrine: reach the bell and press E. Complete on a valid bell interaction.
5. **切磋 / Spar with the Rival** — Return to the courtyard, talk to Senior Brother Lu and win the existing duel. Complete after the victory reward.

## Decisions

### 1. One simple mode and quest state

Replace `GamePhase`/`ActiveGamePhase`, `previousPhase`, and the phase-specific objective map with:

- `GameMode = 'explore' | 'dialogue' | 'duel' | 'paused'` and a `previousMode` for Escape toggle; inventory remains the existing independent overlay.
- `QuestProgress`: `stepIndex` (0–5, where 5 means complete), `dashMarkerIndex` (0–3) and `medicineReceived` (boolean). This is the **only persistent quest state**. When the dialogue ends in step 3, set `medicineReceived` before granting pills so repeated conversations cannot duplicate them. A quick-slot assignment then completes the step.
- Transient `DialogueState = { villagerId, lineIndex } | null`. It is intentionally not saved: reopening a dialogue or reloading can replay lines without replaying one-time rewards.
- Existing `FighterState` and `ItemProgress` stay intact. Combat remains gated on `mode === 'duel'`; no extra battle-state abstraction or event bus.

`stepGame` stays the sole game mutator. Its order is: process allowed bag commands, handle pause/overlay, advance dialogue on E (and return without simulating movement/combat), otherwise move and process the nearest E interaction, recognize **successful** dash-marker crossings, then run combat only during the duel. Use one input snapshot per animation frame as today.

Esc while dialogue is active pauses/resumes the dialogue; E advances it. Opening the bag is disabled in dialogue or while paused; existing bag focus behavior remains unchanged in exploration and duels. When the bag is open, movement and combat are frozen as before. Dialogue and pause never allow movement or attacks to leak through on the same frame.

### 2. Small pure simulation modules; content is data

Keep `state.ts` as orchestration and retain `combat.ts`/`items.ts` rather than building a generic RPG framework.

- `simulation/villageContent.ts` holds the single ordered quest definition, five static villager records, dialogue lines, three marker positions, bell position, and their display names/colors. Steps have IDs, hanzi/English titles, a one-line instruction, an interaction kind (`dialogue`, `dashMarkers`, `medicine`, `object`, `duel`), and target ID. Adding another step of an existing kind or another villager is a data edit; a **new kind** may require new logic.
- `simulation/interaction.ts` contains deterministic pure selection of the closest in-range eligible villager or object; E uses one common interaction range (start at 1.5 m, matching today's mentor). Resolve distance ties by stable content order. Dash markers are proximity **crossing triggers**, not E interactables.
- `simulation/dialogue.ts` starts and advances a linear sequence of lines with E and emits a completion result. Ambient conversations with Old Zhu and Peddler Wei do not advance the quest.
- `simulation/quest.ts` contains the five-step progress reducer/helpers and typed completion events. The step rules reference content IDs and existing actions; there is no dialogue tree, scripting language, command registry, or separate engine.
- `simulation/world.ts` remains the collision authority. Reuse `world-layout.json` for region rectangles and existing walkability checks; do not modify terrain/building geometry.

Use content positions that are actually reachable according to `canStandAt`, including the narrow village gateway and shrine frontage. The current layout has the Elder at (-4, -3), courtyard/gate near (0, -7), Herbalist building at (5, -10), Bamboo Shrine at (-44, -18), and Jadebank Market near (30, 40). Seed the three ordered dash markers approximately along the open gate corridor (around x = 0, z = -1.5/-3.7/-5.9); validate/tune the exact positions and crossing radius against collision and actual screen-aligned movement, not by visual guess. Place the bell on walkable ground **in front of** the shrine. The shrine keeper is nearby; the peddler lives at the market.

### 3. Interaction and progress rules

- E in `explore` selects the nearest eligible villager or bell within range. Elder Shen is the existing mentor; Senior Brother Lu is the existing rival, now visible while idle. Auntie Qin, Old Zhu, and Peddler Wei are new stationary villagers, reusing character appearance with different robe colors. A villager's ambient lines must not accidentally complete the wrong quest step.
- Elder dialogue completion advances step 1 once. The player may explore freely between every step; markers/quest actions outside their active step cannot skip progress.
- Each marker counts only if the player **actually dashes** (dash ready, world movement applied) and the dash path intersects the current marker's radius. Compare the movement segment to the marker center so fast dashes cannot tunnel past; do not credit normal walking, a blocked dash, or an input during cooldown. Advance at most one marker per dash and preserve index 0–3 in progress.
- On Auntie Qin's step-3 dialogue completion, grant **two `lesser_healing_pill`** through the existing inventory data and set `medicineReceived`. Because the starter kit already assigns a healing pill to slot 1, require a deliberate `assignQuickSlot` command during this step (including reaffirming slot 1) rather than treating that pre-existing assignment as completion. Only an assignment to `lesser_healing_pill` after medicine receipt advances the quest. No new items, shop, or economy.
- The bell is a simple E target at the shrine. Other E interactions are allowed, but only the bell completes step 4.
- Interact with the rival in step 5 to begin the duel at the courtyard. Refill player health and qi to equipment-derived maxima and reset temporary combat actions/cooldowns; reactivate and reset the rival. Keep existing attack timing, damage, AI, hitstun, consumables, and `grantVictoryReward` untouched. Award exactly once at the win transition. On defeat, move the player to a safe courtyard point, clear temporary combat state, restore them to playable health, leave quest step 5 pending, and expose rival interaction for the rematch. Do not grant a defeat reward.
- At victory, enter exploration immediately. Quest completion is persistent; free roam and bag usage remain available. Do not re-enable the obsolete restart-gated terminal phase.

### 4. Rendering and temporary HUD contract

The renderer reads world/state data and draws only; it never decides quest completion or interaction range. Reuse `createDisciple` for fallback villagers. On GLB load, reuse existing character models for the extra three villagers using clones with shared geometry and individually tinted robe materials; register any cloned materials for disposal. Keep the new villagers on the procedural fallback path if GLB loading fails. Draw three lightweight marker meshes only during training, with the active marker visually distinguished, and one simple bell mesh at the shrine; no art-generation task or imported textures.

Update `HudSnapshot` to expose what HPA-792 will consume without implementing its design:

- `mode`, current quest step ID/index/title/instruction, and ordered marker progress;
- current speaker, current dialogue line and line index/count;
- nearest eligible interaction target ID/name/kind/position and the current region name (from `layout.regions`, or `null` outside one);
- static villager IDs/names/positions, plus positions for the active quest target if present;
- existing vitals, duel rival health, cooldowns, inventory, and item feedback.

For this ticket only, use the **existing** objective chip and prompt line to display the step title, contextual E prompt, dash-marker progress, or spoken line. Hide/disable combat hints during dialogue. Remove the old victory/defeat restart modal; show one non-blocking reward/completion message via the current feedback/prompt system. World-anchored name tags, minimap, paper scroll, and art remain HPA-792's responsibility. Do not add DOM/Three.js imports to simulation.

### 5. Versioned save, with no migration

Today `runtime/save.ts` persists only `ItemProgress` under `cassiopeia.itemProgress.v1`. Switch to one new key, `cassiopeia.gameProgress.v2`, with a compact envelope:

- `version: 2`
- `items: ItemProgress` (keep its internal version 1 and normalization)
- `quest: QuestProgress`

`loadGameProgress` returns starter items and quest step 1 for missing/invalid storage. Ignore the old v1 key entirely: the ticket explicitly permits discarding old saves, so no migration or compatibility read path. Validate the small quest bounds and booleans; malformed data resets to a new game. Save only after the serialized item or quest fields change, retrying if a storage write fails as the current runtime does. Dialogue, player position, cooldowns, rival state, transient effects, mode and overlay state are not persisted. After reload, respawn in the courtyard in exploration at the saved step/substep; never reopen a duel/dialogue automatically.

Do not add server persistence, storage abstractions, save slots, or migration machinery.

## Scope boundaries

No HUD visual rebuild (HPA-792), new art/SFX (HPA-793 is separate and complete), combat tuning, new NPC AI, schedules/pathfinding, shops/currency, branching choices, interiors, new regions/buildings, touch/gamepad controls, or compatibility for superseded saves/phases.

## Acceptance criteria (end-to-end)

1. **Desktop journey (macOS and Windows):** automated Chromium/Playwright coverage starts from clear storage, completes all five steps through actual controls (WASD/arrows, Space, E, bag quick-slot assignment, J/K), wins the duel, verifies one reward, and continues moving/using the bag after victory without restart.
2. **Recovery and persistence (macOS and Windows):** a reload during the marker step restores its marker index; a reload after medicine pickup does not grant duplicate pills; a reload at step 4/5 retains that step; a defeat respawns the player in the courtyard and E on the rival begins a full-health/full-qi rematch; completion persists across reload.
3. **Mode and rule boundaries:** dialogue E advances one line per keypress while movement/combat are paused; Esc pause, inventory overlay, out-of-range E, wrong-order markers, cooldown/blocked dashes, and ambient NPC dialogue cannot bypass quest gates. Existing world collisions and combat/reward rules remain intact.
4. **Visual check (macOS and Windows):** automated browser screenshots at the existing 960×640 viewport and a 1440×900 desktop viewport show all five villagers, readable temporary objective/dialogue text, an active dash marker, the shrine bell, and unobstructed player/rival during the duel. Compare with committed screenshot references or assertions for these states. **HPA-791 has no attached UI mockup**; do not use HPA-792's separate HUD mockups as this ticket's target.
5. **Pure module and lifecycle coverage:** Node tests cover target-range selection, linear dialogue, quest event ordering, marker segment crossing, item grant idempotence, rematch/reset, and save normalization. Render tests/automated browser checks cover GLB-ready and fallback appearances without leaked meshes or listeners.
6. `bun run check`, `bun run lint`, and `bun run test` pass in CI. Linux verification comes from existing CI; no Android/Linux manual acceptance and no human sign-off criterion. iOS touch gameplay is out of scope.

## Follow-up

HPA-792 can consume the quest/dialogue/region/villager fields from `HudSnapshot` and create its ink-and-paper presentation without changing quest gameplay. Keep it in its own single-ticket PR.
