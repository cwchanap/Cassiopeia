import { AI_ARCHETYPES, AI_SHARED_WEIGHTS, EXTERNAL_ARTS, INTERNAL_ARTS, MOVES } from './content';
import {
	CARDINAL_FACINGS,
	affectedCells,
	canEnterTerrain,
	cellDistance,
	computeReachableCells,
	facingStep,
	legalAimCells,
	sameCell,
	terrainAt
} from './grid';
import {
	applyBattleCommand,
	applyBattleCommandWithRuleCache,
	createBattleRuleCache,
	facingPercentFor,
	getMoveTargetsWithRuleCache,
	getReachableCells,
	getTurnOrder,
	movementBudget,
	summarizeAttack
} from './rules';
import type { AttackSummary, BattleRuleCache } from './rules';
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
	MoveSlot,
	MoveTargeting
} from './types';

type AcceptedCommandResult = Extract<BattleCommandResult, { accepted: true }>;

type PositionCandidate = {
	state: BattleState;
	commands: BattleCommand[];
};

type Candidate = {
	actionResult: AcceptedCommandResult;
	endTurnFacing: Facing | null;
	rank: number;
	score: number;
};

type WinningCandidate = {
	position: PositionCandidate;
	action: BattleCommand;
	candidate: Candidate;
};

/** Battle-module threat estimate: hostile id, threatened cell key, then unique attack origins. */
export type ActorExcludedThreatMap = Map<string, Map<string, Cell[]>>;

type DecisionContext = {
	profile: BattleAiProfile;
	weights: AiArchetypeWeights;
	threatMap: ActorExcludedThreatMap;
	rangeDistances: ReadonlyMap<string, ReadonlyMap<string, number>>;
	clearShots: Map<string, Map<string, boolean>>;
	shotTargeting: readonly MoveTargeting[];
	maximumMoveReach: number;
	finalFacings: readonly Facing[];
};

type ThreateningHostile = {
	fighter: BattleFighter;
	origins: Cell[];
};

type PositionAssessment = {
	facingIndependentScore: number;
	threats: ThreateningHostile[];
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
		threatMap: buildActorExcludedThreatMap(state, actor),
		rangeDistances: buildHostileRangeDistances(state, actor),
		clearShots: new Map(),
		shotTargeting: clearShotTargeting(actor),
		maximumMoveReach: maximumMoveReach(actor),
		finalFacings: finalFacings(actor.facing)
	};
	if (state.hasActed) {
		return planEndTurnOnly(state, actor, decision);
	}

	const ruleCache = createBattleRuleCache();
	let best: WinningCandidate | null = null;
	for (const position of enumeratePositions(state, actor, ruleCache)) {
		for (const action of enumerateActions(position.state, actor, ruleCache)) {
			const actionResult = applyBattleCommandWithRuleCache(position.state, action, ruleCache);
			if (!actionResult.accepted) {
				throw new Error(`battle AI enumerated action was rejected: ${actionResult.reason}`);
			}
			const candidate = completeCandidate(action, actionResult, actor, decision);
			if (
				!best ||
				candidate.rank > best.candidate.rank ||
				(candidate.rank === best.candidate.rank && candidate.score > best.candidate.score)
			) {
				best = { position, action, candidate };
			}
		}
	}

	if (!best) {
		throw new Error('battle AI found no legal action candidates');
	}
	const commands = [...best.position.commands, best.action];
	if (best.candidate.endTurnFacing !== null) {
		const endTurn: BattleCommand = {
			type: 'endTurn',
			actorId: actor.id,
			facing: best.candidate.endTurnFacing
		};
		const validation = applyBattleCommand(best.candidate.actionResult.state, endTurn);
		if (!validation.accepted) {
			throw new Error(`battle AI winning endTurn was rejected: ${validation.reason}`);
		}
		commands.push(endTurn);
	}
	return commands.map(copyCommand);
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
		const threatenedByIndex = new Map<number, Cell[]>();
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
		const affordableTargeting: MoveTargeting[] = [];
		const seenTargeting = new Set<string>();
		for (const slot of MOVE_SLOTS) {
			const move = MOVES[EXTERNAL_ARTS[hostile.externalArtId].moves[slot]];
			if (move.qiCost > qiAfterRegen) {
				continue;
			}
			const key = targetingKey(move.targeting);
			if (!seenTargeting.has(key)) {
				seenTargeting.add(key);
				affordableTargeting.push(move.targeting);
			}
		}

		for (const entry of reachable) {
			const threatenedIndexes = new Set<number>();
			for (const targeting of affordableTargeting) {
				for (const aim of legalAimCells(state.map, entry.cell, targeting)) {
					if (targeting.shape === 'single') {
						threatenedIndexes.add(threatIndex(state.map, aim));
						continue;
					}
					for (const threatened of affectedCells(state.map, entry.cell, aim, targeting)) {
						threatenedIndexes.add(threatIndex(state.map, threatened));
					}
				}
			}
			const origin = copyCell(entry.cell);
			for (const index of threatenedIndexes) {
				const origins = threatenedByIndex.get(index);
				if (origins) {
					origins.push(origin);
				} else {
					threatenedByIndex.set(index, [origin]);
				}
			}
		}
		for (const [index, origins] of threatenedByIndex) {
			threatenedByCell.set(threatKey(state.map, index), origins);
		}
	}
	return threatMap;
}

