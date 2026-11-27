import { arch, cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import {
	EXTERNAL_ARTS,
	applyBattleCommand,
	cellDistance,
	createBattle,
	getMoveTargets,
	getReachableCells,
	getTurnOrder,
	planBattleTurn,
	type BattleAiProfile,
	type BattleCommand,
	type BattleCommandResult,
	type BattleFighter,
	type BattleSetup,
	type BattleState,
	type Cell,
	type ExternalArtId,
	type FighterSetup,
	type FighterTemplate,
	type InternalArtId,
	type MoveSlot
} from './index';
import { buildActorExcludedThreatMap } from './ai';
import { movementBudget } from './rules';

const ACTIVE_ID = 'hero-darts';
const FIXTURE_NAME = '16x16-mixed-terrain-willow-darts-budget-5';
const WARMUP_DECISIONS = 30;
const TIMED_DECISIONS = 50;
const FRAME_BUDGET_MS = 16.7;
const FINAL_FACING_COUNT = 4;
const MOVE_SLOTS: readonly MoveSlot[] = ['basic', 'technique', 'finisher'];
const GUARDING_ENEMY_IDS: readonly string[] = ['enemy-guard-sword', 'enemy-guard-stone'];
const MARKSMAN_PROFILE: BattleAiProfile = { archetype: 'marksman' };

const BENCHMARK_TERRAIN: readonly string[] = [
	'................',
	'..T......#......',
	'..T......#......',
	'....~~..........',
	'....~~..........',
	'...........T....',
	'....#...........',
	'....#.....~~....',
	'....#.....~~....',
	'...........T....',
	'..T......#......',
	'..T......#......',
	'....~~..........',
	'....~~..........',
	'........#.......',
	'................'
];

type BenchmarkFixture = {
	state: BattleState;
	activeId: string;
	profile: BattleAiProfile;
};

type FixtureAnalysis = {
	reachableCells: number;
	positionCandidates: number;
	actionCandidates: number;
	scoredCandidates: number;
	targetableGuardingEnemies: string[];
};

type EnumeratedAction = {
	command: BattleCommand;
	targetIds: readonly string[];
};

function template(
	externalArtId: ExternalArtId,
	internalArtId: InternalArtId,
	agility: number,
	power = 9
): FighterTemplate {
	return {
		maxHealth: 100,
		power,
		agility,
		externalArtId,
		internalArtId
	};
}

function placement(
	id: string,
	side: 'squad' | 'enemy',
	cell: Cell,
	facing: 'N' | 'E' | 'S' | 'W',
	fighterTemplate: FighterTemplate
): FighterSetup {
	return { id, side, template: fighterTemplate, cell, facing };
}

/**
 * The benchmark state is a plausible mid-turn board: two melee enemies have already chosen Guard,
 * while every fighter is otherwise at the resources created by the public setup API.
 */
function benchmarkSetup(): BattleSetup {
	return {
		terrain: BENCHMARK_TERRAIN,
		fighters: [
			placement(
				ACTIVE_ID,
				'squad',
				{ x: 5, z: 7 },
				'E',
				template('willow_darts', 'flowing_cloud_steps', 20, 10)
			),
			placement(
				'ally-sword',
				'squad',
				{ x: 3, z: 7 },
				'E',
				template('sect_sword_form', 'sect_breathing', 12)
			),
			placement(
				'ally-stone',
				'squad',
				{ x: 5, z: 9 },
				'E',
				template('stone_palm', 'iron_body', 10, 10)
			),
			placement(
				'ally-staff',
				'squad',
				{ x: 3, z: 8 },
				'E',
				template('monk_staff', 'sect_breathing', 11)
			),
			placement(
				'ally-swift-sword',
				'squad',
				{ x: 2, z: 6 },
				'E',
				template('sect_sword_form', 'flowing_cloud_steps', 16)
			),
			placement(
				'ally-darts',
				'squad',
				{ x: 2, z: 8 },
				'E',
				template('willow_darts', 'sect_breathing', 14)
			),
			placement(
				'enemy-guard-sword',
				'enemy',
				{ x: 8, z: 7 },
				'W',
				template('sect_sword_form', 'iron_body', 12, 10)
			),
			placement(
				'enemy-guard-stone',
				'enemy',
				{ x: 8, z: 8 },
				'W',
				template('stone_palm', 'iron_body', 10, 11)
			),
			placement(
				'enemy-staff',
				'enemy',
				{ x: 9, z: 6 },
				'W',
				template('monk_staff', 'sect_breathing', 11)
			),
			placement(
				'enemy-darts',
				'enemy',
				{ x: 9, z: 8 },
				'W',
				template('willow_darts', 'flowing_cloud_steps', 16)
			),
			placement(
				'enemy-sword',
				'enemy',
				{ x: 9, z: 7 },
				'W',
				template('sect_sword_form', 'sect_breathing', 13)
			),
			placement(
				'enemy-stone',
				'enemy',
				{ x: 7, z: 9 },
				'W',
				template('stone_palm', 'iron_body', 9, 11)
			)
		],
		heroId: ACTIVE_ID,
		squadBag: {}
	};
}

function createBenchmarkFixture(): BenchmarkFixture {
	const created = createBattle(benchmarkSetup());
	const guarding = new Set(GUARDING_ENEMY_IDS);
	const state: BattleState = {
		...created.state,
		fighters: created.state.fighters.map((fighter) =>
			guarding.has(fighter.id) ? { ...fighter, guarding: true } : fighter
		)
	};
	const activeId = getTurnOrder(state).activeId;
	if (activeId !== ACTIVE_ID) {
		throw new Error(`benchmark fixture active fighter is ${String(activeId)}, not ${ACTIVE_ID}`);
	}
	return { state, activeId, profile: MARKSMAN_PROFILE };
}

function fighterIn(state: BattleState, fighterId: string): BattleFighter {
	const fighter = state.fighters.find((candidate) => candidate.id === fighterId);
	if (!fighter) {
		throw new Error(`unknown fighter: ${fighterId}`);
	}
	return fighter;
}

function accept(result: BattleCommandResult): BattleState {
	if (!result.accepted) {
		throw new Error(`expected an accepted command, got ${result.reason}`);
	}
	return result.state;
}

function replayCommands(state: BattleState, commands: readonly BattleCommand[]): BattleState {
	let current = state;
	for (const command of commands) {
		current = accept(applyBattleCommand(current, command));
	}
	return current;
}

function enumeratePositionStates(state: BattleState, activeId: string): BattleState[] {
	const actor = fighterIn(state, activeId);
	const positions: BattleState[] = [state];
	for (const entry of getReachableCells(state)) {
		if (entry.cell.x === actor.cell.x && entry.cell.z === actor.cell.z) {
			continue;
		}
		positions.push(
			accept(
				applyBattleCommand(state, {
					type: 'move',
					actorId: activeId,
					cell: { x: entry.cell.x, z: entry.cell.z }
				})
			)
		);
	}
	return positions;
}

function enumerateActions(state: BattleState, activeId: string): EnumeratedAction[] {
	const actor = fighterIn(state, activeId);
	const actions: EnumeratedAction[] = [];
	for (const slot of MOVE_SLOTS) {
		const moveId = EXTERNAL_ARTS[actor.externalArtId].moves[slot];
		for (const target of getMoveTargets(state, moveId)) {
			actions.push({
				command: {
					type: 'useMove',
					actorId: activeId,
					moveId,
					aim: { x: target.aim.x, z: target.aim.z }
				},
				targetIds: [...target.targetIds]
			});
		}
	}
	actions.push({ command: { type: 'guard', actorId: activeId }, targetIds: [] });
	actions.push({ command: { type: 'gatherQi', actorId: activeId }, targetIds: [] });
	return actions;
}

/**
 * Rebuilds the public candidate scan outside the timed region. A scored candidate is one action at
 * one position with one final facing; actions that end the battle or hand off early score one
 * terminal/auto-handoff candidate instead of the four final-facing variants.
 */
function analyzeFixture(state: BattleState, activeId: string): FixtureAnalysis {
	const reachableCells = getReachableCells(state).length;
	const positions = enumeratePositionStates(state, activeId);
	const guarding = new Set(GUARDING_ENEMY_IDS);
	const targetableGuarding = new Set<string>();
	let actionCandidates = 0;
	let scoredCandidates = 0;

	for (const position of positions) {
		const actions = enumerateActions(position, activeId);
		actionCandidates += actions.length;
		for (const action of actions) {
			for (const targetId of action.targetIds) {
				if (guarding.has(targetId)) {
					targetableGuarding.add(targetId);
				}
			}
			const actionState = accept(applyBattleCommand(position, action.command));
			const actorAfter = fighterIn(actionState, activeId);
			const endTurn: BattleCommand = {
				type: 'endTurn',
				actorId: activeId,
				facing: actorAfter.facing
			};
			scoredCandidates += applyBattleCommand(actionState, endTurn).accepted
				? FINAL_FACING_COUNT
				: 1;
		}
	}

	return {
		reachableCells,
		positionCandidates: positions.length,
		actionCandidates,
		scoredCandidates,
		targetableGuardingEnemies: [...targetableGuarding].sort()
	};
}

function nearestRankPercentile(samples: readonly number[], percentile: number): number {
	if (samples.length === 0) {
		throw new Error('cannot percentile an empty timing sample');
	}
	const sorted = [...samples].sort((left, right) => left - right);
	const index = Math.min(
		sorted.length - 1,
		Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1)
	);
	return sorted[index];
}

