# Basic Battle System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing Cassiopeia rival duel from instant-hit checks into a readable timed 1v1 battle system with startup, active, recovery, and hitstun windows.

**Architecture:** Keep the existing SvelteKit route, runtime, input controller, and Three.js renderer boundaries. Pure TypeScript simulation owns battle rules and exposes plain `GameState` and `HudSnapshot` fields; Svelte and Three.js only display those fields.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, Bun, Vitest, Playwright, Three.js.

---

## File Structure

- Modify `src/lib/game/simulation/types.ts`: add combat-action types, attach action state to each fighter, expose a HUD action label.
- Modify `src/lib/game/simulation/combat.ts`: add timing definitions for light attack, qi burst, rival strike, and hitstun windows.
- Modify `src/lib/game/simulation/state.ts`: start actions from input, advance action timers, resolve active-window hits once per action, interrupt startup/recovery through hitstun, and keep end-state resolution deterministic.
- Modify `src/lib/game/simulation/state.spec.ts`: replace instant-hit assumptions with battle-timing tests and keep existing objective/restart coverage.
- Modify `src/lib/game/render/createWuxiaScene.ts`: render simple attack and hitstun poses from combat-action state, and update the initial render fallback state.
- Modify `src/routes/+page.svelte`: add the action status HUD item and adjust the duel prompt.
- Modify `src/routes/wuxia-mvp.e2e.ts`: keep the full opening-to-restart smoke test passing with timed attacks.

## Task 1: Combat Action Types And RED Tests

**Files:**

- Modify: `src/lib/game/simulation/types.ts`
- Modify: `src/lib/game/simulation/combat.ts`
- Modify: `src/lib/game/simulation/state.spec.ts`

- [ ] **Step 1: Add failing timed-combat tests**

Replace `src/lib/game/simulation/state.spec.ts` with this test file. It keeps the existing objective/restart coverage and adds explicit timing assertions before implementation.

