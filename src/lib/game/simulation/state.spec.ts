import { describe, expect, it } from 'vitest';
import {
	createInitialGameState,
	restartGame,
	stepGame,
	toHudSnapshot
} from './state';
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
