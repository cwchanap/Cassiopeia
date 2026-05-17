import {
	canHit,
	clampToCourtyard,
	cooldown,
	DASH_COOLDOWN,
	DASH_DISTANCE,
	LIGHT_ATTACK_COOLDOWN,
	LIGHT_ATTACK_DAMAGE,
	LIGHT_ATTACK_RANGE,
	MAX_QI,
	MENTOR_INTERACT_RANGE,
	normaliseMove,
	PLAYER_SPEED,
	QI_BURST_COOLDOWN,
	QI_BURST_COST,
	QI_BURST_DAMAGE,
	QI_BURST_RANGE,
	RIVAL_ATTACK_COOLDOWN,
	RIVAL_ATTACK_DAMAGE,
	RIVAL_ATTACK_RANGE,
	RIVAL_SPEED,
	distance
} from './combat';
import type {
	ActiveGamePhase,
	CombatActionState,
	CombatEffect,
	GameState,
	HudSnapshot,
	InputSnapshot,
	Vec2
} from './types';

const OBJECTIVES: Record<ActiveGamePhase, string> = {
	seekMentor: 'Meet the mentor',
	trainDash: 'Practice qinggong dash',
	duel: 'Defeat the rival disciple',
	victory: 'Victory',
	defeat: 'Defeat'
};

function idleCombatAction(): CombatActionState {
	return {
		kind: 'none',
		phase: 'idle',
		elapsed: 0,
		duration: 0,
		hasHit: false
	};
}

export function createInitialGameState(): GameState {
	return {
		phase: 'seekMentor',
		previousPhase: 'seekMentor',
		objective: OBJECTIVES.seekMentor,
		prompt: 'Press E near the mentor to begin training',
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
			combatAction: idleCombatAction()
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
			combatAction: idleCombatAction()
		},
		mentor: { position: { x: -4, z: -3 } },
		effects: [],
		elapsed: 0,
		nextEffectId: 1
	};
}

export function restartGame(): GameState {
	return createInitialGameState();
}

export function stepGame(state: GameState, input: InputSnapshot, deltaTime: number): void {
	const dt = Math.min(Math.max(deltaTime, 0), 0.05);

	if (input.pause) {
		togglePause(state);
		return;
	}

	if (state.phase === 'paused') {
		updatePrompt(state);
		return;
	}

	state.elapsed += dt;
	updateCooldowns(state, dt);
	updateEffects(state, dt);

	if (state.phase === 'victory' || state.phase === 'defeat') {
		updatePrompt(state);
		return;
	}

	movePlayer(state, input, dt);
	handlePhaseProgression(state, input);

	if (state.phase === 'duel') {
		const qiBeforeAttacks = state.player.qi;
		handlePlayerAttacks(state, input);
		updateRival(state, dt);
		resolveEndState(state);
		if (state.phase === 'duel' && state.player.qi === qiBeforeAttacks) {
			state.player.qi = Math.min(MAX_QI, state.player.qi + dt * 5);
		}
	}
	updatePrompt(state);
}

export function toHudSnapshot(state: GameState): HudSnapshot {
	return {
		phase: state.phase,
		objective: state.objective,
		prompt: state.prompt,
		playerHealth: Math.round(state.player.health),
		playerQi: Math.round(state.player.qi),
		rivalHealth: Math.round(state.rival.health),
		dashCooldown: state.player.dashCooldown,
		attackCooldown: state.player.attackCooldown,
		qiCooldown: state.player.qiCooldown,
		playerActionStatus: 'Ready',
		showRestart: state.phase === 'victory' || state.phase === 'defeat',
		isPaused: state.phase === 'paused'
	};
}

function togglePause(state: GameState): void {
	if (state.phase === 'paused') {
		state.phase = state.previousPhase;
		state.objective = OBJECTIVES[state.phase];
		return;
	}

	if (state.phase === 'victory' || state.phase === 'defeat') {
		return;
	}

	state.previousPhase = state.phase;
	state.phase = 'paused';
	state.objective = 'Paused';
}

function updateCooldowns(state: GameState, deltaTime: number): void {
	state.player.dashCooldown = cooldown(state.player.dashCooldown, deltaTime);
	state.player.attackCooldown = cooldown(state.player.attackCooldown, deltaTime);
	state.player.qiCooldown = cooldown(state.player.qiCooldown, deltaTime);
	state.rival.rivalAttackCooldown = cooldown(state.rival.rivalAttackCooldown, deltaTime);
}

function updateEffects(state: GameState, deltaTime: number): void {
	for (const effect of state.effects) {
		effect.age += deltaTime;
	}

	state.effects = state.effects.filter((effect) => effect.age < 0.65);
}

