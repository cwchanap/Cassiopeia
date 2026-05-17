# 3D Wuxia RPG MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Mountain Sect Initiate MVP: a playable 3D Wuxia courtyard with mentor training, real-time rival duel, low-chrome HUD, and restart flow.

**Architecture:** SvelteKit owns the route shell and DOM HUD. Vanilla Three.js owns rendering and camera lifecycle. Pure TypeScript simulation owns all game rules and produces serializable snapshots for the renderer and HUD.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, Bun, Vitest, Playwright, Tailwind CSS, Three.js.

---

## File Structure

- Create `src/lib/game/simulation/types.ts`: shared simulation and HUD types.
- Create `src/lib/game/simulation/combat.ts`: constants and hit/cooldown helpers.
- Create `src/lib/game/simulation/state.ts`: initial state, frame stepping, objective phases, win/loss/restart.
- Create `src/lib/game/simulation/state.spec.ts`: unit tests for simulation behavior.
- Create `src/lib/game/input/createInputController.ts`: keyboard and pointer action mapping.
- Create `src/lib/game/render/createWuxiaScene.ts`: Three.js scene, meshes, effects, render loop, resize, cleanup.
- Create `src/lib/game/runtime/createGameRuntime.ts`: runtime coordinator between input, simulation, renderer, and HUD callback.
- Replace `src/routes/+page.svelte`: game shell, canvas host, HUD, fallback, pause/restart controls.
- Create `src/routes/+page.svelte.spec.ts`: component smoke test for static HUD/fallback-friendly route structure.
- Create `src/routes/wuxia-mvp.e2e.ts`: Playwright smoke test for canvas, HUD, keyboard flow, combat, restart.
- Modify `package.json`: add `three` runtime dependency.

## Task 1: Simulation Core

**Files:**

- Create: `src/lib/game/simulation/types.ts`
- Create: `src/lib/game/simulation/combat.ts`
- Create: `src/lib/game/simulation/state.ts`
- Test: `src/lib/game/simulation/state.spec.ts`

- [ ] **Step 1: Write failing simulation tests**

```ts
import { describe, expect, it } from 'vitest';
import { createInitialGameState, restartGame, stepGame } from './state';
import type { InputSnapshot } from './types';

const idleInput: InputSnapshot = {
	moveX: 0,
	moveZ: 0,
	cameraDelta: 0,
	dash: false,
	lightAttack: false,
	qiBurst: false,
	interact: false,
	pause: false
};

describe('wuxia simulation state', () => {
	it('starts with the mentor objective active', () => {
		const state = createInitialGameState();
		expect(state.phase).toBe('seekMentor');
		expect(state.objective).toBe('Meet the mentor');
		expect(state.player.health).toBe(100);
		expect(state.rival.health).toBe(100);
	});

	it('moves from mentor objective to dash training when interacting near the mentor', () => {
		const state = createInitialGameState();
		state.player.position.x = -4;
		state.player.position.z = -3;

		stepGame(state, { ...idleInput, interact: true }, 1 / 60);

		expect(state.phase).toBe('trainDash');
		expect(state.objective).toBe('Practice qinggong dash');
		expect(state.prompt).toContain('dash');
	});

	it('starts the duel after using dash during training', () => {
		const state = createInitialGameState();
		state.phase = 'trainDash';
		state.player.dashCooldown = 0;

		stepGame(state, { ...idleInput, dash: true }, 1 / 60);

		expect(state.phase).toBe('duel');
		expect(state.objective).toBe('Defeat the rival disciple');
		expect(state.rival.active).toBe(true);
	});

	it('light attack damages the rival when in range during the duel', () => {
		const state = createInitialGameState();
		state.phase = 'duel';
		state.rival.active = true;
		state.player.position.x = 0;
		state.player.position.z = 0;
		state.rival.position.x = 0.8;
		state.rival.position.z = 0;

		stepGame(state, { ...idleInput, lightAttack: true }, 1 / 60);

		expect(state.rival.health).toBe(88);
		expect(state.player.attackCooldown).toBeGreaterThan(0);
	});

	it('qi burst damages the rival and consumes qi when in range', () => {
		const state = createInitialGameState();
		state.phase = 'duel';
		state.rival.active = true;
		state.player.qi = 60;
		state.rival.position.x = 1.5;
		state.rival.position.z = 0;

		stepGame(state, { ...idleInput, qiBurst: true }, 1 / 60);

		expect(state.rival.health).toBe(72);
		expect(state.player.qi).toBe(25);
		expect(state.player.qiCooldown).toBeGreaterThan(0);
	});

	it('enters victory, defeat, and restart states deterministically', () => {
		const state = createInitialGameState();
		state.phase = 'duel';
		state.rival.active = true;
		state.rival.health = 1;
		state.rival.position.x = 0.8;

		stepGame(state, { ...idleInput, lightAttack: true }, 1 / 60);
		expect(state.phase).toBe('victory');

		const defeated = createInitialGameState();
		defeated.phase = 'duel';
		defeated.rival.active = true;
		defeated.player.health = 0;
		stepGame(defeated, idleInput, 1 / 60);
		expect(defeated.phase).toBe('defeat');

		const restarted = restartGame(state);
		expect(restarted.phase).toBe('seekMentor');
		expect(restarted.rival.health).toBe(100);
	});
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `bunx vitest run src/lib/game/simulation/state.spec.ts`

Expected: fail because `./state` and `./types` do not exist.

- [ ] **Step 3: Implement simulation types and behavior**

Create the files listed above with these APIs:

```ts
export type GamePhase = 'seekMentor' | 'trainDash' | 'duel' | 'victory' | 'defeat' | 'paused';

