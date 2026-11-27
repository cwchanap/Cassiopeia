# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Cassiopeia is a SvelteKit + Three.js prototype of a 3D Wuxia RPG ("Mountain Sect Initiate"). A single route (`src/routes/+page.svelte`) hosts a fixed 2.5D isometric mountain-sect scene where a new disciple completes a five-step first-day quest — pay respects to Elder Shen, dash the three gate markers in order, fetch medicine from Auntie Qin, ring the shrine bell at the Whispering Bamboo Shrine, and win a spar with Senior Brother Lu — then roams the village freely. Five stationary villagers (Elder Shen, Senior Brother Lu, Auntie Qin, Old Zhu, Peddler Wei) stand at authored posts across the map.

- **Language**: TypeScript (strict), Svelte 5 (runes mode forced for all non-`node_modules` files in `svelte.config.js`)
- **Package manager**: bun
- **Stack**: SvelteKit + Vite + Tailwind v4 + Three.js (no game engine; vanilla Three.js)
- **Design spec / implementation plan**: `docs/superpowers/specs/` and `docs/superpowers/plans/` — read these before changing gameplay or architecture.

## Commands

```sh
bun run dev          # vite dev server
bun run build        # production build (used by Playwright webServer)
bun run preview      # preview production build on :4173
bun run check        # svelte-kit sync && svelte-check (typecheck)
bun run lint         # prettier --check + eslint
bun run format       # prettier --write
bun run test:unit    # vitest (both client + server projects)
bun run test:e2e     # playwright install && playwright test
bun run test         # unit (--run) + e2e
```

Run a single test:

```sh
bun x vitest run src/lib/game/simulation/state.spec.ts
bun x vitest run -t 'duel start'                     # by name
bun x playwright test src/routes/wuxia-mvp.e2e.ts    # e2e file
```

Vitest is split into two projects (see `vite.config.ts`):

- **client**: browser-mode (Playwright/Chromium headless), picks up `*.svelte.{test,spec}.{js,ts}`. Used for component tests via `vitest-browser-svelte`.
- **server**: Node, picks up the rest of `*.{test,spec}.{js,ts}`. Used for pure simulation logic.

Playwright e2e tests live alongside routes with the `.e2e.ts` suffix (see `playwright.config.ts` `testMatch`); the webServer builds + previews the app on port 4173 — they do **not** share the dev server.

## Architecture

The codebase enforces a strict separation between the SvelteKit shell, a pure-TypeScript simulation, a Three.js renderer, and an input controller. They communicate only through plain data (`InputSnapshot`, `GameState`, `HudSnapshot`).

```
src/routes/+page.svelte
  └─ createGameRuntime({ host, onHudUpdate, onError })
       ├─ createInputController(host)        ─► InputSnapshot   (input/)
       ├─ stepGame(state, input, dt)          (simulation/)
       ├─ createWuxiaScene(host).render(state) (render/, Three.js)
       └─ toHudSnapshot(state) ─► onHudUpdate (drives Svelte HUD)
```

