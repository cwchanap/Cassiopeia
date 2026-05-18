import {
	canHit,
	clampToCourtyard,
	cooldown,
	DASH_COOLDOWN,
	DASH_DISTANCE,
	LIGHT_ATTACK_TIMING,
	MENTOR_INTERACT_RANGE,
	normaliseMove,
	PLAYER_BASE_HEALTH,
	PLAYER_SPEED,
	QI_BURST_COOLDOWN,
	QI_BURST_COST,
	QI_BURST_TIMING,
	RIVAL_ATTACK_RANGE,
	RIVAL_SPEED,
	RIVAL_STRIKE_TIMING,
	distance
} from './combat';
import {
	assignQuickSlot,
	cloneItemProgress,
	createHudInventorySnapshot,
	createStarterItemProgress,
	derivePlayerItemStats,
	equipItem,
	formatReward,
	getPlayerAttackDamage,
	grantVictoryReward,
	useConsumable
} from './items';
import type { AttackTiming } from './combat';
import type {
	ActiveGamePhase,
	CombatActionKind,
	CombatActionState,
	CombatEffect,
	FighterState,
	GameState,
	HudSnapshot,
	InputSnapshot,
	InventoryCommand,
	ItemId,
	PlayerActionStatus,
	Vec2
} from './types';

type PendingHit = {
	attacker: FighterState;
	target: FighterState;
	damage: number;
	hitstun: number;
	effect: CombatEffect['kind'];
	position: Vec2;
};

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

