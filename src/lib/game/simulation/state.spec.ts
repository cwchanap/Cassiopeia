import { describe, expect, it } from 'vitest';
import { createInitialGameState, restartGame, stepGame, toHudSnapshot } from './state';
import { LIGHT_ATTACK_TIMING, QI_BURST_COST, QI_BURST_TIMING, RIVAL_STRIKE_TIMING } from './combat';
import type { GameState, InputSnapshot } from './types';

const idleInput: InputSnapshot = {
	moveX: 0,
	moveZ: 0,
	cameraDelta: 0,
	dash: false,
	lightAttack: false,
	qiBurst: false,
	interact: false,
	pause: false,
	quickSlot: null,
	toggleInventory: false
};

const frame = 1 / 60;

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
		const dt = Math.min(frame, remaining);
		stepGame(state, idleInput, dt);
		remaining -= dt;
	}
}

describe('wuxia simulation state', () => {
	it('starts with the mentor objective active', () => {
		const state = createInitialGameState();

		expect(state.phase).toBe('seekMentor');
		expect(state.objective).toBe('Meet the mentor');
		expect(state.player.health).toBe(110);
		expect(state.rival.health).toBe(100);
		expect(state.player.combatAction.phase).toBe('idle');
		expect(state.rival.combatAction.phase).toBe('idle');
	});

	it('moves from mentor objective to dash training when interacting near the mentor', () => {
		const state = createInitialGameState();
		state.player.position.x = -4;
		state.player.position.z = -3;

		stepGame(state, { ...idleInput, interact: true }, frame);

		expect(state.phase).toBe('trainDash');
		expect(state.objective).toBe('Practice qinggong dash');
		expect(state.prompt).toContain('dash');
	});

	it('starts the duel after using dash during training', () => {
		const state = createInitialGameState();
		state.phase = 'trainDash';
		state.player.dashCooldown = 0;

		stepGame(state, { ...idleInput, dash: true }, frame);

		expect(state.phase).toBe('duel');
		expect(state.objective).toBe('Defeat the rival disciple');
		expect(state.rival.active).toBe(true);
	});

	it('light attack waits for its active window, damages once, then recovers', () => {
		const state = setupDuel();

		stepGame(state, { ...idleInput, lightAttack: true }, frame);
		expect(state.player.combatAction.kind).toBe('lightAttack');
		expect(state.player.combatAction.phase).toBe('startup');
		expect(state.rival.health).toBe(100);

		const startupProbe = LIGHT_ATTACK_TIMING.startup * (2 / 3);
		advance(state, startupProbe);
		expect(state.rival.health).toBe(100);

		advance(state, LIGHT_ATTACK_TIMING.startup - startupProbe + LIGHT_ATTACK_TIMING.active / 2);
		expect(state.rival.health).toBe(100 - LIGHT_ATTACK_TIMING.damage - 2);
		expect(state.player.combatAction.hasHit).toBe(true);

		advance(state, LIGHT_ATTACK_TIMING.active / 2 + frame);
		expect(state.rival.health).toBe(100 - LIGHT_ATTACK_TIMING.damage - 2);
		expect(state.player.combatAction.phase).toBe('recovery');

		advance(state, LIGHT_ATTACK_TIMING.recovery + frame);
		expect(state.player.combatAction.phase).toBe('idle');
	});

	it('resolves a player hit when the final active slice transitions to recovery', () => {
		const state = setupDuel();

		stepGame(state, { ...idleInput, lightAttack: true }, frame);
		state.rival.position = { x: LIGHT_ATTACK_TIMING.range + 1, z: 0 };

		advance(state, LIGHT_ATTACK_TIMING.startup - frame + LIGHT_ATTACK_TIMING.active / 2);
		expect(state.player.combatAction.phase).toBe('active');
		expect(state.rival.health).toBe(100);

		state.rival.position = { x: LIGHT_ATTACK_TIMING.range * 0.5, z: 0 };
		stepGame(state, idleInput, LIGHT_ATTACK_TIMING.active / 2);

		expect(state.rival.health).toBe(100 - LIGHT_ATTACK_TIMING.damage - 2);
		expect(state.player.combatAction.phase).toBe('recovery');
	});

	it('ignores attack input while the player is already committed', () => {
		const state = setupDuel();

		stepGame(state, { ...idleInput, lightAttack: true }, frame);
		const qiBeforeBurstInput = state.player.qi;
		stepGame(state, { ...idleInput, qiBurst: true }, frame);

		expect(state.player.combatAction.kind).toBe('lightAttack');
		expect(state.player.qi).toBeGreaterThanOrEqual(qiBeforeBurstInput);
	});

	it('qi burst consumes qi at action start and damages during its active window', () => {
		const state = setupDuel();
		state.player.qi = 60;
		state.rival.position = { x: 1.5, z: 0 };

		stepGame(state, { ...idleInput, qiBurst: true }, frame);
		expect(state.player.combatAction.kind).toBe('qiBurst');
		expect(state.player.combatAction.phase).toBe('startup');
		expect(state.player.qi).toBe(60 - QI_BURST_COST);
		expect(state.rival.health).toBe(100);

		advance(state, QI_BURST_TIMING.startup + frame);
		expect(state.rival.health).toBe(100 - QI_BURST_TIMING.damage - 4);
		expect(state.player.qiCooldown).toBeGreaterThan(0);
	});

	it('rival startup delays damage instead of applying damage instantly', () => {
		const state = setupDuel();

		stepGame(state, idleInput, frame);

		expect(state.rival.combatAction.kind).toBe('rivalStrike');
		expect(state.rival.combatAction.phase).toBe('startup');
		expect(state.player.health).toBe(110);

		advance(state, RIVAL_STRIKE_TIMING.startup + frame);

		expect(state.player.health).toBe(110 - RIVAL_STRIKE_TIMING.damage);
		expect(state.rival.combatAction.hasHit).toBe(true);
	});

	it('player hit interrupts rival startup through hitstun', () => {
		const state = setupDuel();

		stepGame(state, idleInput, frame);
		stepGame(state, { ...idleInput, lightAttack: true }, frame);
		advance(state, LIGHT_ATTACK_TIMING.startup + frame);

		expect(state.rival.health).toBe(100 - LIGHT_ATTACK_TIMING.damage - 2);
		expect(state.rival.combatAction.phase).toBe('hitstun');

		advance(state, RIVAL_STRIKE_TIMING.startup);

		expect(state.player.health).toBe(110);
	});

	it('simultaneous active attacks both resolve before end-state checks', () => {
		const state = setupDuel();
		state.player.health = RIVAL_STRIKE_TIMING.damage;
		state.rival.health = LIGHT_ATTACK_TIMING.damage;
		state.player.combatAction = {
			kind: 'lightAttack',
			phase: 'active',
			elapsed: 0,
			duration: LIGHT_ATTACK_TIMING.active,
			hasHit: false
		};
		state.rival.combatAction = {
			kind: 'rivalStrike',
			phase: 'active',
			elapsed: 0,
			duration: RIVAL_STRIKE_TIMING.active,
			hasHit: false
		};

		stepGame(state, idleInput, frame);

		expect(state.player.health).toBe(0);
		expect(state.rival.health).toBe(0);
		expect(state.phase).toBe('victory');
	});

	it('dead active attacker cannot deal damage', () => {
		const state = setupDuel();
		state.rival.health = 0;
		state.rival.combatAction = {
			kind: 'rivalStrike',
			phase: 'active',
			elapsed: 0,
			duration: RIVAL_STRIKE_TIMING.active,
			hasHit: false
		};

		stepGame(state, idleInput, frame);

		expect(state.player.health).toBe(110);
		expect(state.phase).toBe('victory');
	});

	it('reports player action status through the HUD snapshot', () => {
		const state = setupDuel();

		expect(toHudSnapshot(state).playerActionStatus).toBe('Ready');

		stepGame(state, { ...idleInput, lightAttack: true }, frame);
		expect(toHudSnapshot(state).playerActionStatus).toBe('Striking');

		advance(state, LIGHT_ATTACK_TIMING.startup + LIGHT_ATTACK_TIMING.active + frame);
		expect(toHudSnapshot(state).playerActionStatus).toBe('Recovering');
	});

	it('starts from equipment-derived max health and qi', () => {
		const state = createInitialGameState();
		const hud = toHudSnapshot(state);

		expect(state.player.maxHealth).toBe(110);
		expect(state.player.health).toBe(110);
		expect(state.player.maxQi).toBe(100);
		expect(state.player.qi).toBe(100);
		expect(hud.playerHealth).toBe(110);
		expect(hud.playerMaxHealth).toBe(110);
		expect(hud.playerQi).toBe(100);
		expect(hud.playerMaxQi).toBe(100);
		expect(hud.inventory.quickSlots[0]).toMatchObject({
			slot: 1,
			itemId: 'lesser_healing_pill',
			count: 3
		});
	});

	it('applies equipment damage bonuses to player attacks', () => {
		const state = setupDuel();

		stepGame(state, { ...idleInput, lightAttack: true }, frame);
		advance(state, LIGHT_ATTACK_TIMING.startup + LIGHT_ATTACK_TIMING.active / 2);

		expect(state.rival.health).toBe(100 - LIGHT_ATTACK_TIMING.damage - 2);
	});

	it('restarts with the current item progress and derived stats', () => {
		const state = createInitialGameState();
		state.items.inventory.jade_breathing_charm = 1;
		state.items.equipment.accessory = 'jade_breathing_charm';

		const restarted = restartGame(state.items);

		expect(restarted.player.maxHealth).toBe(110);
		expect(restarted.player.health).toBe(110);
		expect(restarted.player.maxQi).toBe(120);
		expect(restarted.player.qi).toBe(120);
		expect(restarted.items.equipment.accessory).toBe('jade_breathing_charm');
	});

	it('enters victory, defeat, and restart states deterministically', () => {
		const state = setupDuel();
		state.rival.health = 1;

		stepGame(state, { ...idleInput, lightAttack: true }, frame);
		advance(state, LIGHT_ATTACK_TIMING.startup + LIGHT_ATTACK_TIMING.active / 2);
		expect(state.phase).toBe('victory');

		const defeated = setupDuel();
		defeated.player.health = 0;
		stepGame(defeated, idleInput, frame);
		expect(defeated.phase).toBe('defeat');

		const restarted = restartGame();
		expect(restarted.phase).toBe('seekMentor');
		expect(restarted.rival.health).toBe(100);
		expect(restarted.player.combatAction.phase).toBe('idle');
	});
});
