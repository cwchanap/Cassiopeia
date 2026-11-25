import { ITEM_CATALOG } from '../items';
import { EXTERNAL_ARTS, INTERNAL_ARTS, MOVES } from './content';
import type { ConsumableEffect } from '../types';
import {
	affectedCells,
	canEnterTerrain,
	cellDistance,
	CARDINAL_FACINGS,
	computeReachableCells,
	facingStep,
	legalAimCells,
	sameCell,
	TERRAIN_BY_CHAR,
	terrainAt
} from './grid';
import type {
	BattleCommand,
	BattleCommandResult,
	BattleCreation,
	BattleEvent,
	BattleFighter,
	BattleForecastHit,
	BattleForecastResult,
	BattleMap,
	BattleMoveTarget,
	BattleOutcome,
	BattlePillId,
	BattleRejectionReason,
	BattleSetup,
	BattleState,
	BattleTurnOrder,
	Cell,
	Facing,
	FighterSetup,
	MoveDefinition,
	MoveId,
	ReachableCell
} from './types';

/** Fixed Gather qi before the internal art's gather bonus. */
const GATHER_QI = 20;

/** The closed shared-bag pill set; the restoration effects come from ITEM_CATALOG. */
const BATTLE_PILLS: Readonly<Record<BattlePillId, true>> = {
	lesser_healing_pill: true,
	lesser_qi_pill: true
};

const BATTLE_COMMAND_TYPES: Readonly<Record<BattleCommand['type'], true>> = {
	move: true,
	useMove: true,
	useItem: true,
	guard: true,
	gatherQi: true,
	endTurn: true
};

/** One division for every hit: base, power and five integer percentage factors. */
const DAMAGE_DENOMINATOR = 10 * 100 ** 5;
const FRONT_FACING_PERCENT = 100;
const SIDE_FACING_PERCENT = 125;
const REAR_FACING_PERCENT = 150;
const BAMBOO_COVER_PERCENT = 75;
const GUARD_PERCENT = 50;
const COUNTER_ATTACK_PERCENT = 50;
const MAX_MOVE_BASE_DAMAGE = Math.max(...Object.values(MOVES).map((move) => move.baseDamage));
const MAX_DAMAGE_TAKEN_PERCENT = Math.max(
	...Object.values(INTERNAL_ARTS).map((art) => art.damageTakenPercent)
);
/** Keeps every authored hit's whole numerator an exact integer before the single division. */
const MAX_POWER = Math.floor(
	Number.MAX_SAFE_INTEGER /
		(MAX_MOVE_BASE_DAMAGE * REAR_FACING_PERCENT * 100 ** 3 * MAX_DAMAGE_TAKEN_PERCENT)
);

export type DamageFactors = {
	baseDamage: number;
	power: number;
	facingPercent: number;
	coverPercent: number;
	guardPercent: number;
	passivePercent: number;
	attackPercent: number;
};

/** Single pure damage formula shared by every primary hit and every counter. */
export function computeDamage(factors: DamageFactors): number {
	const numerator =
		factors.baseDamage *
		factors.power *
		factors.facingPercent *
		factors.coverPercent *
		factors.guardPercent *
		factors.passivePercent *
		factors.attackPercent;
	return Math.max(1, Math.floor(numerator / DAMAGE_DENOMINATOR));
}

