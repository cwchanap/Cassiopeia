# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Cassiopeia is a SvelteKit + Three.js prototype of a 3D Wuxia RPG ("Mountain Sect Initiate"). A single route (`src/routes/+page.svelte`) hosts a fixed 2.5D isometric courtyard scene where the player meets a mentor, trains a qinggong dash, and duels a rival disciple.

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

- **`src/lib/game/runtime/createGameRuntime.ts`** owns the `requestAnimationFrame` loop, ties everything together, and is the only place that touches lifecycle (`start` / `restart` / `dispose`). It catches Three.js init errors and surfaces them through `onError` so the route can render the fallback panel. `dispose` is idempotent and must remain so — the page's `Attachment` returns it as the cleanup callback.
- **`src/lib/game/simulation/`** (`state.ts`, `combat.ts`, `types.ts`) is pure TypeScript. It must not import Three.js, DOM, or Svelte. `stepGame` is the only mutator; `toHudSnapshot` is the only read path for UI. Constants and helpers (ranges, speeds, cooldowns, distance) live in `combat.ts`.
- **`src/lib/game/render/`** owns Three.js. `createWuxiaScene` allocates geometries/materials into a `SceneResources` registry so `dispose()` can tear them down deterministically. `camera.ts` is pure TypeScript: `computeWuxiaCameraPose` builds the fixed 45° azimuth / 35° pitch pose, `orthoFrustum` is the single source of the projection frustum, `projectWorldToScreen` projects world points into host CSS pixels against that same frustum, and `screenDirectionToWorld` maps screen input into world movement. The renderer follows the focus and `viewHeight` only, smooths both by the same factor, reconstructs position from the fixed direction, and reapplies the frustum every frame; camera azimuth, pitch, zoom, and pointer-drag rotation are intentionally absent. Opaque world geometry renders before ink silhouettes and then the player so crossing limbs and gear do not self-ink.
- **`src/lib/game/input/createInputController.ts`** translates DOM events into a single `InputSnapshot` per frame. WASD and arrow keys are screen-aligned through `screenDirectionToWorld`; pointer drag only focuses the canvas. Edge-triggered actions (`dash`, `lightAttack`, `qiBurst`, `interact`, `pause`) are consumed inside `getSnapshot()` — call it exactly once per frame.

There is exactly one fixed isometric view. Keep `camera.ts` free of Three.js, DOM, and Svelte imports, and derive the renderer and world-to-screen projection from the same `orthoFrustum`. Do not reintroduce camera rotation, zoom, drag-to-look, or a compatibility toggle.

When extending gameplay: add fields to `GameState`/`InputSnapshot`/`HudSnapshot` in `simulation/types.ts`, update `stepGame` and `toHudSnapshot`, then let the renderer and HUD pick up the new snapshot. Don't add gameplay rules into the Three.js layer.

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