```ts
import { describe, expect, it } from 'vitest';
import { createInitialGameState, restartGame, stepGame, toHudSnapshot } from './state';
import type { GameState, InputSnapshot } from './types';

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

function setupDuel(): GameState {
	const state = createInitialGameState();
	state.phase = 'duel';
	state.previousPhase = 'duel';
	state.objective = 'Defeat the rival disciple';
	state.rival.active = true;
	state.player.position = { x: 0, z: 0 };
	state.rival.position = { x: 0.8, z: 0 };
	return state;
}

function advance(state: GameState, seconds: number): void {
	let remaining = seconds;
	while (remaining > 0) {
		const dt = Math.min(1 / 60, remaining);
		stepGame(state, idleInput, dt);
		remaining -= dt;
	}
}

describe('wuxia simulation state', () => {
	it('starts with the mentor objective active', () => {
		const state = createInitialGameState();

		expect(state.phase).toBe('seekMentor');
		expect(state.objective).toBe('Meet the mentor');
		expect(state.player.health).toBe(100);
		expect(state.rival.health).toBe(100);
		expect(state.player.combatAction.phase).toBe('idle');
		expect(state.rival.combatAction.phase).toBe('idle');
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

	it('light attack waits for its active window, damages once, then recovers', () => {
		const state = setupDuel();

		stepGame(state, { ...idleInput, lightAttack: true }, 1 / 60);
		expect(state.player.combatAction.kind).toBe('lightAttack');
		expect(state.player.combatAction.phase).toBe('startup');
		expect(state.rival.health).toBe(100);

		advance(state, 0.08);
		expect(state.rival.health).toBe(100);

		advance(state, 0.08);
		expect(state.rival.health).toBe(88);
		expect(state.player.combatAction.hasHit).toBe(true);

		advance(state, 0.08);
		expect(state.rival.health).toBe(88);
		expect(state.player.combatAction.phase).toBe('recovery');

		advance(state, 0.25);
		expect(state.player.combatAction.phase).toBe('idle');
	});

	it('ignores attack input while the player is already committed', () => {
		const state = setupDuel();

		stepGame(state, { ...idleInput, lightAttack: true }, 1 / 60);
		stepGame(state, { ...idleInput, qiBurst: true }, 1 / 60);

		expect(state.player.combatAction.kind).toBe('lightAttack');
		expect(state.player.qi).toBe(60);
	});

	it('qi burst consumes qi at action start and damages during its active window', () => {
		const state = setupDuel();
		state.player.qi = 60;
		state.rival.position = { x: 1.5, z: 0 };

		stepGame(state, { ...idleInput, qiBurst: true }, 1 / 60);
		expect(state.player.combatAction.kind).toBe('qiBurst');
		expect(state.player.combatAction.phase).toBe('startup');
		expect(state.player.qi).toBe(25);
		expect(state.rival.health).toBe(100);

		advance(state, 0.26);
		expect(state.rival.health).toBe(72);
		expect(state.player.qiCooldown).toBeGreaterThan(0);
	});

	it('reports player action status through the HUD snapshot', () => {
		const state = setupDuel();

		expect(toHudSnapshot(state).playerActionStatus).toBe('Ready');

		stepGame(state, { ...idleInput, lightAttack: true }, 1 / 60);
		expect(toHudSnapshot(state).playerActionStatus).toBe('Striking');

		advance(state, 0.22);
		expect(toHudSnapshot(state).playerActionStatus).toBe('Recovering');
	});

	it('enters victory, defeat, and restart states deterministically', () => {
		const state = setupDuel();
		state.rival.health = 1;

		stepGame(state, { ...idleInput, lightAttack: true }, 1 / 60);
		advance(state, 0.16);
		expect(state.phase).toBe('victory');

		const defeated = setupDuel();
		defeated.player.health = 0;
		stepGame(defeated, idleInput, 1 / 60);
		expect(defeated.phase).toBe('defeat');

		const restarted = restartGame();
		expect(restarted.phase).toBe('seekMentor');
		expect(restarted.rival.health).toBe(100);
		expect(restarted.player.combatAction.phase).toBe('idle');
	});
});
```

- [ ] **Step 2: Run the simulation tests to verify RED**

Run:

```sh
bun x vitest run src/lib/game/simulation/state.spec.ts
```

Expected: FAIL at type-check or runtime because `combatAction` and `playerActionStatus` do not exist yet.

- [ ] **Step 3: Add combat-action types and timing constants**

In `src/lib/game/simulation/types.ts`, add these exported types above `FighterState`, then add `combatAction` to `FighterState` and `playerActionStatus` to `HudSnapshot`.

```ts
export type CombatActionKind = 'none' | 'lightAttack' | 'qiBurst' | 'rivalStrike';

export type CombatActionPhase = 'idle' | 'startup' | 'active' | 'recovery' | 'hitstun';

export type CombatActionState = {
	kind: CombatActionKind;
	phase: CombatActionPhase;
	elapsed: number;
	duration: number;
	hasHit: boolean;
};

export type PlayerActionStatus = 'Ready' | 'Striking' | 'Recovering' | 'Staggered';
```

Update the `FighterState` type so it includes the new state while preserving the existing health, qi, dash, and cooldown fields:

```ts
export type FighterState = {
	position: Vec2;
	heading: number;
	health: number;
	qi: number;
	dashCooldown: number;
	attackCooldown: number;
	qiCooldown: number;
	rivalAttackCooldown: number;
	active: boolean;
	combatAction: CombatActionState;
};
```

Update `HudSnapshot` with the action label:

```ts
export type HudSnapshot = {
	phase: GamePhase;
	objective: string;
	prompt: string | null;
	playerHealth: number;
	playerQi: number;
	rivalHealth: number;
	dashCooldown: number;
	attackCooldown: number;
	qiCooldown: number;
	playerActionStatus: PlayerActionStatus;
	showRestart: boolean;
	isPaused: boolean;
};
```