/** Validates authored setup, copies it and starts round one with its first turn. */
export function createBattle(setup: BattleSetup): BattleCreation {
	const map = parseTerrain(setup.terrain);
	if (setup.fighters.length === 0) {
		throw new Error('battle needs at least one fighter');
	}

	const ids = new Set<string>();
	const spawns = new Set<string>();
	const fighters: BattleFighter[] = [];

	for (const placement of setup.fighters) {
		if (ids.has(placement.id)) {
			throw new Error(`duplicate fighter id: ${placement.id}`);
		}
		ids.add(placement.id);

		if (placement.side !== 'squad' && placement.side !== 'enemy') {
			throw new Error(`invalid side for fighter ${placement.id}: ${placement.side}`);
		}
		if (!CARDINAL_FACINGS.includes(placement.facing)) {
			throw new Error(`invalid facing for fighter ${placement.id}: ${placement.facing}`);
		}
		if (!isStandable(map, placement.cell)) {
			throw new Error(`invalid spawn cell for fighter ${placement.id}`);
		}
		const spawnKey = cellKey(placement.cell);
		if (spawns.has(spawnKey)) {
			throw new Error(`overlapping spawn at ${spawnKey}`);
		}
		spawns.add(spawnKey);

		fighters.push(createFighter(placement));
	}

	const hero = fighters.find((fighter) => fighter.id === setup.heroId);
	if (!hero || hero.side !== 'squad') {
		throw new Error(`missing squad hero: ${setup.heroId}`);
	}
	if (!fighters.some((fighter) => fighter.side === 'enemy')) {
		throw new Error('battle needs at least one enemy fighter');
	}

	const state: BattleState = {
		map,
		fighters,
		heroId: setup.heroId,
		squadBag: copyBag(setup.squadBag),
		round: 1,
		turnOrder: [],
		turnIndex: 0,
		hasMoved: false,
		hasActed: false,
		outcome: 'ongoing'
	};
	state.turnOrder = initiativeOrder(state);

	const events: BattleEvent[] = [
		{ type: 'roundStarted', round: state.round, order: [...state.turnOrder] }
	];
	const first = livingFighter(state, state.turnOrder[0]);
	if (!first) {
		throw new Error('battle has no living fighter');
	}
	beginTurn(state, first, events);

	return { state, events };
}

/** Applies one command atomically. Rejections never touch the input or emit events. */
export function applyBattleCommand(
	state: BattleState,
	command: BattleCommand
): BattleCommandResult {
	if (BATTLE_COMMAND_TYPES[command.type] !== true) {
		return reject('invalidCommand');
	}
	const check = validateActiveActor(state, command.actorId);
	if (!check.ok) {
		return reject(check.reason);
	}

	const phase = validatePhase(state, command);
	if (phase) {
		return reject(phase);
	}

	const next = copyState(state);
	const actor = fighterIn(next, command.actorId);

	switch (command.type) {
		case 'move': {
			if (!isStandable(next.map, command.cell) || sameCell(command.cell, actor.cell)) {
				return reject('invalidCell');
			}
			const destination = reachableFrom(next, actor).find((entry) =>
				sameCell(entry.cell, command.cell)
			);
			if (!destination) {
				return reject('unreachable');
			}

			actor.cell = canonicalCell(command.cell);
			next.hasMoved = true;
			return {
				accepted: true,
				state: next,
				events: [
					{
						type: 'moved',
						actorId: actor.id,
						path: destination.path.map((cell) => ({ ...cell }))
					}
				]
			};
		}
		case 'guard': {
			actor.guarding = true;
			next.hasActed = true;
			return {
				accepted: true,
				state: next,
				events: [{ type: 'guarded', actorId: actor.id }]
			};
		}
		case 'gatherQi': {
			const qiBefore = actor.qi;
			actor.qi = Math.min(
				actor.maxQi,
				actor.qi + GATHER_QI + INTERNAL_ARTS[actor.internalArtId].gatherBonus
			);
			next.hasActed = true;
			return {
				accepted: true,
				state: next,
				events: [{ type: 'qiGathered', actorId: actor.id, qiBefore, qiAfter: actor.qi }]
			};
		}
		case 'endTurn': {
			if (!CARDINAL_FACINGS.includes(command.facing)) {
				return reject('invalidFacing');
			}
			const events: BattleEvent[] = [];
			finishTurn(next, actor, command.facing, events);
			return { accepted: true, state: next, events };
		}
		case 'useMove': {
			const owned = resolveMove(actor, command.moveId);
			if (!owned.ok) {
				return reject(owned.reason);
			}
			const target = moveTargets(next, actor, owned.move).find((entry) =>
				sameCell(entry.aim, command.aim)
			);
			if (!target) {
				return reject('invalidAim');
			}
			return resolveAttack(next, actor, owned.move, target);
		}
		case 'useItem': {
			const pill = resolvePill(next, actor, command.pillId, command.targetId);
			if (!pill.ok) {
				return reject(pill.reason);
			}

			const { effect, target } = pill;
			const resourceBefore = effect.resource === 'health' ? target.health : target.qi;
			const maximum = effect.resource === 'health' ? target.maxHealth : target.maxQi;
			const resourceAfter = Math.min(maximum, resourceBefore + effect.amount);
			if (effect.resource === 'health') {
				target.health = resourceAfter;
			} else {
				target.qi = resourceAfter;
			}

			const bagCount = (next.squadBag[command.pillId] ?? 0) - 1;
			if (bagCount > 0) {
				next.squadBag[command.pillId] = bagCount;
			} else {
				delete next.squadBag[command.pillId];
			}
			next.hasActed = true;

			return {
				accepted: true,
				state: next,
				events: [
					{
						type: 'itemUsed',
						actorId: actor.id,
						targetId: target.id,
						pillId: command.pillId,
						resource: effect.resource,
						amount: resourceAfter - resourceBefore,
						resourceBefore,
						resourceAfter,
						bagCount
					}
				]
			};
		}
	}
}