function movePlayer(state: GameState, input: InputSnapshot, deltaTime: number): void {
	const move = normaliseMove(input.moveX, input.moveZ);
	const hasMove = Math.abs(move.x) > 0.01 || Math.abs(move.z) > 0.01;

	if (input.cameraDelta !== 0) {
		state.player.heading += input.cameraDelta * 0.025;
	}

	if (hasMove) {
		state.player.position = clampToCourtyard({
			x: state.player.position.x + move.x * PLAYER_SPEED * deltaTime,
			z: state.player.position.z + move.z * PLAYER_SPEED * deltaTime
		});
		state.player.heading = Math.atan2(move.x, move.z);
	}

	if (input.dash && state.player.dashCooldown === 0) {
		const forward = hasMove
			? move
			: { x: Math.sin(state.player.heading), z: Math.cos(state.player.heading) };
		state.player.position = clampToCourtyard({
			x: state.player.position.x + forward.x * DASH_DISTANCE,
			z: state.player.position.z + forward.z * DASH_DISTANCE
		});
		state.player.dashCooldown = DASH_COOLDOWN;
		addEffect(state, 'dash', state.player.position);
	}
}

function handlePhaseProgression(state: GameState, input: InputSnapshot): void {
	if (
		state.phase === 'seekMentor' &&
		input.interact &&
		distance(state.player.position, state.mentor.position) <= MENTOR_INTERACT_RANGE
	) {
		state.phase = 'trainDash';
		state.previousPhase = 'trainDash';
		state.objective = OBJECTIVES.trainDash;
		return;
	}

	if (state.phase === 'trainDash' && input.dash) {
		state.phase = 'duel';
		state.previousPhase = 'duel';
		state.objective = OBJECTIVES.duel;
		state.rival.active = true;
		state.rival.position = {
			x: state.player.position.x + Math.sin(state.player.heading + 0.35) * 1.1,
			z: state.player.position.z + Math.cos(state.player.heading + 0.35) * 1.1
		};
	}
}

function handlePlayerAttacks(state: GameState, input: InputSnapshot): void {
	if (
		input.lightAttack &&
		state.player.attackCooldown === 0 &&
		canHit(state.player, state.rival, LIGHT_ATTACK_RANGE)
	) {
		state.rival.health = Math.max(0, state.rival.health - LIGHT_ATTACK_DAMAGE);
		state.player.attackCooldown = LIGHT_ATTACK_COOLDOWN;
		addEffect(state, 'hit', state.rival.position);
	}

	if (
		input.qiBurst &&
		state.player.qiCooldown === 0 &&
		state.player.qi >= QI_BURST_COST &&
		canHit(state.player, state.rival, QI_BURST_RANGE)
	) {
		state.rival.health = Math.max(0, state.rival.health - QI_BURST_DAMAGE);
		state.player.qi -= QI_BURST_COST;
		state.player.qiCooldown = QI_BURST_COOLDOWN;
		addEffect(state, 'qi', state.rival.position);
	}
}

function updateRival(state: GameState, deltaTime: number): void {
	if (!state.rival.active) {
		return;
	}

	const dx = state.player.position.x - state.rival.position.x;
	const dz = state.player.position.z - state.rival.position.z;
	const range = Math.hypot(dx, dz);

	if (range > RIVAL_ATTACK_RANGE && range > 0.01) {
		state.rival.position = clampToCourtyard({
			x: state.rival.position.x + (dx / range) * RIVAL_SPEED * deltaTime,
			z: state.rival.position.z + (dz / range) * RIVAL_SPEED * deltaTime
		});
		state.rival.heading = Math.atan2(dx, dz);
	}

	if (range <= RIVAL_ATTACK_RANGE && state.rival.rivalAttackCooldown === 0) {
		state.player.health = Math.max(0, state.player.health - RIVAL_ATTACK_DAMAGE);
		state.rival.rivalAttackCooldown = RIVAL_ATTACK_COOLDOWN;
		addEffect(state, 'hit', state.player.position);
	}
}

function resolveEndState(state: GameState): void {
	if (state.rival.health <= 0) {
		state.phase = 'victory';
		state.previousPhase = 'victory';
		state.objective = OBJECTIVES.victory;
		state.rival.active = false;
		return;
	}

	if (state.player.health <= 0) {
		state.phase = 'defeat';
		state.previousPhase = 'defeat';
		state.objective = OBJECTIVES.defeat;
	}
}

function updatePrompt(state: GameState): void {
	if (state.phase === 'seekMentor') {
		state.prompt =
			distance(state.player.position, state.mentor.position) <= MENTOR_INTERACT_RANGE
				? 'Press E to begin mentor training'
				: 'Find the mentor at the shrine gate';
		return;
	}

	if (state.phase === 'trainDash') {
		state.prompt = 'Press Space to dash and call out the rival disciple';
		return;
	}

	if (state.phase === 'duel') {
		state.prompt = 'J: light attack  K: qi burst  Space: qinggong dash';
		return;
	}

	if (state.phase === 'victory') {
		state.prompt = 'Victory. Restart to train again.';
		return;
	}

	if (state.phase === 'defeat') {
		state.prompt = 'Defeat. Restart and try the duel again.';
		return;
	}

	state.prompt = 'Paused';
}

function addEffect(state: GameState, kind: CombatEffect['kind'], position: Vec2): void {
	state.effects.push({
		id: state.nextEffectId,
		kind,
		position: { ...position },
		age: 0
	});
	state.nextEffectId += 1;
}
