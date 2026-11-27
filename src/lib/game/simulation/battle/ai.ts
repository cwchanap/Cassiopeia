import { AI_ARCHETYPES, AI_SHARED_WEIGHTS, EXTERNAL_ARTS, INTERNAL_ARTS, MOVES } from './content';
import {
	CARDINAL_FACINGS,
	affectedCells,
	canEnterTerrain,
	cellDistance,
	computeReachableCells,
	legalAimCells,
	sameCell,
	terrainAt
} from './grid';
import {
	applyBattleCommand,
	facingPercentFor,
	getMoveTargets,
	getReachableCells,
	getTurnOrder,
	movementBudget,
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

/** Battle-module threat estimate: hostile id, threatened cell key, then unique attack origins. */
export type ActorExcludedThreatMap = Map<string, Map<string, Cell[]>>;

type DecisionContext = {
	profile: BattleAiProfile;
	weights: AiArchetypeWeights;
	threatMap: ActorExcludedThreatMap;
};

type ThreateningHostile = {
	fighter: BattleFighter;
	origins: Cell[];
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

	const decision: DecisionContext = {
		profile,
		weights: AI_ARCHETYPES[profile.archetype],
		threatMap: buildActorExcludedThreatMap(state, actor)
	};
	if (state.hasActed) {
		return planEndTurnOnly(state, actor, decision);
	}

	let best: Candidate | null = null;
	for (const position of enumeratePositions(state, actor)) {
		for (const action of enumerateActions(position.state, actor)) {
			const actionResult = applyBattleCommand(position.state, action);
			if (!actionResult.accepted) {
				throw new Error(`battle AI enumerated action was rejected: ${actionResult.reason}`);
			}
			for (const candidate of completeCandidates(position, action, actionResult, actor, decision)) {
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

/**
 * Builds the single geometric threat estimate for one decision. The acting fighter is omitted
 * from blockers for every destination, including stay, while all other living fighters block the
 * hostile being evaluated. This is intentionally not recomputed for hypothetical destinations.
 */
export function buildActorExcludedThreatMap(
	state: BattleState,
	actor: BattleFighter
): ActorExcludedThreatMap {
	const threatMap: ActorExcludedThreatMap = new Map();
	for (const hostile of state.fighters.filter(
		(fighter) => fighter.health > 0 && fighter.side !== actor.side
	)) {
		const threatenedByCell = new Map<string, Cell[]>();
		threatMap.set(hostile.id, threatenedByCell);
		const occupied = state.fighters
			.filter(
				(fighter) => fighter.health > 0 && fighter.id !== hostile.id && fighter.id !== actor.id
			)
			.map((fighter) => copyCell(fighter.cell));
		const reachable = computeReachableCells(
			state.map,
			hostile.cell,
			movementBudget(hostile),
			occupied
		);
		const qiAfterRegen = Math.min(
			hostile.maxQi,
			hostile.qi + INTERNAL_ARTS[hostile.internalArtId].qiRegen
		);
		const affordableMoves = MOVE_SLOTS.map(
			(slot) => MOVES[EXTERNAL_ARTS[hostile.externalArtId].moves[slot]]
		).filter((move) => move.qiCost <= qiAfterRegen);

		for (const entry of reachable) {
			const threatenedKeys = new Set<string>();
			for (const move of affordableMoves) {
				for (const aim of legalAimCells(state.map, entry.cell, move.targeting)) {
					for (const threatened of affectedCells(state.map, entry.cell, aim, move.targeting)) {
						threatenedKeys.add(cellKey(threatened));
					}
				}
			}
			for (const key of threatenedKeys) {
				const origins = threatenedByCell.get(key);
				if (origins) {
					origins.push(copyCell(entry.cell));
				} else {
					threatenedByCell.set(key, [copyCell(entry.cell)]);
				}
			}
		}
	}
	return threatMap;
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
	decision: DecisionContext
): BattleCommand[] {
	let facing = actor.facing;
	let bestScore: number | null = null;
	for (const candidateFacing of finalFacings(actor.facing)) {
		const score = scorePosition(state, actor, candidateFacing, decision);
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
	decision: DecisionContext
): Candidate[] {
	const attack = action.type === 'useMove' ? summarizeAttack(actionResult, actor.id) : null;
	const rank = outcomeRank(actionResult.state, actor);
	const actionScore = scoreAction(actionResult, actor, action, attack, decision.weights);
	const actorAfter = fighterIn(actionResult.state, actor.id);
	const outcome = attack ? attack.outcome : actionResult.state.outcome;
	const actorDefeated = attack ? attack.actorDefeated : actorAfter.health === 0;
	const activeFighterId = attack
		? attack.activeFighterId
		: getTurnOrder(actionResult.state).activeId;
	const canEndTurn = outcome === 'ongoing' && !actorDefeated && activeFighterId === actor.id;

	if (!canEndTurn) {
		return [
			{
				commands: [...position.commands, action],
				actionResult,
				rank,
				score:
					actionScore + scorePosition(actionResult.state, actorAfter, actorAfter.facing, decision)
			}
		];
	}

	return finalFacings(actorAfter.facing).map((facing) => ({
		commands: [...position.commands, action, { type: 'endTurn', actorId: actor.id, facing }],
		actionResult,
		rank,
		score: actionScore + scorePosition(actionResult.state, actorAfter, facing, decision)
	}));
}

/** Terminal outcomes rank two when the actor's side won and zero when it lost. */
function outcomeRank(state: BattleState, actor: BattleFighter): number {
	if (state.outcome === 'ongoing') {
		return 1;
	}
	const squadWon = state.outcome === 'victory';
	return (actor.side === 'squad') === squadWon ? 2 : 0;
}

/** Actual reducer-applied attack, counter, qi and Gather consequences; no combat recomputation. */
function scoreAction(
	result: AcceptedCommandResult,
	actor: BattleFighter,
	action: BattleCommand,
	attack: AttackSummary | null,
	weights: AiArchetypeWeights
): number {
	let score = 0;
	if (attack) {
		for (const hit of attack.hits) {
			const target = fighterIn(result.state, hit.targetId);
			score += hit.applied * AI_SHARED_WEIGHTS.damage;
			if (hit.defeated) {
				score += AI_SHARED_WEIGHTS.defeat;
			}
			score += Math.floor(
				(weights.weakTarget * (target.maxHealth - hit.healthBefore)) / target.maxHealth
			);
			score += weights.flank * facingSteps(hit.facingPercent);
		}
		for (const counter of attack.counters) {
			score += counter.applied * weights.counterLoss;
		}
		score += attack.qiCost * AI_SHARED_WEIGHTS.qiSpent;
		if (attack.actorDefeated && attack.outcome === 'ongoing') {
			score += AI_SHARED_WEIGHTS.selfDefeat;
		}
	}

	if (action.type === 'gatherQi') {
		for (const event of result.events) {
			if (event.type === 'qiGathered' && event.actorId === actor.id) {
				score += (event.qiAfter - event.qiBefore) * weights.gatherQi;
			}
		}
	}
	return score;
}

/**
 * Scores the post-action position for one hypothetical final facing. Terminal states and dead
 * actors skip these terms; killed hostiles are filtered from the one precomputed threat lookup.
 */
function scorePosition(
	state: BattleState,
	actor: BattleFighter,
	facing: Facing,
	decision: DecisionContext
): number {
	if (state.outcome !== 'ongoing' || actor.health === 0) {
		return 0;
	}

	const weights = decision.weights;
	let score = 0;
	if (terrainAt(state.map, actor.cell) === 'bamboo') {
		score += weights.bamboo;
	}

	const hostiles = state.fighters.filter(
		(fighter) => fighter.health > 0 && fighter.side !== actor.side
	);
	if (hostiles.length > 0) {
		const nearest = Math.min(...hostiles.map((hostile) => cellDistance(actor.cell, hostile.cell)));
		const preferredRange = Math.min(weights.preferredRange, maximumMoveReach(actor));
		score += weights.rangeDeviation * Math.abs(nearest - preferredRange);
		score +=
			weights.adjacentHostile *
			hostiles.filter((hostile) => cellDistance(actor.cell, hostile.cell) === 1).length;
	}
	if (decision.profile.archetype === 'guardian') {
		score += weights.postDistance * cellDistance(actor.cell, decision.profile.post);
	}

	const threats = threateningHostiles(state, actor, decision.threatMap);
	score += weights.threatCount * threats.length;
	let rearThreats = 0;
	let currentExposure = 0;
	for (const threat of threats) {
		if (threat.origins.some((origin) => facingPercentFor(actor.cell, facing, origin) === 150)) {
			rearThreats += 1;
		}
		currentExposure += facingSteps(facingPercentFor(actor.cell, facing, threat.fighter.cell));
	}
	score += weights.rearThreat * rearThreats;
	score += weights.currentExposure * currentExposure;
	if (actor.guarding && threats.length > 0) {
		score += weights.guard;
	}
	return score;
}

function threateningHostiles(
	state: BattleState,
	actor: BattleFighter,
	threatMap: ActorExcludedThreatMap
): ThreateningHostile[] {
	const threats: ThreateningHostile[] = [];
	for (const hostile of state.fighters.filter(
		(fighter) => fighter.health > 0 && fighter.side !== actor.side
	)) {
		const origins = threatMap.get(hostile.id)?.get(cellKey(actor.cell));
		if (origins && origins.length > 0) {
			threats.push({ fighter: hostile, origins });
		}
	}
	return threats;
}

/** Front/side/rear percentages become zero, one and two exposure steps. */
function facingSteps(facingPercent: number): number {
	if (facingPercent === 100) {
		return 0;
	}
	if (facingPercent === 125) {
		return 1;
	}
	return 2;
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

function cellKey(cell: Cell): string {
	return `${cell.x},${cell.z}`;
}