/**
 * Living initiative this round and the next round recomputed from current survivors. A terminal
 * state keeps its final-round living snapshot and acted markers but has no active or next turn.
 */
export function getTurnOrder(state: BattleState): BattleTurnOrder {
	const active = activeFighter(state);
	const order = state.turnOrder.filter((id) => livingFighter(state, id) !== undefined);
	const acted = new Set(state.turnOrder.slice(0, state.turnIndex));
	const actedIds = order.filter((id) => acted.has(id));
	// A fighter that has taken its action is still active while choosing facing.
	if (active && state.hasActed && !actedIds.includes(active.id)) {
		actedIds.push(active.id);
	}

	const ongoing = state.outcome === 'ongoing';
	return {
		round: state.round,
		activeId: ongoing ? (active?.id ?? null) : null,
		order,
		actedIds,
		nextRound: ongoing ? initiativeOrder(state) : []
	};
}

/**
 * Movement exposure query. Without an ID it returns the active fighter's legal movement, empty
 * after moving or acting. An explicit living ID always gets its full current-cell budget.
 */
export function getReachableCells(state: BattleState, fighterId?: string): ReachableCell[] {
	if (state.outcome !== 'ongoing') {
		return [];
	}
	const fighter = fighterId === undefined ? activeFighter(state) : livingFighter(state, fighterId);
	if (!fighter) {
		return [];
	}
	if (fighterId === undefined && (state.hasMoved || state.hasActed)) {
		return [];
	}
	return reachableFrom(state, fighter);
}

/**
 * Legal aims for the active fighter's move, each with the affected cells and the living enemies
 * they cover. Uses the same geometry and hostile filter as command validation, so every returned
 * aim is accepted by `useMove` on the unchanged state. Empty when the state or move is unusable.
 */
export function getMoveTargets(state: BattleState, moveId: MoveId): BattleMoveTarget[] {
	if (state.outcome !== 'ongoing' || state.hasActed) {
		return [];
	}
	const actor = activeFighter(state);
	if (!actor) {
		return [];
	}
	const owned = resolveMove(actor, moveId);
	if (!owned.ok) {
		return [];
	}
	return moveTargets(state, actor, owned.move);
}

/**
 * Exact action resolution preview. It calls the same non-mutating reducer as `useMove`, so a
 * rejection is the command's own reason and an accepted forecast projects that result's events and
 * state: per-hit mitigation and HP, the attack's qi delta and the resulting turn or handoff.
 */