- **`src/lib/game/runtime/`** — `createGameRuntime.ts` owns the `requestAnimationFrame` loop, ties everything together, and is the only place that touches lifecycle (`start` / `dispose`). It catches Three.js init errors and surfaces them through `onError` so the route can render the fallback panel. `dispose` is idempotent and must remain so — the page's `Attachment` returns it as the cleanup callback. `save.ts` owns v2 `{ items, quest }` persistence under the `cassiopeia.gameProgress.v2` localStorage key; the legacy `cassiopeia.itemProgress.v1` key is ignored, not migrated.
- **`src/lib/game/simulation/`** (`state.ts`, `quest.ts`, `villageContent.ts`, `world.ts`, `interaction.ts`, `dialogue.ts`, `items.ts`, `combat.ts`, `types.ts`) is pure TypeScript. It must not import Three.js, DOM, or Svelte. `stepGame` is the only mutator; `toHudSnapshot` is the only read path for UI. Authored content — the five villagers, the ordered dash markers, and the shrine bell — lives in `villageContent.ts`; walkability, collision, and named regions (`regionAt`) live in `world.ts`; quest progression lives in `quest.ts`. Constants and helpers (ranges, speeds, cooldowns, distance) live in `combat.ts`.
- **`src/lib/game/simulation/battle/`** is the isolated headless battle engine (HPA-1310): a deterministic turn-based square-grid battle for a squad, with its own battle-local cells, facing, arts and fighter types — deliberately separate from `FighterState`/`combat.ts`, with no Three.js, DOM, Svelte, clock or randomness. It is **not wired into the live game**: `stepGame`, GameMode, HUD, save and renderer are untouched. Consumers (HPA-1315 playable spar) use only `index.ts`: `createBattle(setup)`, `getTurnOrder`, `getReachableCells`, `getMoveTargets`, `applyBattleCommand(state, command)`, `forecastMove(state, actorId, moveId, aim)` and `planBattleTurn(state, actorId, profile)`, plus the exported grid geometry and authored content. `applyBattleCommand` is the only mutator and never mutates its input; `forecastMove` reuses that same reducer rather than a parallel formula; state and events are plain JSON, so a round trip preserves legal queries and results. Authored data lives in `content.ts`; rule-independent weighted movement/targeting in `grid.ts`; validation, damage, counters, items, turns and forecast in `rules.ts`. The public-API journey (complete scripted 12 × 12 victory, replay and JSON round trip) is `battle.journey.spec.ts`.
- **Battle AI planner (HPA-1311)** lives in the same module's `ai.ts` and stays headless: nothing in `stepGame`, GameMode, HUD, save or the renderer consumes it, and HPA-1315 owns the playable-spar integration — including runtime scheduling and whether to replay a planned sequence or replan `planBattleTurn(state, actorId, profile)[0]` at each command boundary. `planBattleTurn` returns one complete legal turn as plain `BattleCommand[]` — an optional move, one action, and `endTurn` with final facing (no `endTurn` when the action ends the battle or a counter kill auto-advances the turn; an already-moved actor cannot move again, an already-acted actor only chooses facing) — for the caller to replay through `applyBattleCommand`. It never mutates its input, uses no clock or randomness, plans no items, and returned commands own their coordinates. The profile is **caller-owned** — `BattleAiProfile` is `{ archetype: 'aggressor' | 'marksman' }` or `{ archetype: 'guardian'; post: Cell }`, never stored in `BattleState`, fighter templates or saves — and is validated before anything else: a missing profile, an archetype outside the three closed IDs, or a missing/fractional/out-of-bounds/unstandable Guardian post throws even for terminal battles or inactive/unknown actors; only a valid profile earns the `[]` returned for terminal, dead, unknown or non-active actors. Scoring is one additive integer formula driven by the deep-frozen `AI_SHARED_WEIGHTS` and `AI_ARCHETYPES` catalogs in `content.ts` (`AiArchetypeWeights`/`AiArchetypeId` types in `types.ts`, all public through the barrel): actual reducer-applied damage, defeats, counter loss, qi spent/gathered, flank steps and positioning (bamboo, preferred range, adjacency, Guardian post distance, threats), compared by terminal rank then integer score with a stable first-on-tie scan order — stay first, movement cost/discovery order, basic/technique/finisher slots then Guard and Gather, current facing then remaining N/E/S/W. Hostile exposure comes from a single actor-excluded geometric threat map built once per decision — a documented approximation, never a second rules engine; every candidate command is applied and validated through the real reducer. `ai.spec.ts` covers the contract and archetype behavior, `ai.journey.spec.ts` runs three public-API AI-vs-AI battles to natural terminal outcomes with exact fresh/JSON-round-trip replay equality, and `ai.perf.spec.ts` always runs its legality test but gates the 16.7 ms frame-budget timing behind `RUN_AI_BENCH=1`.
- **`src/lib/game/render/`** owns Three.js. `createWuxiaScene` allocates geometries/materials into a `SceneResources` registry so `dispose()` can tear them down deterministically. `camera.ts` is pure TypeScript: `computeWuxiaCameraPose` builds the fixed 45° azimuth / 35° pitch pose, `orthoFrustum` is the single source of the projection frustum, `projectWorldToScreen` projects world points into host CSS pixels against that same frustum, and `screenDirectionToWorld` maps screen input into world movement. The renderer follows the focus and `viewHeight` only, smooths both by the same factor, reconstructs position from the fixed direction, and reapplies the frustum every frame; camera azimuth, pitch, zoom, and pointer-drag rotation are intentionally absent. Opaque world geometry renders before ink silhouettes and then the player so crossing limbs and gear do not self-ink; NPC actors share the player's render order so an occluded player's ink never draws over them. `wuxiaAssets.ts` loads the `mountain-sect.glb` pack into the `Player`/`Rival`/`Mentor`/`Village` targets and leaves the procedural scene playable on failure; on the ready path the extra villagers (Qin, Zhu, Wei) reuse a cloned `Mentor` model that shares GLB geometry/textures and swaps in a registered, per-villager tinted `Handpainted_Wuxia_Atlas` material.
- **`src/lib/game/input/createInputController.ts`** translates DOM events into a single `InputSnapshot` per frame. WASD and arrow keys are screen-aligned through `screenDirectionToWorld`; pointer drag only focuses the canvas. Edge-triggered actions (`dash`, `lightAttack`, `qiBurst`, `interact`, `pause`) are consumed inside `getSnapshot()` — call it exactly once per frame.