export type Vec2 = { x: number; z: number };

export type FighterState = {
	position: Vec2;
	heading: number;
	health: number;
	qi: number;
	dashCooldown: number;
	attackCooldown: number;
	qiCooldown: number;
	active: boolean;
};

export type InputSnapshot = {
	moveX: number;
	moveZ: number;
	cameraDelta: number;
	dash: boolean;
	lightAttack: boolean;
	qiBurst: boolean;
	interact: boolean;
	pause: boolean;
};

export type GameState = {
	phase: GamePhase;
	previousPhase: Exclude<GamePhase, 'paused'>;
	objective: string;
	prompt: string | null;
	player: FighterState;
	rival: FighterState;
	mentor: { position: Vec2 };
	effects: Array<{ id: number; kind: 'dash' | 'hit' | 'qi'; position: Vec2; age: number }>;
	elapsed: number;
	nextEffectId: number;
};
```

Implement movement clamping inside a `14 x 14` courtyard, mentor interaction at `1.5` units, dash cooldown `1.2s`, light attack damage `12`, qi burst damage `28`, qi cost `35`, rival chase/attack during duel, and deterministic restart from a new initial state.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `bunx vitest run src/lib/game/simulation/state.spec.ts`

Expected: all simulation tests pass.

## Task 2: Input And Runtime Boundary

**Files:**

- Create: `src/lib/game/input/createInputController.ts`
- Create: `src/lib/game/runtime/createGameRuntime.ts`

- [ ] **Step 1: Implement keyboard/pointer input controller**

Create an input controller that attaches listeners to a target element and `window`, tracks `WASD`, arrows, `Space`, `J`, `K`, `E`, `Esc`, pointer drag camera delta, and exposes:

```ts
export type InputController = {
	getSnapshot(): InputSnapshot;
	dispose(): void;
};

export function createInputController(target: HTMLElement): InputController;
```

One-shot actions (`dash`, `lightAttack`, `qiBurst`, `interact`, `pause`) should reset after each `getSnapshot()`.

- [ ] **Step 2: Implement runtime coordinator**

Create:

```ts
export type GameRuntime = {
	start(): void;
	restart(): void;
	dispose(): void;
};

export type RuntimeOptions = {
	host: HTMLElement;
	onHudUpdate: (snapshot: HudSnapshot) => void;
	onError: (message: string) => void;
};

export function createGameRuntime(options: RuntimeOptions): GameRuntime;
```

The runtime creates state, input, and renderer, starts one animation loop, steps simulation with clamped delta time, passes snapshots to renderer and HUD, supports restart, and disposes safely.

- [ ] **Step 3: Run TypeScript check for boundary errors**

Run: `bun run check`

Expected: no missing type exports from the new runtime/input modules after renderer and page tasks are completed. During this task alone, renderer imports may still be missing until Task 3.

## Task 3: Three.js Courtyard Renderer

**Files:**

- Create: `src/lib/game/render/createWuxiaScene.ts`
- Modify: `package.json`

- [ ] **Step 1: Add Three.js dependency**

Run: `bun add three`

Expected: `package.json` gains `three`, and `bun.lock` updates.

- [ ] **Step 2: Implement renderer**

Create:

```ts
export type WuxiaScene = {
	render(snapshot: GameState, alpha: number): void;
	dispose(): void;
};