export function forecastMove(
	state: BattleState,
	actorId: string,
	moveId: MoveId,
	aim: Cell
): BattleForecastResult {
	const result = applyBattleCommand(state, { type: 'useMove', actorId, moveId, aim });
	if (!result.accepted) {
		return { accepted: false, reason: result.reason };
	}

	const attacked = result.events.find(
		(event): event is Extract<BattleEvent, { type: 'attacked' }> => event.type === 'attacked'
	);
	if (!attacked) {
		throw new Error('accepted attack emitted no attacked event');
	}

	const hits: BattleForecastHit[] = [];
	const counters: BattleForecastHit[] = [];
	let counterMoveId: MoveId | null = null;
	for (const event of result.events) {
		if (event.type === 'countered') {
			counterMoveId = event.moveId;
			continue;
		}
		if (event.type !== 'damaged') {
			continue;
		}
		if (event.sourceId === actorId) {
			hits.push(forecastHit(event, attacked.moveId));
			continue;
		}
		if (!counterMoveId) {
			throw new Error('counter damage without a countered event');
		}
		counters.push(forecastHit(event, counterMoveId));
	}

	// Read the original actor's HP and the action's own qi delta, never the next fighter's
	// turn-start regeneration after an automatic handoff.
	const actor = fighterIn(result.state, actorId);
	return {
		accepted: true,
		forecast: {
			actorId,
			moveId,
			aim: { ...attacked.aim },
			qiCost: attacked.qiBefore - attacked.qiAfter,
			qiBefore: attacked.qiBefore,
			qiAfter: attacked.qiAfter,
			hits,
			counters,
			actorHealthAfter: actor.health,
			actorDefeated: actor.health === 0,
			outcome: result.state.outcome,
			activeFighterId: getTurnOrder(result.state).activeId,
			round: result.state.round
		}
	};
}

function forecastHit(
	event: Extract<BattleEvent, { type: 'damaged' }>,
	moveId: MoveId
): BattleForecastHit {
	return {
		sourceId: event.sourceId,
		targetId: event.targetId,
		moveId,
		calculated: event.calculated,
		applied: event.applied,
		facingPercent: event.facingPercent,
		coverPercent: event.coverPercent,
		guardPercent: event.guardPercent,
		passivePercent: event.passivePercent,
		attackPercent: event.attackPercent,
		healthBefore: event.healthBefore,
		healthAfter: event.healthAfter,
		defeated: event.healthAfter === 0
	};
}

type OwnedMove = { ok: true; move: MoveDefinition } | { ok: false; reason: BattleRejectionReason };

/** Ownership and qi gate shared by the target query and the useMove command. */
function resolveMove(actor: BattleFighter, moveId: MoveId): OwnedMove {
	const move = MOVES[moveId];
	if (!move || move.externalArtId !== actor.externalArtId) {
		return { ok: false, reason: 'moveNotOwned' };
	}
	if (actor.qi < move.qiCost) {
		return { ok: false, reason: 'insufficientQi' };
	}
	return { ok: true, move };
}

function moveTargets(
	state: BattleState,
	actor: BattleFighter,
	move: MoveDefinition
): BattleMoveTarget[] {
	const targets: BattleMoveTarget[] = [];
	for (const aim of legalAimCells(state.map, actor.cell, move.targeting)) {
		const cells = affectedCells(state.map, actor.cell, aim, move.targeting);
		const targetIds = hostileIdsIn(state, actor, cells);
		if (targetIds.length > 0) {
			targets.push({ aim, cells, targetIds });
		}
	}
	return targets;
}

function reachableFrom(state: BattleState, fighter: BattleFighter): ReachableCell[] {
	return computeReachableCells(
		state.map,
		fighter.cell,
		movementBudget(fighter),
		state.fighters
			.filter((other) => other.health > 0 && other.id !== fighter.id)
			.map((other) => ({ ...other.cell }))
	);
}

