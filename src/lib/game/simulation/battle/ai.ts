import { AI_ARCHETYPES, AI_SHARED_WEIGHTS, EXTERNAL_ARTS, MOVES } from './content';
import { CARDINAL_FACINGS, canEnterTerrain, cellDistance, sameCell, terrainAt } from './grid';
import {
	applyBattleCommand,
	getMoveTargets,
	getReachableCells,
	getTurnOrder,
	summarizeAttack
} from './rules';
import type { AttackSummary } from './rules';
import type {
	AiArchetypeWeights,
	BattleAiProfile,
	BattleCommand,
	BattleCommandResult,
	BattleFighter,
	BattleMap,
	BattleState,
	Cell,
	Facing,
	MoveSlot
} from './types';

type AcceptedCommandResult = Extract<BattleCommandResult, { accepted: true }>;

type PositionCandidate = {
	state: BattleState;
	commands: BattleCommand[];
};

type Candidate = {
	commands: BattleCommand[];
	actionResult: AcceptedCommandResult;
	rank: number;
	score: number;
};

const MOVE_SLOTS: readonly MoveSlot[] = ['basic', 'technique', 'finisher'];

/**
 * Plans one complete legal turn without mutating the input. The reducer remains the rules
 * authority: legal movement produces speculative states, every action is applied once, and the
 * winning endTurn is validated through the same public command path callers replay.
 */
export function planBattleTurn(
	state: BattleState,
	actorId: string,
	profile: BattleAiProfile
): BattleCommand[] {
	validateProfile(profile, state.map);

	if (state.outcome !== 'ongoing') {
		return [];
	}
	const actor = state.fighters.find((fighter) => fighter.id === actorId);
	if (!actor || actor.health === 0) {
		return [];
	}
	if (getTurnOrder(state).activeId !== actorId) {
		return [];
	}

	const weights = AI_ARCHETYPES[profile.archetype];
	if (state.hasActed) {
		return planEndTurnOnly(state, actor, weights);
	}

	let best: Candidate | null = null;
	for (const position of enumeratePositions(state, actor)) {
		for (const action of enumerateActions(position.state, actor)) {
			const actionResult = applyBattleCommand(position.state, action);
			if (!actionResult.accepted) {
				throw new Error(`battle AI enumerated action was rejected: ${actionResult.reason}`);
			}
			for (const candidate of completeCandidates(position, action, actionResult, actor, weights)) {
				if (
					!best ||
					candidate.rank > best.rank ||
					(candidate.rank === best.rank && candidate.score > best.score)
				) {
					best = candidate;
				}
			}
		}
	}

	if (!best) {
		throw new Error('battle AI found no legal action candidates');
	}
	const endTurn = best.commands.find((command) => command.type === 'endTurn');
	if (endTurn) {
		const validation = applyBattleCommand(best.actionResult.state, endTurn);
		if (!validation.accepted) {
			throw new Error(`battle AI winning endTurn was rejected: ${validation.reason}`);
		}
	}
	return best.commands.map(copyCommand);
}

/** Profile authoring is external state, so validate the runtime shape before every early exit. */
function validateProfile(profile: BattleAiProfile, map: BattleMap): void {
	const candidate: unknown = profile;
	if (typeof candidate !== 'object' || candidate === null) {
		throw new Error('invalid battle AI profile: missing profile');
	}
	if (!('archetype' in candidate)) {
		throw new Error('invalid battle AI profile: missing archetype');
	}
	const archetype = candidate.archetype;
	if (
		typeof archetype !== 'string' ||
		!Object.prototype.hasOwnProperty.call(AI_ARCHETYPES, archetype)
	) {
		throw new Error(`invalid battle AI profile: unknown archetype ${String(archetype)}`);
	}
	if (archetype !== 'guardian') {
		return;
	}
	if (!('post' in candidate)) {
		throw new Error('invalid battle AI profile: missing guardian post');
	}
	const postCandidate: unknown = candidate.post;
	if (typeof postCandidate !== 'object' || postCandidate === null) {
		throw new Error('invalid battle AI profile: missing guardian post');
	}
	if (!('x' in postCandidate) || !('z' in postCandidate)) {
		throw new Error('invalid battle AI profile: guardian post needs x and z');
	}
	const x: unknown = postCandidate.x;
	const z: unknown = postCandidate.z;
	if (typeof x !== 'number' || typeof z !== 'number') {
		throw new Error('invalid battle AI profile: guardian post coordinates must be numbers');
	}
	if (!canEnterTerrain(terrainAt(map, { x, z }))) {
		throw new Error(
			'invalid battle AI profile: guardian post must be an integer, in-bounds, standable cell'
		);
	}
}

