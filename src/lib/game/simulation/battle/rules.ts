import { INTERNAL_ARTS } from './content';
import {
	CARDINAL_FACINGS,
	computeReachableCells,
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
	BattleMap,
	BattlePillId,
	BattleRejectionReason,
	BattleSetup,
	BattleState,
	BattleTurnOrder,
	Cell,
	Facing,
	FighterSetup,
	ReachableCell
} from './types';

/** Fixed Gather qi before the internal art's gather bonus. */
const GATHER_QI = 20;

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

			actor.cell = { ...command.cell };
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
		case 'useMove':
			// Slice 3 replaces this stub with ownership, geometry and damage resolution.
			return reject('invalidAim');
		case 'useItem':
			// Slice 4 replaces this stub with shared-bag validation and pill use.
			return reject('invalidItem');
	}
}

/** Living initiative this round and the next round recomputed from current survivors. */
export function getTurnOrder(state: BattleState): BattleTurnOrder {
	if (state.outcome !== 'ongoing') {
		return { round: state.round, activeId: null, order: [], actedIds: [], nextRound: [] };
	}

	const active = activeFighter(state);
	const order = state.turnOrder.filter((id) => livingFighter(state, id) !== undefined);
	const acted = new Set(state.turnOrder.slice(0, state.turnIndex));
	const actedIds = order.filter((id) => acted.has(id));
	// A fighter that has taken its action is still active while choosing facing.
	if (active && state.hasActed && !actedIds.includes(active.id)) {
		actedIds.push(active.id);
	}

	return {
		round: state.round,
		activeId: active?.id ?? null,
		order,
		actedIds,
		nextRound: initiativeOrder(state)
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
	}
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
	if (rows.length === 0 || rows[0].length === 0) {
		throw new Error('battle terrain must have at least one non-empty row');
	}
	const width = rows[0].length;
	if (rows.some((row) => row.length !== width)) {
		throw new Error('battle terrain rows must all have the same width');
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
	for (const stat of [template.maxHealth, template.power, template.agility]) {
		if (!Number.isInteger(stat) || stat <= 0) {
			throw new Error(`invalid stats for fighter ${placement.id}`);
		}
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
		cell: { ...placement.cell },
		facing: placement.facing,
		guarding: false
	};
}

function copyBag(
	bag: Partial<Record<BattlePillId, number>> | undefined
): Partial<Record<BattlePillId, number>> {
	const copy: Partial<Record<BattlePillId, number>> = {};
	for (const [pillId, count] of Object.entries(bag ?? {})) {
		if (count === undefined) {
			continue;
		}
		if (!Number.isInteger(count) || count < 0) {
			throw new Error(`invalid starting bag count for ${pillId}`);
		}
		if (count > 0) {
			copy[pillId as BattlePillId] = count;
		}
	}
	return copy;
}

function isStandable(map: BattleMap, cell: Cell): boolean {
	const terrain = terrainAt(map, cell);
	return terrain === 'ground' || terrain === 'bamboo';
}

function reject(reason: BattleRejectionReason): BattleCommandResult {
	return { accepted: false, reason };
}

function cellKey(cell: Cell): string {
	return `${cell.x},${cell.z}`;
}