function hostileIdsIn(state: BattleState, actor: BattleFighter, cells: readonly Cell[]): string[] {
	const ids: string[] = [];
	for (const cell of cells) {
		const fighter = state.fighters.find(
			(candidate) =>
				candidate.health > 0 && candidate.side !== actor.side && sameCell(candidate.cell, cell)
		);
		if (fighter) {
			ids.push(fighter.id);
		}
	}
	return ids;
}

/**
 * The single resolution path for a validated attack: debit qi once, hit every living defender in
 * pattern order, evaluate the outcome, then let each surviving Guard counter once. A non-terminal
 * counter kill finishes the dead fighter's turn through the normal turn transition.
 */
function resolveAttack(
	state: BattleState,
	actor: BattleFighter,
	move: MoveDefinition,
	target: BattleMoveTarget
): BattleCommandResult {
	const events: BattleEvent[] = [];
	const qiBefore = actor.qi;
	actor.qi = qiBefore - move.qiCost;
	state.hasActed = true;
	events.push({
		type: 'attacked',
		actorId: actor.id,
		moveId: move.id,
		aim: { ...target.aim },
		cells: target.cells.map((cell) => ({ ...cell })),
		qiBefore,
		qiAfter: actor.qi
	});

	const defenders = target.targetIds.map((fighterId) => fighterIn(state, fighterId));
	for (const defender of defenders) {
		resolveHit(state, events, actor, defender, {
			baseDamage: move.baseDamage,
			attackPercent: 100,
			ignoreGuard: move.ignoreGuard
		});
	}

	if (finishIfTerminal(state, events)) {
		return { accepted: true, state, events };
	}

	// An ignoreGuard strike bypasses both Guard's reduction and its counter.
	if (!move.ignoreGuard) {
		for (const defender of defenders) {
			if (defender.health === 0 || !canCounter(defender, actor)) {
				continue;
			}
			const basic = MOVES[EXTERNAL_ARTS[defender.externalArtId].moves.basic];
			events.push({
				type: 'countered',
				actorId: defender.id,
				targetId: actor.id,
				moveId: basic.id
			});
			resolveHit(state, events, defender, actor, {
				baseDamage: basic.baseDamage,
				attackPercent: COUNTER_ATTACK_PERCENT,
				ignoreGuard: false,
				facingPercent: FRONT_FACING_PERCENT
			});
			if (finishIfTerminal(state, events)) {
				return { accepted: true, state, events };
			}
			if (actor.health === 0) {
				break;
			}
		}
	}

	if (actor.health === 0) {
		// Terminal hero and last-enemy deaths already ended the battle above.
		finishTurn(state, actor, actor.facing, events);
	}
	return { accepted: true, state, events };
}

type HitOptions = {
	baseDamage: number;
	attackPercent: number;
	ignoreGuard: boolean;
	/** Counters always read as front, whatever the recipient's stored facing is. */
	facingPercent?: number;
};

function resolveHit(
	state: BattleState,
	events: BattleEvent[],
	source: BattleFighter,
	target: BattleFighter,
	options: HitOptions
): void {
	const facingPercent = options.facingPercent ?? facingPercentFor(target, source.cell);
	const coverPercent = coverPercentFor(state, source.cell, target.cell);
	const guardPercent = target.guarding && !options.ignoreGuard ? GUARD_PERCENT : 100;
	const passivePercent = INTERNAL_ARTS[target.internalArtId].damageTakenPercent;
	const calculated = computeDamage({
		baseDamage: options.baseDamage,
		power: source.power,
		facingPercent,
		coverPercent,
		guardPercent,
		passivePercent,
		attackPercent: options.attackPercent
	});
	const healthBefore = target.health;
	const applied = Math.min(calculated, healthBefore);
	target.health = healthBefore - applied;
	events.push({
		type: 'damaged',
		sourceId: source.id,
		targetId: target.id,
		calculated,
		applied,
		facingPercent,
		coverPercent,
		guardPercent,
		passivePercent,
		attackPercent: options.attackPercent,
		healthBefore,
		healthAfter: target.health
	});
	if (target.health === 0) {
		events.push({ type: 'defeated', fighterId: target.id });
	}
}