function median(samples: readonly number[]): number {
	if (samples.length === 0) {
		throw new Error('cannot median an empty timing sample');
	}
	const sorted = [...samples].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 1) {
		return sorted[middle];
	}
	return (sorted[middle - 1] + sorted[middle]) / 2;
}

function hostDescription(): string {
	const processors = cpus();
	const first = processors[0];
	const model = first ? first.model.trim() : 'unknown CPU';
	return `${model}, ${processors.length} logical CPUs, ${platform()} ${release()} ${arch()}`;
}

function runtimeDescription(): string {
	if (process.versions.bun) {
		return `Bun ${process.versions.bun} (${process.execPath})`;
	}
	return `Node ${process.version} (${process.execPath})`;
}

function cellKey(cell: Cell): string {
	return `${cell.x},${cell.z}`;
}

describe('representative battle AI frame benchmark', () => {
	it('plans one legal turn on the representative fixture without timing loops', () => {
		const fixture = createBenchmarkFixture();
		const actor = fighterIn(fixture.state, fixture.activeId);
		const terrainKinds = new Set(fixture.state.map.terrain.flat());
		const livingSquad = fixture.state.fighters.filter(
			(fighter) => fighter.side === 'squad' && fighter.health > 0
		).length;
		const livingEnemies = fixture.state.fighters.filter(
			(fighter) => fighter.side === 'enemy' && fighter.health > 0
		).length;
		const threatMap = buildActorExcludedThreatMap(fixture.state, actor);
		const threateningEnemyIds = fixture.state.fighters
			.filter((fighter) => fighter.side === 'enemy' && fighter.health > 0)
			.filter((fighter) => {
				const origins = threatMap.get(fighter.id)?.get(cellKey(actor.cell));
				return origins !== undefined && origins.length > 0;
			})
			.map((fighter) => fighter.id);
		const threateningGuards = threateningEnemyIds.filter((fighterId) =>
			GUARDING_ENEMY_IDS.includes(fighterId)
		);

		expect(fixture.state.map.width).toBe(16);
		expect(fixture.state.map.height).toBe(16);
		expect(terrainKinds.has('ground')).toBe(true);
		expect(terrainKinds.has('obstacle')).toBe(true);
		expect(terrainKinds.has('water')).toBe(true);
		expect(terrainKinds.has('bamboo')).toBe(true);
		expect(livingSquad).toBe(6);
		expect(livingEnemies).toBe(6);
		expect(actor.externalArtId).toBe('willow_darts');
		expect(movementBudget(actor)).toBe(5);
		expect(threateningEnemyIds.length).toBeGreaterThanOrEqual(3);
		expect(threateningGuards.length).toBeGreaterThanOrEqual(2);
		for (const fighterId of GUARDING_ENEMY_IDS) {
			const guard = fighterIn(fixture.state, fighterId);
			expect(guard.guarding).toBe(true);
			expect(cellDistance(actor.cell, guard.cell)).toBeLessThanOrEqual(movementBudget(actor) + 4);
		}

		const commands = planBattleTurn(fixture.state, fixture.activeId, fixture.profile);

		expect(commands.length).toBeGreaterThan(0);
		expect(commands.every((command) => command.actorId === fixture.activeId)).toBe(true);
		const replayed = replayCommands(fixture.state, commands);
		expect(getTurnOrder(replayed).activeId).not.toBe(fixture.activeId);
	});

	it.runIf(process.env.RUN_AI_BENCH === '1')(
		'keeps warmed planner p95 within one 60 Hz frame',
		() => {
			const fixture = createBenchmarkFixture();
			const analysis = analyzeFixture(fixture.state, fixture.activeId);
			let warmupCommands: BattleCommand[] = [];
			for (let iteration = 0; iteration < WARMUP_DECISIONS; iteration++) {
				warmupCommands = planBattleTurn(fixture.state, fixture.activeId, fixture.profile);
			}

			const samples: number[] = [];
			const cpuSamples: number[] = [];
			const plannedCommands: BattleCommand[][] = [];
			for (let iteration = 0; iteration < TIMED_DECISIONS; iteration++) {
				const started = performance.now();
				const cpuStarted = process.cpuUsage();
				const commands = planBattleTurn(fixture.state, fixture.activeId, fixture.profile);
				const cpuEnded = process.cpuUsage(cpuStarted);
				const elapsed = performance.now() - started;
				samples.push(elapsed);
				cpuSamples.push((cpuEnded.user + cpuEnded.system) / 1000);
				plannedCommands.push(commands);
			}

			replayCommands(fixture.state, warmupCommands);
			for (const commands of plannedCommands) {
				expect(commands.length).toBeGreaterThan(0);
				replayCommands(fixture.state, commands);
			}

			const milliseconds = {
				median: median(samples),
				p95: nearestRankPercentile(samples, 95),
				max: Math.max(...samples)
			};
			const cpuMilliseconds = {
				median: median(cpuSamples),
				p95: nearestRankPercentile(cpuSamples, 95),
				max: Math.max(...cpuSamples)
			};
			const report = {
				fixture: {
					name: FIXTURE_NAME,
					map: '16x16 ground/obstacle/water/bamboo',
					livingFighters: { squad: 6, enemy: 6 },
					activeFighter: fixture.activeId,
					externalArt: 'willow_darts',
					movementBudget: 5,
					profile: fixture.profile
				},
				counts: analysis,
				warmupDecisions: WARMUP_DECISIONS,
				timedDecisions: TIMED_DECISIONS,
				timing: 'monotonic elapsed milliseconds per synchronous decision',
				milliseconds,
				cpuMilliseconds,
				host: hostDescription(),
				runtime: runtimeDescription()
			};
			console.info(`AI benchmark ${JSON.stringify(report)}`);

			expect(analysis.reachableCells).toBe(analysis.positionCandidates);
			expect(analysis.actionCandidates).toBeGreaterThan(0);
			expect(analysis.targetableGuardingEnemies.length).toBeGreaterThanOrEqual(2);
			expect(milliseconds.p95).toBeLessThanOrEqual(FRAME_BUDGET_MS);
		},
		30_000
	);
});