There is exactly one fixed isometric view. Keep `camera.ts` free of Three.js, DOM, and Svelte imports, and derive the renderer and world-to-screen projection from the same `orthoFrustum`. Do not reintroduce camera rotation, zoom, drag-to-look, or a compatibility toggle.

When extending gameplay: add fields to `GameState`/`InputSnapshot`/`HudSnapshot` in `simulation/types.ts`, update `stepGame` and `toHudSnapshot`, then let the renderer and HUD pick up the new snapshot. Don't add gameplay rules into the Three.js layer.

The HUD (HPA-792) is driven entirely by `HudSnapshot` (initial values come from `toHudSnapshot(createInitialGameState())`). `+page.svelte` derives one `hudLayout({ mode, isPaused, bagOpen })` from `src/lib/hud/layout.ts` that decides which components render per mode/overlay. The component tree under `src/lib/hud/`: `Vitals` (health/qi brush bars), `QuestScroll` (full or one-line objective), `MiniMap` (SVG map centered on the player), `WorldAnchors` (camera-projected villager names, quest pointer and the single `game-prompt`), `DialogueScroll`, `DamageNumbers`, `TechniqueBar` (quick slots, cooldowns, bag toggle) and `PlaceBanner` (named-region arrival announcement; bilingual titles in `labels.ts` `REGION_TITLES`). All shared styling lives in `src/lib/hud/hud.css`; `+page.svelte` keeps only layout/overlays.

MiniMap math lives in `src/lib/hud/map.ts`: `worldToMap` reuses `worldDirectionToScreen` from `camera.ts` so map bearings match screen movement exactly; `mapTarget` clamps the quest marker to a `MINIMAP_RADIUS_METRES` rim pointer with a metre distance label when the target is off-map. `WorldAnchors` and `DamageNumbers` position screen elements from the renderer's actual `WuxiaProjectionFrame` (the same `orthoFrustum` used to draw), never a recomputed pose.

HUD fonts: `static/fonts/wuxia/` holds `CormorantGaramond.woff2` and the subset `MaShanZheng-hanzi.woff2`; `hanzi-glyphs.txt` lists every glyph the subset must cover (including the three region titles) and is checked by `src/lib/hud/fonts.spec.ts`. Regenerate subsets with `python3 scripts/build_wuxia_fonts.py <MaShanZheng-Regular.ttf path> <CormorantGaramond.ttf path>` (both TTF paths are required arguments).

The page-level Svelte component uses Svelte 5 runes (`$state`, `$derived`, `$props`) and the new `{@attach}` syntax to mount the runtime on a `<div>`. Keep this pattern when adding new mount points.

## Conventions

- **Prettier**: tabs, single quotes, no trailing commas, 100-col print width. `prettier-plugin-svelte` and `prettier-plugin-tailwindcss` are active.
- **ESLint**: flat config in `eslint.config.js` extends `js`, `typescript-eslint`, and `eslint-plugin-svelte`, then `prettier`. `no-undef` is intentionally off because typescript-eslint covers it.
- **`$lib` alias** is the only configured path alias (SvelteKit default). Use `$lib/game/...` rather than relative paths from routes.
- **Adapter is `adapter-auto`** — no specific deployment target is committed; switch adapters in `svelte.config.js` when targeting a real environment.

## Svelte MCP

The `svelte` MCP server (`.mcp.json`) provides authoritative Svelte 5 / SvelteKit docs. Prefer it over training knowledge.

- `list-sections` first to find relevant docs (call at the start of any Svelte work).
- `get-documentation` to fetch the sections that match the task's `use_cases`.
- `svelte-autofixer` after writing or modifying any `.svelte` code — keep calling until it returns no issues.
- `playground-link` only on user request, and never when the code was written into project files.