/** A surviving Guard counters an adjacent attacker from front or side, never from the rear. */
function canCounter(defender: BattleFighter, attacker: BattleFighter): boolean {
	return (
		defender.guarding &&
		cellDistance(defender.cell, attacker.cell) === 1 &&
		facingPercentFor(defender, attacker.cell) !== REAR_FACING_PERCENT
	);
}

/** Front, side or rear from the defender's own facing and the attacker's position. */
function facingPercentFor(defender: BattleFighter, attackerCell: Cell): number {
	const forward = facingStep(defender.facing);
	const dx = attackerCell.x - defender.cell.x;
	const dz = attackerCell.z - defender.cell.z;
	const ahead = dx * forward.x + dz * forward.z;
	const lateral = dx * forward.z - dz * forward.x;
	if (Math.abs(ahead) > Math.abs(lateral)) {
		return ahead > 0 ? FRONT_FACING_PERCENT : REAR_FACING_PERCENT;
	}
	return SIDE_FACING_PERCENT;
}

/** Bamboo only covers a defender the attacker cannot reach in one step. */
function coverPercentFor(state: BattleState, sourceCell: Cell, targetCell: Cell): number {
	return terrainAt(state.map, targetCell) === 'bamboo' && cellDistance(sourceCell, targetCell) > 1
		? BAMBOO_COVER_PERCENT
		: 100;
}

function finishIfTerminal(state: BattleState, events: BattleEvent[]): boolean {
	const outcome = battleOutcome(state);
	if (outcome === 'ongoing') {
		return false;
	}
	state.outcome = outcome;
	events.push({ type: 'battleEnded', outcome });
	return true;
}

/** Hero defeat takes precedence over victory when both conditions hold. */
function battleOutcome(state: BattleState): BattleOutcome {
	if (fighterIn(state, state.heroId).health === 0) {
		return 'defeat';
	}
	return state.fighters.some((fighter) => fighter.side === 'enemy' && fighter.health > 0)
		? 'ongoing'
		: 'victory';
}

/**
 * Applies the acting fighter's final facing, records turnEnded and starts the next living
 * fighter's turn. Shared with automatic turn completion after a non-terminal counter kill.
 */
function finishTurn(
	state: BattleState,
	actor: BattleFighter,
	facingAfter: Facing,
	events: BattleEvent[]
): void {
	events.push({ type: 'turnEnded', actorId: actor.id, facingBefore: actor.facing, facingAfter });
	actor.facing = facingAfter;

	for (let index = state.turnIndex + 1; index < state.turnOrder.length; index++) {
		const next = livingFighter(state, state.turnOrder[index]);
		if (next) {
			state.turnIndex = index;
			beginTurn(state, next, events);
			return;
		}
	}

	state.round += 1;
	state.turnOrder = initiativeOrder(state);
	state.turnIndex = 0;
	events.push({ type: 'roundStarted', round: state.round, order: [...state.turnOrder] });

	const first = livingFighter(state, state.turnOrder[0]);
	if (!first) {
		throw new Error('ongoing battle has no living fighter');
	}
	beginTurn(state, first, events);
}

/** Clears the fighter's prior Guard, resets the phase flags and regenerates qi. */
function beginTurn(state: BattleState, fighter: BattleFighter, events: BattleEvent[]): void {
	fighter.guarding = false;
	state.hasMoved = false;
	state.hasActed = false;

	const qiBefore = fighter.qi;
	fighter.qi = Math.min(fighter.maxQi, fighter.qi + INTERNAL_ARTS[fighter.internalArtId].qiRegen);
	events.push({ type: 'turnStarted', actorId: fighter.id, qiBefore, qiAfter: fighter.qi });
}