function threatIndex(map: BattleMap, cell: Cell): number {
	return cell.z * map.width + cell.x;
}

function threatKey(map: BattleMap, index: number): string {
	const x = index % map.width;
	const z = Math.floor(index / map.width);
	return `${x},${z}`;
}

function targetingKey(targeting: MoveTargeting): string {
	if (targeting.shape === 'single') {
		return `single:${targeting.range}`;
	}
	if (targeting.shape === 'line') {
		return `line:${targeting.length}`;
	}
	return 'arc';
}

/**
 * Terrain walking distances in cardinal steps. Fighter occupancy is transient,
 * so only terrain blocks.
 */
function buildHostileRangeDistances(
	state: BattleState,
	actor: BattleFighter
): Map<string, Map<string, number>> {
	const distancesByHostile = new Map<string, Map<string, number>>();
	const budget = state.hasMoved || state.hasActed ? 0 : movementBudget(actor);
	const targets = movementFootprintKeys(state.map, actor.cell, budget);
	for (const hostile of state.fighters) {
		if (hostile.health === 0 || hostile.side === actor.side) {
			continue;
		}
		distancesByHostile.set(hostile.id, walkingDistanceField(state.map, hostile.cell, targets));
	}
	return distancesByHostile;
}

/** Standable cells a unit with this movement budget could possibly reach, ignoring bamboo cost. */
function movementFootprintKeys(map: BattleMap, center: Cell, budget: number): Set<string> {
	const keys = new Set<string>();
	for (
		let z = Math.max(0, center.z - budget);
		z <= Math.min(map.height - 1, center.z + budget);
		z++
	) {
		const horizontal = budget - Math.abs(center.z - z);
		for (
			let x = Math.max(0, center.x - horizontal);
			x <= Math.min(map.width - 1, center.x + horizontal);
			x++
		) {
			const cell = { x, z };
			if (canEnterTerrain(terrainAt(map, cell))) {
				keys.add(cellKey(cell));
			}
		}
	}
	return keys;
}