export function createInitialGameState(itemProgress = createStarterItemProgress()): GameState {
	const items = cloneItemProgress(itemProgress);
	const playerStats = derivePlayerItemStats(items);

	return {
		phase: 'seekMentor',
		previousPhase: 'seekMentor',
		objective: OBJECTIVES.seekMentor,
		prompt: 'Press E near the mentor to begin training',
		player: {
			position: { x: 0, z: 0 },
			heading: 0,
			health: playerStats.maxHealth,
			maxHealth: playerStats.maxHealth,
			qi: playerStats.maxQi,
			maxQi: playerStats.maxQi,
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
			health: PLAYER_BASE_HEALTH,
			maxHealth: PLAYER_BASE_HEALTH,
			qi: 0,
			maxQi: 0,
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
		nextEffectId: 1,
		items,
		inventoryOpen: false,
		itemFeedback: null
	};
}

export function restartGame(itemProgress = createStarterItemProgress()): GameState {
	return createInitialGameState(itemProgress);
}

export function stepGame(
	state: GameState,
	input: InputSnapshot,
	deltaTime: number,
	commands: InventoryCommand[] = []
): void {
	const dt = Math.min(Math.max(deltaTime, 0), 0.05);

	processInventoryCommands(state, commands);
	processInventoryInput(state, input);

	if (input.pause) {
		if (state.inventoryOpen) {
			state.inventoryOpen = false;
			updatePrompt(state);
			return;
		}

		togglePause(state);
		return;
	}

	if (state.inventoryOpen) {
		updatePrompt(state);
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
		handleQuickSlotUse(state, input.quickSlot);
		handlePlayerAttacks(state, input);
		updateRival(state, dt);
		resolveActiveHits(state);
		advanceCombatAction(state.player, dt);
		advanceCombatAction(state.rival, dt);
		resolveActiveHits(state);
		resolveEndState(state);
		if (state.phase === 'duel' && state.player.qi === qiBeforeAttacks) {
			state.player.qi = Math.min(state.player.maxQi, state.player.qi + dt * 5);
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
		playerMaxHealth: Math.round(state.player.maxHealth),
		playerQi: Math.round(state.player.qi),
		playerMaxQi: Math.round(state.player.maxQi),
		rivalHealth: Math.round(state.rival.health),
		dashCooldown: state.player.dashCooldown,
		attackCooldown: state.player.attackCooldown,
		qiCooldown: state.player.qiCooldown,
		playerActionStatus: getPlayerActionStatus(state.player.combatAction),
		showRestart: state.phase === 'victory' || state.phase === 'defeat',
		isPaused: state.phase === 'paused',
		inventory: createHudInventorySnapshot(state.items, state.inventoryOpen, state.itemFeedback)
	};
}

function getPlayerActionStatus(combatAction: CombatActionState): PlayerActionStatus {
	if (combatAction.phase === 'hitstun') {
		return 'Staggered';
	}

	if (combatAction.phase === 'recovery') {
		return 'Recovering';
	}

	if (combatAction.phase === 'startup' || combatAction.phase === 'active') {
		return 'Striking';
	}

	return 'Ready';
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
	if (!canStartAction(state.player)) {
		return;
	}

	if (input.lightAttack) {
		startAttack(state.player, 'lightAttack', LIGHT_ATTACK_TIMING);
		return;
	}

	if (input.qiBurst && state.player.qiCooldown === 0 && state.player.qi >= QI_BURST_COST) {
		startAttack(state.player, 'qiBurst', QI_BURST_TIMING);
		state.player.qi -= QI_BURST_COST;
		state.player.qiCooldown = QI_BURST_COOLDOWN;
	}
}

function processInventoryCommands(state: GameState, commands: InventoryCommand[]): void {
	for (const command of commands) {
		if (command.type === 'toggleInventory') {
			state.inventoryOpen = !state.inventoryOpen;
			state.itemFeedback = state.inventoryOpen ? 'Bag opened' : 'Bag closed';
			continue;
		}

		if (command.type === 'closeInventory') {
			state.inventoryOpen = false;
			state.itemFeedback = 'Bag closed';
			continue;
		}

		if (command.type === 'useItem') {
			useInventoryItem(state, command.itemId);
			continue;
		}

		if (command.type === 'equipItem') {
			state.itemFeedback = equipItem(state.items, command.itemId);
			refreshPlayerStats(state);
			continue;
		}

		state.itemFeedback = assignQuickSlot(state.items, command.slot, command.itemId);
	}
}

function processInventoryInput(state: GameState, input: InputSnapshot): void {
	if (input.toggleInventory) {
		state.inventoryOpen = !state.inventoryOpen;
		state.itemFeedback = state.inventoryOpen ? 'Bag opened' : 'Bag closed';
	}
}

function handleQuickSlotUse(state: GameState, slot: InputSnapshot['quickSlot']): void {
	if (slot === null) {
		return;
	}

	const itemId = state.items.quickSlots[slot];
	if (!itemId) {
		state.itemFeedback = `Slot ${slot} is empty`;
		return;
	}

	useInventoryItem(state, itemId);
}

function useInventoryItem(state: GameState, itemId: ItemId): void {
	const result = useConsumable(state.items, itemId, {
		health: state.player.health,
		maxHealth: state.player.maxHealth,
		qi: state.player.qi,
		maxQi: state.player.maxQi
	});

	state.player.health = result.resources.health;
	state.player.qi = result.resources.qi;
	state.itemFeedback = result.feedback;
}

function refreshPlayerStats(state: GameState): void {
	const stats = derivePlayerItemStats(state.items);
	state.player.maxHealth = stats.maxHealth;
	state.player.maxQi = stats.maxQi;
	state.player.health = Math.min(state.player.health, state.player.maxHealth);
	state.player.qi = Math.min(state.player.qi, state.player.maxQi);
}

function canStartAction(fighter: FighterState): boolean {
	return fighter.active && fighter.health > 0 && fighter.combatAction.phase === 'idle';
}

function startAttack(fighter: FighterState, kind: CombatActionKind, timing: AttackTiming): void {
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
	let remaining = deltaTime;

	while (remaining > 0 && fighter.combatAction.phase !== 'idle') {
		const action = fighter.combatAction;
		const timeLeft = action.duration - action.elapsed;

		if (remaining < timeLeft) {
			action.elapsed += remaining;
			return;
		}

		remaining -= Math.max(0, timeLeft);
		advanceCombatActionPhase(fighter);
	}
}

function advanceCombatActionPhase(fighter: FighterState): void {
	const action = fighter.combatAction;

	if (action.phase === 'startup') {
		const timing = getActionTiming(action.kind);
		action.phase = 'active';
		action.elapsed = 0;
		action.duration = timing.active;
		return;
	}

	if (action.phase === 'active') {
		const timing = getActionTiming(action.kind);
		action.phase = 'recovery';
		action.elapsed = 0;
		action.duration = timing.recovery;
		return;
	}

	if (action.phase === 'recovery' || action.phase === 'hitstun') {
		fighter.combatAction = idleCombatAction();
	}
}

function getActionTiming(kind: CombatActionKind): AttackTiming {
	if (kind === 'qiBurst') {
		return QI_BURST_TIMING;
	}

	if (kind === 'rivalStrike') {
		return RIVAL_STRIKE_TIMING;
	}

	return LIGHT_ATTACK_TIMING;
}

function collectActiveHit(
	state: GameState,
	attacker: FighterState,
	target: FighterState,
	effect: CombatEffect['kind']
): PendingHit | null {
	const action = attacker.combatAction;

	if (
		!attacker.active ||
		attacker.health <= 0 ||
		action.phase !== 'active' ||
		action.hasHit ||
		target.health <= 0 ||
		!canHit(attacker, target, getActionTiming(action.kind).range)
	) {
		return null;
	}

	const timing = getActionTiming(action.kind);
	const damage =
		attacker === state.player && (action.kind === 'lightAttack' || action.kind === 'qiBurst')
			? getPlayerAttackDamage(state.items, action.kind)
			: timing.damage;
	return {
		attacker,
		target,
		damage,
		hitstun: timing.hitstun,
		effect,
		position: target.position
	};
}

function resolveActiveHits(state: GameState): void {
	const playerHit = collectActiveHit(
		state,
		state.player,
		state.rival,
		state.player.combatAction.kind === 'qiBurst' ? 'qi' : 'hit'
	);
	const rivalHit = collectActiveHit(state, state.rival, state.player, 'hit');
	const hits = [playerHit, rivalHit].filter((hit): hit is PendingHit => hit !== null);

	for (const hit of hits) {
		hit.target.health = Math.max(0, hit.target.health - hit.damage);
		hit.attacker.combatAction.hasHit = true;
		addEffect(state, hit.effect, hit.position);
	}

	for (const hit of hits) {
		enterHitstun(hit.target, hit.hitstun);
	}
}

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

function resolveEndState(state: GameState): void {
	if (state.rival.health <= 0) {
		const reward = grantVictoryReward(state.items);
		state.itemFeedback = `Won: ${formatReward(reward)}`;
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
	if (state.inventoryOpen) {
		state.prompt = 'Bag open';
		return;
	}

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
		state.prompt = 'J: strike  K: qi burst  Space: dash';
		return;
	}

	if (state.phase === 'victory') {
		state.prompt = state.items.lastReward
			? `Victory. Won: ${formatReward(state.items.lastReward)}.`
			: 'Victory. Restart to train again.';
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