function planEndTurnOnly(
	state: BattleState,
	actor: BattleFighter,
	weights: AiArchetypeWeights
): BattleCommand[] {
	let facing = actor.facing;
	let bestScore: number | null = null;
	for (const candidateFacing of finalFacings(actor.facing)) {
		const score = scorePosition(state, actor, weights);
		if (bestScore === null || score > bestScore) {
			facing = candidateFacing;
			bestScore = score;
		}
	}

	const endTurn: BattleCommand = { type: 'endTurn', actorId: actor.id, facing };
	const validation = applyBattleCommand(state, endTurn);
	if (!validation.accepted) {
		throw new Error(`battle AI endTurn after action was rejected: ${validation.reason}`);
	}
	return [copyCommand(endTurn)];
}

/** Stay first, then legal moves in the movement query's stable cost/discovery order. */
function enumeratePositions(state: BattleState, actor: BattleFighter): PositionCandidate[] {
	if (state.hasMoved) {
		return [{ state, commands: [] }];
	}

	const moves: PositionCandidate[] = [];
	let foundStay = false;
	for (const entry of getReachableCells(state)) {
		if (sameCell(entry.cell, actor.cell)) {
			if (entry.cost === 0) {
				foundStay = true;
			}
			continue;
		}
		const command: BattleCommand = {
			type: 'move',
			actorId: actor.id,
			cell: copyCell(entry.cell)
		};
		const moved = applyBattleCommand(state, command);
		if (!moved.accepted) {
			throw new Error(`battle AI legal move was rejected: ${moved.reason}`);
		}
		moves.push({ state: moved.state, commands: [command] });
	}
	if (!foundStay) {
		throw new Error('battle AI movement query omitted the current cell');
	}
	return [{ state, commands: [] }, ...moves];
}

/** Owned slots in fixed order, every legal aim returned for each, then Guard and Gather qi. */
function enumerateActions(state: BattleState, actor: BattleFighter): BattleCommand[] {
	const actions: BattleCommand[] = [];
	const art = EXTERNAL_ARTS[actor.externalArtId];
	for (const slot of MOVE_SLOTS) {
		const moveId = art.moves[slot];
		for (const target of getMoveTargets(state, moveId)) {
			actions.push({
				type: 'useMove',
				actorId: actor.id,
				moveId,
				aim: copyCell(target.aim)
			});
		}
	}
	actions.push({ type: 'guard', actorId: actor.id });
	actions.push({ type: 'gatherQi', actorId: actor.id });
	return actions;
}

function completeCandidates(
	position: PositionCandidate,
	action: BattleCommand,
	actionResult: AcceptedCommandResult,
	actor: BattleFighter,
	weights: AiArchetypeWeights
): Candidate[] {
	const attack = action.type === 'useMove' ? summarizeAttack(actionResult, actor.id) : null;
	const rank = outcomeRank(actionResult.state, actor);
	const score = scoreCandidate(actionResult, actor, attack, weights);
	const actorAfter = fighterIn(actionResult.state, actor.id);
	const canEndTurn =
		actionResult.state.outcome === 'ongoing' &&
		actorAfter.health > 0 &&
		getTurnOrder(actionResult.state).activeId === actor.id;

	if (!canEndTurn) {
		return [
			{
				commands: [...position.commands, action],
				actionResult,
				rank,
				score
			}
		];
	}

	// Slice 1's attack/approach terms are facing-independent, so current-facing-first ties are
	// intentionally stable until the full geometric score arrives in Slice 2.
	return finalFacings(actorAfter.facing).map((facing) => ({
		commands: [...position.commands, action, { type: 'endTurn', actorId: actor.id, facing }],
		actionResult,
		rank,
		score
	}));
}