In `src/lib/game/simulation/combat.ts`, add these timing types and constants below the existing constants:

```ts
export type AttackTiming = {
	startup: number;
	active: number;
	recovery: number;
	hitstun: number;
	damage: number;
	range: number;
};

export const LIGHT_ATTACK_TIMING: AttackTiming = {
	startup: 0.12,
	active: 0.1,
	recovery: 0.18,
	hitstun: 0.22,
	damage: LIGHT_ATTACK_DAMAGE,
	range: LIGHT_ATTACK_RANGE
};

export const QI_BURST_TIMING: AttackTiming = {
	startup: 0.25,
	active: 0.16,
	recovery: 0.42,
	hitstun: 0.34,
	damage: QI_BURST_DAMAGE,
	range: QI_BURST_RANGE
};

export const RIVAL_STRIKE_TIMING: AttackTiming = {
	startup: 0.32,
	active: 0.12,
	recovery: 0.35,
	hitstun: 0.24,
	damage: RIVAL_ATTACK_DAMAGE,
	range: RIVAL_ATTACK_RANGE
};
```

- [ ] **Step 4: Run the simulation tests again**

Run:

```sh
bun x vitest run src/lib/game/simulation/state.spec.ts
```

Expected: FAIL because initial state and combat lifecycle logic do not populate or advance `combatAction` yet.

- [ ] **Step 5: Commit Task 1**

```sh
git add src/lib/game/simulation/types.ts src/lib/game/simulation/combat.ts src/lib/game/simulation/state.spec.ts
git commit -m "test: define timed battle system expectations"
```

## Task 2: Player Combat Action Lifecycle

**Files:**

- Modify: `src/lib/game/simulation/state.ts`
- Test: `src/lib/game/simulation/state.spec.ts`

- [ ] **Step 1: Add action helper imports**

Update the import from `./combat` in `src/lib/game/simulation/state.ts` so it includes the timing constants and `AttackTiming` type:

```ts
import {
	canHit,
	clampToCourtyard,
	cooldown,
	DASH_COOLDOWN,
	DASH_DISTANCE,
	LIGHT_ATTACK_TIMING,
	MAX_QI,
	MENTOR_INTERACT_RANGE,
	normaliseMove,
	PLAYER_SPEED,
	QI_BURST_COOLDOWN,
	QI_BURST_COST,
	QI_BURST_TIMING,
	RIVAL_ATTACK_RANGE,
	RIVAL_SPEED,
	distance,
	type AttackTiming
} from './combat';
```

Update the type import so it includes the new combat types:

```ts
import type {
	ActiveGamePhase,
	CombatActionKind,
	CombatActionState,
	CombatEffect,
	FighterState,
	GameState,
	HudSnapshot,
	InputSnapshot,
	PlayerActionStatus,
	Vec2
} from './types';
```

- [ ] **Step 2: Initialize combat actions**

Add this helper near the top of `state.ts`, below `OBJECTIVES`:

```ts
function createIdleAction(): CombatActionState {
	return {
		kind: 'none',
		phase: 'idle',
		elapsed: 0,
		duration: 0,
		hasHit: false
	};
}
```

In `createInitialGameState()`, add `combatAction: createIdleAction()` to both `player` and `rival` fighter objects:

```ts
player: {
	position: { x: 0, z: 0 },
	heading: 0,
	health: 100,
	qi: 60,
	dashCooldown: 0,
	attackCooldown: 0,
	qiCooldown: 0,
	rivalAttackCooldown: 0,
	active: true,
	combatAction: createIdleAction()
},
rival: {
	position: { x: 0.8, z: 0 },
	heading: Math.PI,
	health: 100,
	qi: 0,
	dashCooldown: 0,
	attackCooldown: 0,
	qiCooldown: 0,
	rivalAttackCooldown: 0,
	active: false,
	combatAction: createIdleAction()
},
```

- [ ] **Step 3: Expose player action status**

Update `toHudSnapshot()` so the returned object includes `playerActionStatus`:

```ts
playerActionStatus: getPlayerActionStatus(state.player.combatAction),
```

Add this helper near the other private helpers:

```ts
function getPlayerActionStatus(action: CombatActionState): PlayerActionStatus {
	if (action.phase === 'hitstun') {
		return 'Staggered';
	}

	if (action.phase === 'recovery') {
		return 'Recovering';
	}

	if (action.phase === 'startup' || action.phase === 'active') {
		return 'Striking';
	}

	return 'Ready';
}
```

- [ ] **Step 4: Add action lifecycle helpers**

Add these helpers to `state.ts` before `handlePlayerAttacks()`:

```ts
function canStartAction(fighter: FighterState): boolean {
	return fighter.active && fighter.health > 0 && fighter.combatAction.phase === 'idle';
}

function startAttack(
	fighter: FighterState,
	kind: Exclude<CombatActionKind, 'none'>,
	timing: AttackTiming
): void {
	fighter.combatAction = {
		kind,
		phase: 'startup',
		elapsed: 0,
		duration: timing.startup,
		hasHit: false
	};
}

function enterHitstun(fighter: FighterState, duration: number): void {
	if (fighter.health <= 0) {
		return;
	}

	fighter.combatAction = {
		kind: 'none',
		phase: 'hitstun',
		elapsed: 0,
		duration,
		hasHit: false
	};
}

function advanceCombatAction(fighter: FighterState, deltaTime: number): void {
	const action = fighter.combatAction;
	if (action.phase === 'idle') {
		return;
	}

	action.elapsed += deltaTime;
	while (action.phase !== 'idle' && action.elapsed >= action.duration) {
		action.elapsed -= action.duration;
		advanceActionPhase(action);
	}
}

function advanceActionPhase(action: CombatActionState): void {
	if (action.phase === 'startup') {
		action.phase = 'active';
		action.duration = getActionTiming(action.kind).active;
		action.elapsed = Math.max(0, action.elapsed);
		action.hasHit = false;
		return;
	}

	if (action.phase === 'active') {
		action.phase = 'recovery';
		action.duration = getActionTiming(action.kind).recovery;
		action.elapsed = Math.max(0, action.elapsed);
		return;
	}

	if (action.phase === 'recovery' || action.phase === 'hitstun') {
		action.kind = 'none';
		action.phase = 'idle';
		action.elapsed = 0;
		action.duration = 0;
		action.hasHit = false;
	}
}

function getActionTiming(kind: CombatActionKind): AttackTiming {
	if (kind === 'lightAttack') {
		return LIGHT_ATTACK_TIMING;
	}

	if (kind === 'qiBurst') {
		return QI_BURST_TIMING;
	}

	return LIGHT_ATTACK_TIMING;
}
```

- [ ] **Step 5: Start and advance player attacks**

Replace `handlePlayerAttacks()` with this implementation:

```ts
function handlePlayerAttacks(state: GameState, input: InputSnapshot): void {
	if (!canStartAction(state.player)) {
		return;
	}

	if (input.lightAttack) {
		startAttack(state.player, 'lightAttack', LIGHT_ATTACK_TIMING);
		return;
	}

	if (input.qiBurst && state.player.qiCooldown === 0 && state.player.qi >= QI_BURST_COST) {
		state.player.qi -= QI_BURST_COST;
		state.player.qiCooldown = QI_BURST_COOLDOWN;
		startAttack(state.player, 'qiBurst', QI_BURST_TIMING);
	}
}
```

Add this helper after `handlePlayerAttacks()`:

```ts
function resolvePlayerActiveHit(state: GameState): void {
	const action = state.player.combatAction;
	if (action.phase !== 'active' || action.hasHit || !state.rival.active) {
		return;
	}

	const timing = getActionTiming(action.kind);
	if (!canHit(state.player, state.rival, timing.range)) {
		return;
	}

	state.rival.health = Math.max(0, state.rival.health - timing.damage);
	action.hasHit = true;
	addEffect(state, action.kind === 'qiBurst' ? 'qi' : 'hit', state.rival.position);
	enterHitstun(state.rival, timing.hitstun);
}
```