function walkingDistanceField(
	map: BattleMap,
	start: Cell,
	targets: ReadonlySet<string>
): Map<string, number> {
	const remaining = new Set(targets);
	const distances = new Map<string, number>([[cellKey(start), 0]]);
	const frontier: { cell: Cell; distance: number }[] = [{ cell: { ...start }, distance: 0 }];
	remaining.delete(cellKey(start));
	for (let index = 0; index < frontier.length && remaining.size > 0; index++) {
		const current = frontier[index];
		for (const facing of CARDINAL_FACINGS) {
			const step = facingStep(facing);
			const next = { x: current.cell.x + step.x, z: current.cell.z + step.z };
			if (!canEnterTerrain(terrainAt(map, next))) {
				continue;
			}
			const key = cellKey(next);
			if (distances.has(key)) {
				continue;
			}
			distances.set(key, current.distance + 1);
			remaining.delete(key);
			frontier.push({ cell: next, distance: current.distance + 1 });
		}
	}
	return distances;
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
	const assessment = assessPosition(state, actor, decision);
	let facing = actor.facing;
	let bestScore: number | null = null;
	for (const candidateFacing of decision.finalFacings) {
		const score = scorePosition(assessment, actor, candidateFacing, decision.weights);
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
function enumeratePositions(
	state: BattleState,
	actor: BattleFighter,
	ruleCache: BattleRuleCache
): PositionCandidate[] {
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
		const moved = applyBattleCommandWithRuleCache(state, command, ruleCache);
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
function enumerateActions(
	state: BattleState,
	actor: BattleFighter,
	ruleCache: BattleRuleCache
): BattleCommand[] {
	const actions: BattleCommand[] = [];
	const art = EXTERNAL_ARTS[actor.externalArtId];
	for (const slot of MOVE_SLOTS) {
		const moveId = art.moves[slot];
		for (const target of getMoveTargetsWithRuleCache(state, moveId, ruleCache)) {
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

function completeCandidate(
	action: BattleCommand,
	actionResult: AcceptedCommandResult,
	actor: BattleFighter,
	decision: DecisionContext
): Candidate {
	const attack = action.type === 'useMove' ? summarizeAttack(actionResult, actor.id) : null;
	const rank = outcomeRank(actionResult.state, actor);
	const actionScore = scoreAction(actionResult, actor, action, attack, decision.weights);
	const actorAfter = fighterIn(actionResult.state, actor.id);
	const assessment = assessPosition(actionResult.state, actorAfter, decision);
	const outcome = attack ? attack.outcome : actionResult.state.outcome;
	const actorDefeated = attack ? attack.actorDefeated : actorAfter.health === 0;
	const activeFighterId = attack ? attack.activeFighterId : actor.id;
	const canEndTurn = outcome === 'ongoing' && !actorDefeated && activeFighterId === actor.id;

	if (!canEndTurn) {
		return {
			actionResult,
			endTurnFacing: null,
			rank,
			score:
				actionScore + scorePosition(assessment, actorAfter, actorAfter.facing, decision.weights)
		};
	}

	let facing = actorAfter.facing;
	let bestPositionScore: number | null = null;
	for (const candidateFacing of decision.finalFacings) {
		const positionScore = scorePosition(assessment, actorAfter, candidateFacing, decision.weights);
		if (bestPositionScore === null || positionScore > bestPositionScore) {
			facing = candidateFacing;
			bestPositionScore = positionScore;
		}
	}
	if (bestPositionScore === null) {
		throw new Error('battle AI found no final facing candidates');
	}

	return {
		actionResult,
		endTurnFacing: facing,
		rank,
		score: actionScore + bestPositionScore
	};
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
 * Computes every post-action positional term that does not depend on final facing. Terminal states
 * and dead actors skip these terms; killed hostiles are filtered from the one precomputed threat lookup.
 */
function assessPosition(
	state: BattleState,
	actor: BattleFighter,
	decision: DecisionContext
): PositionAssessment {
	if (state.outcome !== 'ongoing' || actor.health === 0) {
		return { facingIndependentScore: 0, threats: [] };
	}

	const weights = decision.weights;
	let score = 0;
	if (terrainAt(state.map, actor.cell) === 'bamboo') {
		score += weights.bamboo;
	}

	let nearest: number | null = null;
	let nearestClearShots: boolean[] = [];
	let adjacentHostiles = 0;
	for (const hostile of state.fighters) {
		if (hostile.health === 0 || hostile.side === actor.side) {
			continue;
		}
		const walkingDistance = decision.rangeDistances.get(hostile.id)?.get(cellKey(actor.cell));
		const clearShot = cachedClearShot(state.map, actor, hostile, decision);
		const distance = clearShot ? cellDistance(actor.cell, hostile.cell) : walkingDistance;
		if (distance !== undefined && (nearest === null || distance < nearest)) {
			nearest = distance;
			nearestClearShots = [clearShot];
		} else if (distance !== undefined && distance === nearest) {
			nearestClearShots.push(clearShot);
		}
		if (cellDistance(actor.cell, hostile.cell) === 1) {
			adjacentHostiles += 1;
		}
	}
	if (nearest !== null) {
		const preferredRange = Math.min(weights.preferredRange, decision.maximumMoveReach);
		const deviation = Math.abs(nearest - preferredRange);
		const blockedPreferredRange =
			deviation === 0 && !nearestClearShots.some((clearShot) => clearShot);
		score += weights.rangeDeviation * (deviation + (blockedPreferredRange ? 1 : 0));
		score += weights.adjacentHostile * adjacentHostiles;
	}
	if (decision.profile.archetype === 'guardian') {
		score += weights.postDistance * cellDistance(actor.cell, decision.profile.post);
	}

	const threats = threateningHostiles(state, actor, decision.threatMap);
	score += weights.threatCount * threats.length;
	if (actor.guarding && threats.length > 0) {
		score += weights.guard;
	}
	return { facingIndependentScore: score, threats };
}

/** Adds only the rear-threat and current-exposure terms for one hypothetical final facing. */
function scorePosition(
	assessment: PositionAssessment,
	actor: BattleFighter,
	facing: Facing,
	weights: AiArchetypeWeights
): number {
	let rearThreats = 0;
	let currentExposure = 0;
	for (const threat of assessment.threats) {
		if (threat.origins.some((origin) => facingPercentFor(actor.cell, facing, origin) === 150)) {
			rearThreats += 1;
		}
		currentExposure += facingSteps(facingPercentFor(actor.cell, facing, threat.fighter.cell));
	}
	return (
		assessment.facingIndependentScore +
		weights.rearThreat * rearThreats +
		weights.currentExposure * currentExposure
	);
}

function threateningHostiles(
	state: BattleState,
	actor: BattleFighter,
	threatMap: ActorExcludedThreatMap
): ThreateningHostile[] {
	const threats: ThreateningHostile[] = [];
	for (const hostile of state.fighters) {
		if (hostile.health === 0 || hostile.side === actor.side) {
			continue;
		}
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

function cachedClearShot(
	map: BattleMap,
	actor: BattleFighter,
	hostile: BattleFighter,
	decision: DecisionContext
): boolean {
	let byCell = decision.clearShots.get(hostile.id);
	if (!byCell) {
		byCell = new Map();
		decision.clearShots.set(hostile.id, byCell);
	}
	const key = cellKey(actor.cell);
	const cached = byCell.get(key);
	if (cached !== undefined) {
		return cached;
	}
	const clearShot = hasClearShot(map, actor.cell, hostile.cell, decision.shotTargeting);
	byCell.set(key, clearShot);
	return clearShot;
}

/** The longest single-target scan subsumes shorter scans because every single move hits nearer cells. */
function clearShotTargeting(actor: BattleFighter): readonly MoveTargeting[] {
	const art = EXTERNAL_ARTS[actor.externalArtId];
	const targetings: MoveTargeting[] = [];
	const seenTargeting = new Set<string>();
	let maximumSingleRange = 0;
	for (const slot of MOVE_SLOTS) {
		const targeting = MOVES[art.moves[slot]].targeting;
		if (targeting.shape === 'single') {
			maximumSingleRange = Math.max(maximumSingleRange, targeting.range);
			continue;
		}
		const key = targetingKey(targeting);
		if (!seenTargeting.has(key)) {
			seenTargeting.add(key);
			targetings.push(targeting);
		}
	}
	if (maximumSingleRange > 0) {
		return [{ shape: 'single', range: maximumSingleRange }, ...targetings];
	}
	return targetings;
}

/** Exact owned-move geometry without the qi gate, used for firing-range scoring. */
function hasClearShot(
	map: BattleMap,
	origin: Cell,
	hostileCell: Cell,
	targetings: readonly MoveTargeting[]
): boolean {
	for (const targeting of targetings) {
		for (const aim of legalAimCells(map, origin, targeting)) {
			const cells =
				targeting.shape === 'single' ? [aim] : affectedCells(map, origin, aim, targeting);
			if (cells.some((cell) => sameCell(cell, hostileCell))) {
				return true;
			}
		}
	}
	return false;
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