type ActorCheck = { ok: true } | { ok: false; reason: BattleRejectionReason };

function validateActiveActor(state: BattleState, actorId: string): ActorCheck {
	if (state.outcome !== 'ongoing') {
		return { ok: false, reason: 'terminal' };
	}
	const active = activeFighter(state);
	if (!active || active.id !== actorId) {
		return { ok: false, reason: 'wrongActor' };
	}
	return { ok: true };
}

/** One phase gate for every command, applied before any state copy or command work. */
function validatePhase(state: BattleState, command: BattleCommand): BattleRejectionReason | null {
	switch (command.type) {
		case 'move':
			return state.hasActed || state.hasMoved ? 'wrongPhase' : null;
		case 'endTurn':
			return state.hasActed ? null : 'wrongPhase';
		case 'guard':
		case 'gatherQi':
		case 'useMove':
		case 'useItem':
			return state.hasActed ? 'wrongPhase' : null;
		default:
			return 'invalidCommand';
	}
}

type ResolvedPill =
	| { ok: true; effect: ConsumableEffect; target: BattleFighter }
	| { ok: false; reason: BattleRejectionReason };

/**
 * Squad shared-bag gate. The enemy side owns no bag; the acting squad fighter may spend a pill on
 * itself or a living adjacent squad ally, and the target must still be below its resource maximum.
 */
function resolvePill(
	state: BattleState,
	actor: BattleFighter,
	pillId: BattlePillId,
	targetId: string
): ResolvedPill {
	if (actor.side !== 'squad' || BATTLE_PILLS[pillId] !== true) {
		return { ok: false, reason: 'invalidItem' };
	}
	if ((state.squadBag[pillId] ?? 0) < 1) {
		return { ok: false, reason: 'invalidItem' };
	}

	const target = livingFighter(state, targetId);
	if (
		!target ||
		target.side !== 'squad' ||
		(target.id !== actor.id && cellDistance(actor.cell, target.cell) > 1)
	) {
		return { ok: false, reason: 'invalidTarget' };
	}

	const effect = ITEM_CATALOG[pillId].consumable;
	if (!effect) {
		throw new Error(`battle pill is not consumable: ${pillId}`);
	}
	const current = effect.resource === 'health' ? target.health : target.qi;
	const maximum = effect.resource === 'health' ? target.maxHealth : target.maxQi;
	if (current >= maximum) {
		return { ok: false, reason: 'resourceFull' };
	}
	return { ok: true, effect, target };
}

function initiativeOrder(state: BattleState): string[] {
	return state.fighters
		.map((fighter, setupIndex) => ({ fighter, setupIndex }))
		.filter(({ fighter }) => fighter.health > 0)
		.sort((left, right) => {
			if (left.fighter.agility !== right.fighter.agility) {
				return right.fighter.agility - left.fighter.agility;
			}
			if (left.fighter.side !== right.fighter.side) {
				return left.fighter.side === 'squad' ? -1 : 1;
			}
			return left.setupIndex - right.setupIndex;
		})
		.map(({ fighter }) => fighter.id);
}

function activeFighter(state: BattleState): BattleFighter | undefined {
	return livingFighter(state, state.turnOrder[state.turnIndex]);
}

function livingFighter(
	state: BattleState,
	fighterId: string | undefined
): BattleFighter | undefined {
	return state.fighters.find((fighter) => fighter.id === fighterId && fighter.health > 0);
}

function fighterIn(state: BattleState, fighterId: string): BattleFighter {
	const fighter = state.fighters.find((candidate) => candidate.id === fighterId);
	if (!fighter) {
		throw new Error(`unknown fighter: ${fighterId}`);
	}
	return fighter;
}

function movementBudget(fighter: BattleFighter): number {
	return 2 + Math.floor(fighter.agility / 10) + INTERNAL_ARTS[fighter.internalArtId].moveBonus;
}