/** Squad victory and enemy victory are both rank two for the actor's own side. */
function outcomeRank(state: BattleState, actor: BattleFighter): number {
	if (state.outcome === 'ongoing') {
		return 1;
	}
	const squadWon = state.outcome === 'victory';
	return (actor.side === 'squad') === squadWon ? 2 : 0;
}

/**
 * Slice 1 scoring: actual attack consequences plus a simple preferred-range approach term. The
 * remaining authored weights are public data for Slice 2 and are deliberately not half-applied.
 */
function scoreCandidate(
	result: AcceptedCommandResult,
	actor: BattleFighter,
	attack: AttackSummary | null,
	weights: AiArchetypeWeights
): number {
	let score = 0;
	if (attack) {
		for (const hit of attack.hits) {
			score += hit.applied * AI_SHARED_WEIGHTS.damage;
			if (hit.defeated) {
				score += AI_SHARED_WEIGHTS.defeat;
			}
		}
		for (const counter of attack.counters) {
			score += counter.applied * weights.counterLoss;
		}
		score += attack.qiCost * AI_SHARED_WEIGHTS.qiSpent;
		if (attack.actorDefeated) {
			score += AI_SHARED_WEIGHTS.selfDefeat;
		}
	}

	if (result.state.outcome !== 'ongoing') {
		return score;
	}
	const actorAfter = fighterIn(result.state, actor.id);
	if (actorAfter.health === 0) {
		return score;
	}
	return score + scorePosition(result.state, actorAfter, weights);
}

function scorePosition(
	state: BattleState,
	actor: BattleFighter,
	weights: AiArchetypeWeights
): number {
	const nearest = Math.min(
		...state.fighters
			.filter((fighter) => fighter.health > 0 && fighter.side !== actor.side)
			.map((fighter) => cellDistance(actor.cell, fighter.cell))
	);
	if (!Number.isFinite(nearest)) {
		return 0;
	}
	const preferredRange = Math.min(weights.preferredRange, maximumMoveReach(actor));
	return weights.rangeDeviation * Math.abs(nearest - preferredRange);
}

/** Maximum geometrical reach over equipped moves; arc sweeps reach Manhattan distance two. */
function maximumMoveReach(actor: BattleFighter): number {
	const art = EXTERNAL_ARTS[actor.externalArtId];
	let maximum = 0;
	for (const slot of MOVE_SLOTS) {
		const targeting = MOVES[art.moves[slot]].targeting;
		if (targeting.shape === 'single') {
			maximum = Math.max(maximum, targeting.range);
		} else if (targeting.shape === 'line') {
			maximum = Math.max(maximum, targeting.length);
		} else {
			maximum = Math.max(maximum, 2);
		}
	}
	return maximum;
}

function finalFacings(current: Facing): Facing[] {
	const facings: Facing[] = [current];
	for (const facing of CARDINAL_FACINGS) {
		if (!facings.includes(facing)) {
			facings.push(facing);
		}
	}
	return facings;
}

function fighterIn(state: BattleState, actorId: string): BattleFighter {
	const fighter = state.fighters.find((candidate) => candidate.id === actorId);
	if (!fighter) {
		throw new Error(`battle AI lost fighter: ${actorId}`);
	}
	return fighter;
}

function copyCommand(command: BattleCommand): BattleCommand {
	switch (command.type) {
		case 'move':
			return { type: 'move', actorId: command.actorId, cell: copyCell(command.cell) };
		case 'useMove':
			return {
				type: 'useMove',
				actorId: command.actorId,
				moveId: command.moveId,
				aim: copyCell(command.aim)
			};
		case 'useItem':
			return {
				type: 'useItem',
				actorId: command.actorId,
				pillId: command.pillId,
				targetId: command.targetId
			};
		case 'guard':
			return { type: 'guard', actorId: command.actorId };
		case 'gatherQi':
			return { type: 'gatherQi', actorId: command.actorId };
		case 'endTurn':
			return { type: 'endTurn', actorId: command.actorId, facing: command.facing };
	}
}

function copyCell(cell: Cell): Cell {
	return { x: cell.x + 0, z: cell.z + 0 };
}