export function createWuxiaScene(host: HTMLElement): WuxiaScene;
```

The renderer should create a canvas with `WebGLRenderer`, `Scene`, `PerspectiveCamera`, fog, sky color, hemisphere/directional lights, courtyard ground, duel ring, mentor, player, rival, bamboo clusters, training posts, shrine marker, dash/qi/hit effect meshes, and resize handling. It should update mesh positions from `GameState`, render every frame when called, and dispose geometries/materials/renderer/canvas.

- [ ] **Step 3: Confirm Three.js imports type-check**

Run: `bun run check`

Expected: no TypeScript errors for `three` imports, renderer lifecycle, or exported runtime types.

## Task 4: Svelte Route Shell And HUD

**Files:**

- Replace: `src/routes/+page.svelte`
- Test: `src/routes/+page.svelte.spec.ts`

- [ ] **Step 1: Write route component smoke test**

```ts
import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

describe('Wuxia MVP route', () => {
	it('renders the game shell and HUD regions', async () => {
		render(Page);

		await expect.element(page.getByTestId('game-shell')).toBeInTheDocument();
		await expect.element(page.getByTestId('objective-chip')).toBeInTheDocument();
		await expect.element(page.getByTestId('status-cluster')).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run component test to verify RED**

Run: `bunx vitest run src/routes/+page.svelte.spec.ts`

Expected: fail because the current starter route does not expose the game shell test IDs.

- [ ] **Step 3: Implement Svelte page**

Use Svelte 5 runes, `onMount`, and route-local styles. Bind a host element for the Three.js runtime. Render objective/status/prompt UI from the runtime HUD snapshot, show fallback errors, expose pause/restart buttons, and keep the center of the playfield clear. Add accessible labels and `data-testid` values used by tests.

- [ ] **Step 4: Run Svelte autofixer**

Run the Svelte MCP `svelte-autofixer` against the final `+page.svelte` until it reports no issues.

- [ ] **Step 5: Run component test to verify GREEN**

Run: `bunx vitest run src/routes/+page.svelte.spec.ts`

Expected: component test passes.

## Task 5: Browser Smoke Test

**Files:**

- Create: `src/routes/wuxia-mvp.e2e.ts`

- [ ] **Step 1: Write e2e smoke test**

```ts
import { expect, test } from '@playwright/test';

test('plays through the Wuxia MVP opening and restart loop', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByTestId('game-shell')).toBeVisible();
	await expect(page.getByTestId('objective-chip')).toContainText('Meet the mentor');
	await expect(page.locator('canvas')).toBeVisible();

	await page.keyboard.down('a');
	await page.waitForTimeout(200);
	await page.keyboard.up('a');

	await page.keyboard.press('e');
	await expect(page.getByTestId('objective-chip')).toContainText('Practice qinggong dash');

	await page.keyboard.press('Space');
	await expect(page.getByTestId('objective-chip')).toContainText('Defeat the rival disciple');

	for (let i = 0; i < 12; i += 1) {
		await page.keyboard.press('j');
		await page.waitForTimeout(120);
	}

	await expect(page.getByTestId('end-state')).toBeVisible();
	await page.getByTestId('restart-button').click();
	await expect(page.getByTestId('objective-chip')).toContainText('Meet the mentor');
});
```

- [ ] **Step 2: Run e2e test to verify RED or GREEN**

Run: `bun run test:e2e -- src/routes/wuxia-mvp.e2e.ts`

Expected after implementation: pass. If the route is not built yet, fail because route test IDs/canvas are missing.

- [ ] **Step 3: Adjust only implementation, not test intent**

If the e2e test exposes timing or range issues, adjust simulation constants or initial positions so the intended MVP flow is reachable with keyboard-only smoke input.

## Task 6: Final Verification And Polish

**Files:**

- Modify any MVP file only for verification-driven fixes.

- [ ] **Step 1: Run unit tests**

Run: `bun run test:unit -- --run`

Expected: all Vitest projects pass.

- [ ] **Step 2: Run Svelte/TypeScript check**

Run: `bun run check`

Expected: no Svelte or TypeScript errors.

- [ ] **Step 3: Run production build**

Run: `bun run build`

Expected: Vite/SvelteKit build succeeds.

- [ ] **Step 4: Run e2e test**

Run: `bun run test:e2e -- src/routes/wuxia-mvp.e2e.ts`

Expected: Playwright smoke test passes.

- [ ] **Step 5: Start local dev server for review**

Run: `bun run dev -- --host 127.0.0.1`

Expected: dev server prints a local URL. Keep it running and report the URL.

## Self-Review Checklist

- Spec coverage: gameplay, architecture, no Phaser, UI, data flow, fallbacks, and verification are covered by Tasks 1-6.
- Placeholder scan: no TBD/TODO/fill-in instructions are present.
- Type consistency: `GameState`, `InputSnapshot`, `HudSnapshot`, `createGameRuntime`, and `createWuxiaScene` names are used consistently.
- Repository note: commit steps are omitted because this workspace is not a git repository.