In `stepGame()`, update the duel branch so player action input is started before action timers advance and hit resolution happens after timers advance:

```ts
if (state.phase === 'duel') {
	const qiBeforeAttacks = state.player.qi;
	handlePlayerAttacks(state, input);
	updateRival(state, dt);
	advanceCombatAction(state.player, dt);
	advanceCombatAction(state.rival, dt);
	resolvePlayerActiveHit(state);
	resolveEndState(state);
	if (state.phase === 'duel' && state.player.qi === qiBeforeAttacks) {
		state.player.qi = Math.min(MAX_QI, state.player.qi + dt * 5);
	}
}
```

- [ ] **Step 6: Run player lifecycle tests**

Run:

```sh
bun x vitest run src/lib/game/simulation/state.spec.ts -t "light attack|ignores attack|qi burst|reports player action|enters victory"
```

Expected: PASS for the player action tests. Rival timing behavior is still instant or incomplete and will be addressed in Task 3.

- [ ] **Step 7: Run all simulation tests**

Run:

```sh
bun x vitest run src/lib/game/simulation/state.spec.ts
```

Expected: PASS. Rival timing tests are introduced in Task 3.

- [ ] **Step 8: Commit Task 2**

```sh
git add src/lib/game/simulation/state.ts src/lib/game/simulation/state.spec.ts
git commit -m "feat: add player battle timing"
```

## Task 3: Rival Telegraphs, Interrupts, And Same-Frame Hits

**Files:**

- Modify: `src/lib/game/simulation/combat.ts`
- Modify: `src/lib/game/simulation/state.ts`
- Modify: `src/lib/game/simulation/state.spec.ts`

- [ ] **Step 1: Add rival timing tests**

Append these tests inside the existing `describe('wuxia simulation state', () => { ... })` block in `src/lib/game/simulation/state.spec.ts`:

```ts
it('rival startup delays damage instead of applying damage instantly', () => {
	const state = setupDuel();
	state.player.position = { x: 0, z: 0 };
	state.rival.position = { x: 0.8, z: 0 };

	stepGame(state, idleInput, 1 / 60);

	expect(state.rival.combatAction.kind).toBe('rivalStrike');
	expect(state.rival.combatAction.phase).toBe('startup');
	expect(state.player.health).toBe(100);

	advance(state, 0.34);
	expect(state.player.health).toBe(94);
	expect(state.rival.combatAction.hasHit).toBe(true);
});

it('player hit interrupts rival startup through hitstun', () => {
	const state = setupDuel();
	state.rival.position = { x: 0.8, z: 0 };

	stepGame(state, idleInput, 1 / 60);
	expect(state.rival.combatAction.phase).toBe('startup');

	stepGame(state, { ...idleInput, lightAttack: true }, 1 / 60);
	advance(state, 0.16);

	expect(state.rival.health).toBe(88);
	expect(state.rival.combatAction.phase).toBe('hitstun');
	advance(state, 0.25);
	expect(state.player.health).toBe(100);
});

it('simultaneous active attacks both resolve before end-state checks', () => {
	const state = setupDuel();
	state.player.health = 6;
	state.rival.health = 12;
	state.player.combatAction = {
		kind: 'lightAttack',
		phase: 'active',
		elapsed: 0,
		duration: 0.1,
		hasHit: false
	};
	state.rival.combatAction = {
		kind: 'rivalStrike',
		phase: 'active',
		elapsed: 0,
		duration: 0.12,
		hasHit: false
	};

	stepGame(state, idleInput, 1 / 60);

	expect(state.rival.health).toBe(0);
	expect(state.player.health).toBe(0);
	expect(state.phase).toBe('victory');
});
```

- [ ] **Step 2: Run the rival tests to verify RED**

Run:

```sh
bun x vitest run src/lib/game/simulation/state.spec.ts -t "rival startup|interrupts rival|simultaneous active"
```

Expected: FAIL because the rival still applies instant damage or because `rivalStrike` timing is not resolved through the shared action model.

- [ ] **Step 3: Wire rival timing into action helpers**

In `getActionTiming()` in `src/lib/game/simulation/state.ts`, add the rival strike branch:

```ts
if (kind === 'rivalStrike') {
	return RIVAL_STRIKE_TIMING;
}
```

Update the import list from `./combat` so it includes `RIVAL_STRIKE_TIMING`.

- [ ] **Step 4: Replace rival instant damage with telegraphed attack start**

Replace `updateRival()` with this implementation:

```ts
function updateRival(state: GameState, deltaTime: number): void {
	if (!state.rival.active || state.rival.health <= 0) {
		return;
	}

	const dx = state.player.position.x - state.rival.position.x;
	const dz = state.player.position.z - state.rival.position.z;
	const range = Math.hypot(dx, dz);

	if (range > RIVAL_ATTACK_RANGE && range > 0.01 && state.rival.combatAction.phase === 'idle') {
		state.rival.position = clampToCourtyard({
			x: state.rival.position.x + (dx / range) * RIVAL_SPEED * deltaTime,
			z: state.rival.position.z + (dz / range) * RIVAL_SPEED * deltaTime
		});
		state.rival.heading = Math.atan2(dx, dz);
	}

	if (range <= RIVAL_ATTACK_RANGE && canStartAction(state.rival)) {
		startAttack(state.rival, 'rivalStrike', RIVAL_STRIKE_TIMING);
	}
}
```

- [ ] **Step 5: Resolve player and rival active hits together**

Replace `resolvePlayerActiveHit()` with this pending-hit collector and resolver:

```ts
type PendingHit = {
	attacker: FighterState;
	target: FighterState;
	damage: number;
	hitstun: number;
	effect: CombatEffect['kind'];
	position: Vec2;
};

function collectActiveHit(
	attacker: FighterState,
	target: FighterState,
	effect: CombatEffect['kind']
): PendingHit | null {
	const action = attacker.combatAction;
	if (action.phase !== 'active' || action.hasHit || target.health <= 0) {
		return null;
	}

	const timing = getActionTiming(action.kind);
	if (!canHit(attacker, target, timing.range)) {
		return null;
	}

	return {
		attacker,
		target,
		damage: timing.damage,
		hitstun: timing.hitstun,
		effect,
		position: { ...target.position }
	};
}

function resolveActiveHits(state: GameState): void {
	const hits = [
		collectActiveHit(
			state.player,
			state.rival,
			state.player.combatAction.kind === 'qiBurst' ? 'qi' : 'hit'
		),
		collectActiveHit(state.rival, state.player, 'hit')
	].filter((hit): hit is PendingHit => hit !== null);

	for (const hit of hits) {
		hit.attacker.combatAction.hasHit = true;
		hit.target.health = Math.max(0, hit.target.health - hit.damage);
		addEffect(state, hit.effect, hit.position);
	}

	for (const hit of hits) {
		enterHitstun(hit.target, hit.hitstun);
	}
}
```

In `stepGame()`, replace the `resolvePlayerActiveHit(state);` call with:

```ts
resolveActiveHits(state);
```

- [ ] **Step 6: Run the rival tests**

Run:

```sh
bun x vitest run src/lib/game/simulation/state.spec.ts -t "rival startup|interrupts rival|simultaneous active"
```

Expected: PASS.

- [ ] **Step 7: Run all simulation tests**

Run:

```sh
bun x vitest run src/lib/game/simulation/state.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 3**

```sh
git add src/lib/game/simulation/combat.ts src/lib/game/simulation/state.ts src/lib/game/simulation/state.spec.ts
git commit -m "feat: add rival battle telegraphs"
```

## Task 4: HUD Action Status And Svelte Route Update

**Files:**

- Modify: `src/routes/+page.svelte`
- Test: `bun run check`

- [ ] **Step 1: Load Svelte docs before editing**

Use the Svelte MCP required by this repo before editing `src/routes/+page.svelte`:

```text
Call the Svelte MCP list-sections tool.
Fetch the sections relevant to Svelte 5 runes, event handlers, and attach syntax.
```

Expected: Documentation confirms the existing `$state`, `$derived`, and `{@attach}` route pattern remains valid.

- [ ] **Step 2: Update the initial HUD object**

In `src/routes/+page.svelte`, add `playerActionStatus: 'Ready'` to the initial `hud` value:

```ts
let hud = $state<HudSnapshot>({
	phase: 'seekMentor',
	objective: 'Meet the mentor',
	prompt: 'Find the mentor at the shrine gate',
	playerHealth: 100,
	playerQi: 60,
	rivalHealth: 100,
	dashCooldown: 0,
	attackCooldown: 0,
	qiCooldown: 0,
	playerActionStatus: 'Ready',
	showRestart: false,
	isPaused: false
});
```

- [ ] **Step 3: Add the Action HUD item**

Inside the `status-cluster` section, after the Dash item, add:

```svelte
<div>
	<span>Action</span>
	<strong>{hud.playerActionStatus}</strong>
</div>
```

- [ ] **Step 4: Update duel prompt text**

In `updatePrompt()` in `src/lib/game/simulation/state.ts`, change the duel prompt line to:

```ts
state.prompt = 'J: strike  K: qi burst  Space: dash';
```

- [ ] **Step 5: Stabilize status text layout**

In `src/routes/+page.svelte`, update the status strong rule and mobile grid rule:

```css
.status-cluster strong {
	min-width: 0;
	font-size: 0.95rem;
	overflow-wrap: anywhere;
}
```

Replace the mobile `.status-cluster` grid rule with:

```css
.status-cluster {
	top: auto;
	right: 14px;
	bottom: 118px;
	left: 14px;
	width: auto;
	grid-template-columns: repeat(auto-fit, minmax(62px, 1fr));
}
```

- [ ] **Step 6: Run Svelte autofixer**

Use the Svelte MCP `svelte-autofixer` on `src/routes/+page.svelte`.

Expected: No issues remain. If it reports a fix, apply the fix and run the autofixer again.

- [ ] **Step 7: Run Svelte check**

Run:

```sh
bun run check
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```sh
git add src/routes/+page.svelte src/lib/game/simulation/state.ts
git commit -m "feat: show battle action status"
```

## Task 5: Three.js Battle Pose Feedback

**Files:**

- Modify: `src/lib/game/render/createWuxiaScene.ts`
- Test: `bun run check`

- [ ] **Step 1: Add combat actions to initial render state**

In `createInitialRenderState()` in `src/lib/game/render/createWuxiaScene.ts`, add this local helper before the function:

```ts
function createIdleRenderAction() {
	return {
		kind: 'none' as const,
		phase: 'idle' as const,
		elapsed: 0,
		duration: 0,
		hasHit: false
	};
}
```

Add `combatAction: createIdleRenderAction()` to both the initial `player` and `rival` objects inside `createInitialRenderState()`.

- [ ] **Step 2: Replace fighter pose application**

Change the `applyFighter()` signature and implementation:

```ts
function applyFighter(
	group: THREE.Group,
	position: Vec2,
	heading: number,
	action: GameState['player']['combatAction']
): void {
	const pose = getActionPose(action);
	group.position.set(position.x, pose.y, position.z);
	group.rotation.set(pose.pitch, heading + pose.yawOffset, pose.roll);
	group.scale.set(1 + pose.widthScale, 1 + pose.heightScale, 1 + pose.depthScale);
}
```

Add this helper after `applyFighter()`:

```ts
function getActionPose(action: GameState['player']['combatAction']): {
	y: number;
	pitch: number;
	roll: number;
	yawOffset: number;
	widthScale: number;
	heightScale: number;
	depthScale: number;
} {
	if (action.phase === 'hitstun') {
		return {
			y: 0,
			pitch: -0.12,
			roll: 0.16,
			yawOffset: 0,
			widthScale: 0.02,
			heightScale: -0.04,
			depthScale: 0.02
		};
	}

	if (action.phase === 'startup') {
		return {
			y: 0,
			pitch: 0.08,
			roll: 0,
			yawOffset: -0.08,
			widthScale: 0,
			heightScale: 0.02,
			depthScale: 0.03
		};
	}

	if (action.phase === 'active') {
		return {
			y: 0,
			pitch: 0.18,
			roll: 0,
			yawOffset: action.kind === 'qiBurst' ? 0.2 : 0.12,
			widthScale: action.kind === 'qiBurst' ? 0.08 : 0.02,
			heightScale: 0,
			depthScale: action.kind === 'qiBurst' ? 0.12 : 0.08
		};
	}

	if (action.phase === 'recovery') {
		return {
			y: 0,
			pitch: -0.05,
			roll: 0,
			yawOffset: 0.05,
			widthScale: 0,
			heightScale: -0.02,
			depthScale: 0
		};
	}

	return {
		y: 0,
		pitch: 0,
		roll: 0,
		yawOffset: 0,
		widthScale: 0,
		heightScale: 0,
		depthScale: 0
	};
}
```

- [ ] **Step 3: Pass action state into renderer pose calls**

Update the three calls in `render(snapshot: GameState)`:

```ts
applyFighter(
	player,
	snapshot.player.position,
	snapshot.player.heading,
	snapshot.player.combatAction
);
applyFighter(rival, snapshot.rival.position, snapshot.rival.heading, snapshot.rival.combatAction);
applyFighter(mentor, snapshot.mentor.position, Math.PI * 0.25, createIdleRenderAction());
```

- [ ] **Step 4: Run TypeScript check**

Run:

```sh
bun run check
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```sh
git add src/lib/game/render/createWuxiaScene.ts
git commit -m "feat: render battle action poses"
```

## Task 6: Browser Smoke Test And Full Verification

**Files:**

- Modify: `src/routes/wuxia-mvp.e2e.ts`
- Test: `src/routes/wuxia-mvp.e2e.ts`

- [ ] **Step 1: Update e2e battle pacing**

Replace the repeated `J` loop in `src/routes/wuxia-mvp.e2e.ts` with a timing-aware loop and assert the action HUD exists during the duel:

```ts
await expect(page.getByTestId('status-cluster')).toContainText('Action');

for (let i = 0; i < 26; i += 1) {
	await page.keyboard.press('j');
	await page.waitForTimeout(230);
}
```

- [ ] **Step 2: Run targeted simulation tests**

Run:

```sh
bun x vitest run src/lib/game/simulation/state.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Run project check**

Run:

```sh
bun run check
```

Expected: PASS.

- [ ] **Step 4: Run e2e test**

Run:

```sh
bun x playwright test src/routes/wuxia-mvp.e2e.ts
```

Expected: PASS. The Playwright web server builds and previews the production app on port `4173`.

- [ ] **Step 5: Run the full test command**

Run:

```sh
bun run test
```

Expected: PASS for unit and e2e suites.

- [ ] **Step 6: Commit Task 6**

```sh
git add src/routes/wuxia-mvp.e2e.ts
git commit -m "test: verify timed battle flow"
```

## Final Verification Checklist

- [ ] `bun x vitest run src/lib/game/simulation/state.spec.ts` passes.
- [ ] `bun run check` passes.
- [ ] `bun x playwright test src/routes/wuxia-mvp.e2e.ts` passes.
- [ ] `bun run test` passes.
- [ ] The HUD shows `Action` with `Ready`, `Striking`, `Recovering`, or `Staggered`.
- [ ] Rival damage is delayed until its active window.
- [ ] Same-frame active hits resolve for both fighters before victory or defeat.