function copyState(state: BattleState): BattleState {
	return {
		map: copyMap(state.map),
		fighters: state.fighters.map((fighter) => ({ ...fighter, cell: { ...fighter.cell } })),
		heroId: state.heroId,
		squadBag: { ...state.squadBag },
		round: state.round,
		turnOrder: [...state.turnOrder],
		turnIndex: state.turnIndex,
		hasMoved: state.hasMoved,
		hasActed: state.hasActed,
		outcome: state.outcome
	};
}

function copyMap(map: BattleMap): BattleMap {
	return {
		width: map.width,
		height: map.height,
		terrain: map.terrain.map((row) => [...row])
	};
}

function parseTerrain(rows: readonly string[]): BattleMap {
	if (rows.length === 0) {
		throw new Error('battle terrain must have at least one non-empty row');
	}
	if (typeof rows[0] !== 'string') {
		throw new Error('battle terrain rows must be strings');
	}
	if (rows[0].length === 0) {
		throw new Error('battle terrain must have at least one non-empty row');
	}
	const width = rows[0].length;
	for (let index = 0; index < rows.length; index++) {
		const row = rows[index];
		if (typeof row !== 'string') {
			throw new Error('battle terrain rows must be strings');
		}
		if (row.length !== width) {
			throw new Error('battle terrain rows must all have the same width');
		}
	}

	return {
		width,
		height: rows.length,
		terrain: rows.map((row) =>
			Array.from(row, (char) => {
				const terrain = TERRAIN_BY_CHAR[char];
				if (!terrain) {
					throw new Error(`unknown terrain character: ${char}`);
				}
				return terrain;
			})
		)
	};
}

function createFighter(placement: FighterSetup): BattleFighter {
	const { template } = placement;
	if (!Number.isSafeInteger(template.maxHealth) || template.maxHealth <= 0) {
		throw new Error(`invalid stats for fighter ${placement.id}`);
	}
	for (const stat of [template.power, template.agility]) {
		if (!Number.isInteger(stat) || stat <= 0) {
			throw new Error(`invalid stats for fighter ${placement.id}`);
		}
	}
	if (template.power > MAX_POWER) {
		throw new Error(`invalid stats for fighter ${placement.id}`);
	}

	const internalArt = INTERNAL_ARTS[template.internalArtId];
	return {
		id: placement.id,
		side: placement.side,
		maxHealth: template.maxHealth,
		health: template.maxHealth,
		maxQi: internalArt.maxQi,
		qi: internalArt.maxQi,
		power: template.power,
		agility: template.agility,
		externalArtId: template.externalArtId,
		internalArtId: template.internalArtId,
		cell: canonicalCell(placement.cell),
		facing: placement.facing,
		guarding: false
	};
}

/**
 * Canonical public-boundary cell: only the two integer coordinates, never extra properties or
 * negative zero. Callers validate the cell before it reaches this copy.
 */
function canonicalCell(cell: Cell): Cell {
	return { x: cell.x + 0, z: cell.z + 0 };
}

function copyBag(
	bag: Partial<Record<BattlePillId, number>> | undefined
): Partial<Record<BattlePillId, number>> {
	const copy: Partial<Record<BattlePillId, number>> = {};
	for (const [pillId, count] of Object.entries(bag ?? {})) {
		if (count === undefined) {
			continue;
		}
		if (!Number.isSafeInteger(count) || count < 0) {
			throw new Error(`invalid starting bag count for ${pillId}`);
		}
		// Unknown inventory keys are validated above but never enter the battle bag.
		if (count > 0 && BATTLE_PILLS[pillId as BattlePillId] === true) {
			copy[pillId as BattlePillId] = count;
		}
	}
	return copy;
}

function isStandable(map: BattleMap, cell: Cell): boolean {
	return canEnterTerrain(terrainAt(map, cell));
}

function reject(reason: BattleRejectionReason): BattleCommandResult {
	return { accepted: false, reason };
}

function cellKey(cell: Cell): string {
	return `${cell.x},${cell.z}`;
}
