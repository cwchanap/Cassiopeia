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

		const restarted = restartGame();
		expect(restarted.phase).toBe('seekMentor');
		expect(restarted.rival.health).toBe(100);
	});
});
