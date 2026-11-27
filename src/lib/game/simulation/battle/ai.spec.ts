import { describe, expect, it } from 'vitest';
import {
	AI_ARCHETYPES,
	AI_SHARED_WEIGHTS,
	applyBattleCommand,
	cellDistance,
	createBattle,
	getMoveTargets,
	getReachableCells,
	getTurnOrder,
	planBattleTurn,
	SECT_HERO_TEMPLATE,
	SENIOR_BROTHER_LU_TEMPLATE,
	STARTER_BATTLE_TERRAIN,
	type AiArchetypeId,
	type AiArchetypeWeights,
	type BattleAiProfile,
	type BattleCommand,
	type BattleCommandResult,
	type BattleEvent,
	type BattleFighter,
	type BattleSetup,
	type BattleState,
	type Cell,
	type Facing,
	type FighterSetup,
	type FighterTemplate
} from './index';
import { buildActorExcludedThreatMap } from './ai';
import { facingPercentFor, movementBudget } from './rules';

const OPEN_ROWS = ['.....', '.....', '.....', '.....', '.....'];
const POST_ROWS = ['.....', '.#T..', '.~...', '.....', '.....'];

const AGGRESSOR: BattleAiProfile = { archetype: 'aggressor' };

type PlacementOptions = {
	side?: 'squad' | 'enemy';
	template?: Partial<FighterTemplate>;
	facing?: Facing;
};

function placement(id: string, cell: Cell, options: PlacementOptions = {}): FighterSetup {
	return {
		id,
		side: options.side ?? 'squad',
		template: { ...SECT_HERO_TEMPLATE, ...options.template },
		cell,
		facing: options.facing ?? 'N'
	};
}

function luTemplate(overrides: Partial<FighterTemplate> = {}): Partial<FighterTemplate> {
	return { ...SENIOR_BROTHER_LU_TEMPLATE, ...overrides };
}

function setup(fighters: FighterSetup[], overrides: Partial<BattleSetup> = {}): BattleSetup {
	return { terrain: [...OPEN_ROWS], fighters, heroId: 'hero', ...overrides };
}

function starter(heroCell: Cell = { x: 0, z: 0 }, luCell: Cell = { x: 4, z: 4 }): BattleSetup {
	return setup([
		placement('hero', heroCell, { facing: 'E' }),
		placement('lu', luCell, { side: 'enemy', template: luTemplate(), facing: 'W' })
	]);
}

function battleState(battleSetup: BattleSetup): BattleState {
	return createBattle(battleSetup).state;
}

function accept(result: BattleCommandResult): { state: BattleState; events: BattleEvent[] } {
	if (!result.accepted) {
		throw new Error(`expected an accepted command, got ${result.reason}`);
	}
	return result;
}

function fighter(state: BattleState, id: string): BattleFighter {
	const found = state.fighters.find((candidate) => candidate.id === id);
	if (!found) {
		throw new Error(`unknown fighter: ${id}`);
	}
	return found;
}

function patchFighter(state: BattleState, id: string, patch: Partial<BattleFighter>): BattleState {
	return {
		...state,
		fighters: state.fighters.map((combatant) =>
			combatant.id === id ? { ...combatant, ...patch } : combatant
		)
	};
}

function replayCommands(
	state: BattleState,
	commands: BattleCommand[]
): { state: BattleState; events: BattleEvent[] } {
	let current = state;
	const events: BattleEvent[] = [];
	for (const command of commands) {
		const result = applyBattleCommand(current, command);
		if (!result.accepted) {
			throw new Error(`planned ${command.type} was rejected: ${result.reason}`);
		}
		events.push(...result.events);
		current = result.state;
	}
	return { state: current, events };
}

function profileFromJson(json: string): BattleAiProfile {
	return JSON.parse(json);
}

function deepFreeze<T>(value: T): T {
	if (typeof value === 'object' && value !== null) {
		for (const nested of Object.values(value)) {
			deepFreeze(nested);
		}
		Object.freeze(value);
	}
	return value;
}

function movedState(initial: BattleState, actorId: string, destination: Cell): BattleState {
	return accept(applyBattleCommand(initial, { type: 'move', actorId, cell: destination })).state;
}

function willowTemplate(overrides: Partial<FighterTemplate> = {}): Partial<FighterTemplate> {
	return {
		...SECT_HERO_TEMPLATE,
		externalArtId: 'willow_darts',
		internalArtId: 'flowing_cloud_steps',
		...overrides
	};
}

function openRows(size: number): string[] {
	return Array.from({ length: size }, () => '.'.repeat(size));
}

function moveIn(commands: BattleCommand[]): Extract<BattleCommand, { type: 'move' }> {
	const command = commands.find((candidate) => candidate.type === 'move');
	if (!command || command.type !== 'move') {
		throw new Error('planner did not return a move command');
	}
	return command;
}

function useMoveIn(commands: BattleCommand[]): Extract<BattleCommand, { type: 'useMove' }> {
	const command = commands.find((candidate) => candidate.type === 'useMove');
	if (!command || command.type !== 'useMove') {
		throw new Error('planner did not return a useMove command');
	}
	return command;
}

function endTurnIn(commands: BattleCommand[]): Extract<BattleCommand, { type: 'endTurn' }> {
	const command = commands.find((candidate) => candidate.type === 'endTurn');
	if (!command || command.type !== 'endTurn') {
		throw new Error('planner did not return an endTurn command');
	}
	return command;
}

function cellKey(cell: Cell): string {
	return `${cell.x},${cell.z}`;
}

function threatOrigins(
	threats: ReturnType<typeof buildActorExcludedThreatMap>,
	hostileId: string,
	cell: Cell
): Cell[] | undefined {
	return threats.get(hostileId)?.get(cellKey(cell));
}

function threateningCount(
	threats: ReturnType<typeof buildActorExcludedThreatMap>,
	cell: Cell
): number {
	let count = 0;
	for (const originsByCell of threats.values()) {
		const origins = originsByCell.get(cellKey(cell));
		if (origins && origins.length > 0) {
			count += 1;
		}
	}
	return count;
}

describe('public AI contract and catalogs', () => {
	it('exports the planner, shared weights, archetype ids and weight records through the barrel', () => {
		const archetype: AiArchetypeId = 'guardian';
		const profile: BattleAiProfile = { archetype, post: { x: 1, z: 1 } };
		const weights: AiArchetypeWeights = AI_ARCHETYPES[archetype];

		expect(typeof planBattleTurn).toBe('function');
		expect(profile.post).toEqual({ x: 1, z: 1 });
		expect(weights.preferredRange).toBe(1);
		expect(Object.keys(AI_ARCHETYPES).sort()).toEqual(['aggressor', 'guardian', 'marksman']);
		expect(AI_SHARED_WEIGHTS).toEqual({
			damage: 100,
			defeat: 3500,
			selfDefeat: -10000,
			qiSpent: -10
		});
	});

	it('deep-freezes both AI weight catalogs', () => {
		expect(Object.isFrozen(AI_SHARED_WEIGHTS)).toBe(true);
		expect(Object.isFrozen(AI_ARCHETYPES)).toBe(true);
		for (const weights of Object.values(AI_ARCHETYPES)) {
			expect(Object.isFrozen(weights)).toBe(true);
		}
	});
});

describe('profile validation before actor short-circuits', () => {
	it('rejects missing, malformed and unknown-archetype profiles', () => {
		const state = battleState(starter());

		for (const profile of [
			profileFromJson('null'),
			profileFromJson('{}'),
			profileFromJson('{"archetype":"duelist"}'),
			profileFromJson('{"archetype":"constructor"}')
		]) {
			expect(() => planBattleTurn(state, 'hero', profile)).toThrow(/battle AI profile/);
		}
	});

	it('rejects missing, fractional, out-of-bounds, water and obstacle Guardian posts', () => {
		const state = battleState(
			setup(
				[
					placement('hero', { x: 0, z: 0 }, { facing: 'E' }),
					placement(
						'lu',
						{ x: 4, z: 4 },
						{
							side: 'enemy',
							template: luTemplate(),
							facing: 'W'
						}
					)
				],
				{ terrain: [...POST_ROWS] }
			)
		);
		const invalidPosts = [
			'{"archetype":"guardian"}',
			'{"archetype":"guardian","post":null}',
			'{"archetype":"guardian","post":{"x":1.5,"z":1}}',
			'{"archetype":"guardian","post":{"x":-1,"z":1}}',
			'{"archetype":"guardian","post":{"x":5,"z":1}}',
			'{"archetype":"guardian","post":{"x":1,"z":2}}',
			'{"archetype":"guardian","post":{"x":1,"z":1}}'
		];

		for (const json of invalidPosts) {
			expect(() => planBattleTurn(state, 'hero', profileFromJson(json))).toThrow(/guardian post/i);
		}
	});

	it('accepts occupied ground and bamboo Guardian posts', () => {
		const state = battleState(
			setup(
				[
					placement('hero', { x: 0, z: 0 }, { facing: 'E' }),
					placement(
						'lu',
						{ x: 2, z: 1 },
						{
							side: 'enemy',
							template: luTemplate(),
							facing: 'W'
						}
					)
				],
				{ terrain: [...POST_ROWS] }
			)
		);

		for (const post of [
			{ x: 2, z: 1 },
			{ x: 0, z: 0 }
		]) {
			const commands = planBattleTurn(state, 'hero', { archetype: 'guardian', post });
			expect(commands.length).toBeGreaterThan(0);
			replayCommands(state, commands);
		}
	});

	it('validates before terminal, inactive, dead or unknown-actor empty results', () => {
		const state = battleState(starter());
		const terminal: BattleState = { ...state, outcome: 'victory' };
		const deadHero = patchFighter(state, 'hero', { health: 0 });
		const invalid = profileFromJson('{"archetype":"intruder"}');

		const shortCircuits: { candidateState: BattleState; actorId: string }[] = [
			{ candidateState: terminal, actorId: 'hero' },
			{ candidateState: state, actorId: 'lu' },
			{ candidateState: deadHero, actorId: 'hero' },
			{ candidateState: state, actorId: 'missing' }
		];
		for (const { candidateState, actorId } of shortCircuits) {
			expect(() => planBattleTurn(candidateState, actorId, invalid)).toThrow(/archetype/);
		}

		expect(planBattleTurn(terminal, 'hero', AGGRESSOR)).toEqual([]);
		expect(planBattleTurn(state, 'lu', AGGRESSOR)).toEqual([]);
		expect(planBattleTurn(deadHero, 'hero', AGGRESSOR)).toEqual([]);
		expect(planBattleTurn(state, 'missing', AGGRESSOR)).toEqual([]);
	});
});

describe('shared facing classification', () => {
	it('classifies front, side, rear and diagonal ties for all four facings', () => {
		const target = { x: 2, z: 2 };
		const cases: {
			facing: Facing;
			front: Cell;
			rear: Cell;
			side: Cell;
			diagonal: Cell;
		}[] = [
			{
				facing: 'N',
				front: { x: 2, z: 1 },
				rear: { x: 2, z: 3 },
				side: { x: 3, z: 2 },
				diagonal: { x: 3, z: 1 }
			},
			{
				facing: 'E',
				front: { x: 3, z: 2 },
				rear: { x: 1, z: 2 },
				side: { x: 2, z: 3 },
				diagonal: { x: 3, z: 3 }
			},
			{
				facing: 'S',
				front: { x: 2, z: 3 },
				rear: { x: 2, z: 1 },
				side: { x: 3, z: 2 },
				diagonal: { x: 3, z: 3 }
			},
			{
				facing: 'W',
				front: { x: 1, z: 2 },
				rear: { x: 3, z: 2 },
				side: { x: 2, z: 3 },
				diagonal: { x: 1, z: 3 }
			}
		];

		for (const expected of cases) {
			expect(facingPercentFor(target, expected.facing, expected.front)).toBe(100);
			expect(facingPercentFor(target, expected.facing, expected.side)).toBe(125);
			expect(facingPercentFor(target, expected.facing, expected.rear)).toBe(150);
			expect(facingPercentFor(target, expected.facing, expected.diagonal)).toBe(125);
		}
	});
});

describe('actor-excluded threat geometry', () => {
	it('registers the documented reach-through origin and is invariant to the actor move', () => {
		const rows = Array.from({ length: 5 }, () => '........');
		const created = battleState(
			setup(
				[
					placement('hero', { x: 3, z: 2 }, { template: willowTemplate(), facing: 'E' }),
					placement(
						'lu',
						{ x: 2, z: 2 },
						{ side: 'enemy', template: luTemplate({ agility: 10 }), facing: 'E' }
					)
				],
				{ terrain: rows }
			)
		);
		const state = patchFighter(created, 'lu', { qi: 0 });

		expect(movementBudget(fighter(state, 'lu'))).toBe(3);
		const before = buildActorExcludedThreatMap(state, fighter(state, 'hero'));
		expect(threatOrigins(before, 'lu', { x: 6, z: 2 })).toEqual([{ x: 5, z: 2 }]);

		const moved = movedState(state, 'hero', { x: 3, z: 3 });
		const after = buildActorExcludedThreatMap(moved, fighter(moved, 'hero'));
		expect(after).toStrictEqual(before);
	});

	it('uses capped next-turn qi when deciding which hostile moves threaten cells', () => {
		const rows = Array.from({ length: 5 }, () => '........');
		const created = battleState(
			setup(
				[
					placement('hero', { x: 3, z: 2 }, { template: willowTemplate(), facing: 'E' }),
					placement(
						'lu',
						{ x: 2, z: 2 },
						{ side: 'enemy', template: luTemplate({ agility: 10 }), facing: 'E' }
					)
				],
				{ terrain: rows }
			)
		);

		const unavailable = patchFighter(created, 'lu', { qi: 14 });
		const unavailableOrigins = threatOrigins(
			buildActorExcludedThreatMap(unavailable, fighter(unavailable, 'hero')),
			'lu',
			{ x: 6, z: 2 }
		);
		const available = patchFighter(created, 'lu', { qi: 15 });
		const availableOrigins = threatOrigins(
			buildActorExcludedThreatMap(available, fighter(available, 'hero')),
			'lu',
			{ x: 6, z: 2 }
		);

		expect(unavailableOrigins ?? []).not.toContainEqual({ x: 4, z: 2 });
		expect(availableOrigins).toContainEqual({ x: 4, z: 2 });
		expect(availableOrigins).toContainEqual({ x: 5, z: 2 });
	});

	it('keeps other living fighters as blockers in the approximate threat paths', () => {
		const rows = Array.from({ length: 5 }, () => '........');
		const created = battleState(
			setup(
				[
					placement('hero', { x: 3, z: 2 }, { template: willowTemplate(), facing: 'E' }),
					placement(
						'lu',
						{ x: 2, z: 2 },
						{ side: 'enemy', template: luTemplate({ agility: 10 }), facing: 'E' }
					),
					placement('ally', { x: 4, z: 2 }, { facing: 'N' })
				],
				{ terrain: rows }
			)
		);
		const state = patchFighter(created, 'lu', { qi: 0 });

		const threats = buildActorExcludedThreatMap(state, fighter(state, 'hero'));

		expect(threatOrigins(threats, 'lu', { x: 6, z: 2 })).toBeUndefined();
	});

	it('uses bamboo movement cost when collecting threat origins', () => {
		const rows = ['.......', '.......', '..T....', '.......', '.......'];
		const created = battleState(
			setup(
				[
					placement('hero', { x: 0, z: 0 }, { facing: 'E' }),
					placement(
						'lu',
						{ x: 1, z: 2 },
						{ side: 'enemy', template: luTemplate({ agility: 10 }), facing: 'E' }
					)
				],
				{ terrain: rows }
			)
		);
		const state = patchFighter(created, 'lu', { qi: 0 });

		const threats = buildActorExcludedThreatMap(state, fighter(state, 'hero'));

		expect(threatOrigins(threats, 'lu', { x: 4, z: 2 })).toContainEqual({ x: 3, z: 2 });
		expect(threatOrigins(threats, 'lu', { x: 5, z: 2 })).toBeUndefined();
	});

	it('lets threat rays cross water and bamboo but not an obstacle', () => {
		const waterAndBambooRows = ['......', '.~T...', '......'];
		const obstacleRows = ['......', '.#....', '......'];
		const buildDartThreats = (rows: string[]): ReturnType<typeof buildActorExcludedThreatMap> => {
			const state = battleState(
				setup(
					[
						placement('hero', { x: 0, z: 2 }, { facing: 'N' }),
						placement(
							'dart',
							{ x: 0, z: 1 },
							{ side: 'enemy', template: willowTemplate({ agility: 1 }), facing: 'S' }
						)
					],
					{ terrain: rows }
				)
			);
			return buildActorExcludedThreatMap(state, fighter(state, 'hero'));
		};

		const openOrigins = threatOrigins(buildDartThreats(waterAndBambooRows), 'dart', {
			x: 3,
			z: 1
		});
		const blockedOrigins = threatOrigins(buildDartThreats(obstacleRows), 'dart', { x: 3, z: 1 });

		expect(openOrigins).toContainEqual({ x: 0, z: 1 });
		expect(blockedOrigins ?? []).not.toContainEqual({ x: 0, z: 1 });
	});

	it('records unique origins per hostile and distinct threat counts per cell', () => {
		const created = battleState(
			setup([
				placement('hero', { x: 2, z: 2 }, { facing: 'N' }),
				placement(
					'north',
					{ x: 2, z: 0 },
					{ side: 'enemy', template: luTemplate({ agility: 10 }), facing: 'S' }
				),
				placement(
					'west',
					{ x: 0, z: 2 },
					{ side: 'enemy', template: luTemplate({ agility: 10 }), facing: 'E' }
				)
			])
		);
		const lowQi = patchFighter(patchFighter(created, 'north', { qi: 0 }), 'west', { qi: 0 });

		const lowQiThreats = buildActorExcludedThreatMap(lowQi, fighter(lowQi, 'hero'));
		expect(threateningCount(lowQiThreats, { x: 2, z: 2 })).toBe(2);
		expect(threateningCount(lowQiThreats, { x: 4, z: 0 })).toBe(1);

		const fullQiThreats = buildActorExcludedThreatMap(created, fighter(created, 'hero'));
		const origins = threatOrigins(fullQiThreats, 'north', { x: 2, z: 1 }) ?? [];
		expect(
			origins.filter((origin) => origin.x === 2 && origin.z === 0),
			'the origin is recorded once even when sword, line and arc all cover the cell'
		).toHaveLength(1);
	});

	it('planner scoring treats several origins from one hostile as one threat', () => {
		const post = { x: 2, z: 4 };
		const state = battleState(
			setup(
				[
					placement('hero', post, { facing: 'E' }),
					placement('lu', { x: 2, z: 1 }, { side: 'enemy', template: luTemplate(), facing: 'S' })
				],
				{ terrain: openRows(9) }
			)
		);
		const threats = buildActorExcludedThreatMap(state, fighter(state, 'hero'));

		expect(threatOrigins(threats, 'lu', { x: 2, z: 2 })?.length).toBeGreaterThan(1);

		const commands = planBattleTurn(state, 'hero', { archetype: 'guardian', post });

		// Counting each origin separately adds enough penalty to make the Guardian abandon this attack.
		expect(moveIn(commands).cell).toEqual({ x: 2, z: 2 });
		expect(useMoveIn(commands).moveId).toBe('cloud_sweep');
		replayCommands(state, commands);
	});
});

describe('turn phase handling', () => {
	it('does not plan another move after the actor has moved', () => {
		const rows = Array.from({ length: 12 }, () => '............');
		const state = battleState(
			setup(
				[
					placement('hero', { x: 1, z: 6 }, { facing: 'E' }),
					placement(
						'lu',
						{ x: 10, z: 6 },
						{
							side: 'enemy',
							template: luTemplate(),
							facing: 'W'
						}
					)
				],
				{ terrain: rows }
			)
		);
		const moved = movedState(state, 'hero', { x: 2, z: 6 });

		const commands = planBattleTurn(moved, 'hero', AGGRESSOR);

		expect(commands.some((command) => command.type === 'move')).toBe(false);
		expect(commands.some((command) => command.type === 'guard')).toBe(true);
		replayCommands(moved, commands);
	});

	it('plans only endTurn after the actor has acted', () => {
		const state = battleState(starter());
		const acted = accept(applyBattleCommand(state, { type: 'guard', actorId: 'hero' })).state;

		const commands = planBattleTurn(acted, 'hero', AGGRESSOR);

		expect(commands).toHaveLength(1);
		expect(commands[0]).toMatchObject({ type: 'endTurn', actorId: 'hero' });
		replayCommands(acted, commands);
	});
});

describe('candidate enumeration and deterministic action choice', () => {
	it('keeps stay as a positional candidate instead of emitting a move command', () => {
		const rows = ['..#..', '...#.', '..#..', '.....', '.....'];
		const state = battleState(
			setup(
				[
					placement('hero', { x: 1, z: 1 }, { facing: 'E' }),
					placement(
						'lu',
						{ x: 2, z: 1 },
						{
							side: 'enemy',
							template: luTemplate(),
							facing: 'E'
						}
					)
				],
				{ terrain: rows }
			)
		);

		const commands = planBattleTurn(state, 'hero', AGGRESSOR);

		expect(commands.some((command) => command.type === 'move')).toBe(false);
		expect(commands.some((command) => command.type === 'useMove')).toBe(true);
		replayCommands(state, commands);
	});

	it('enumerates the technique slot and uses its returned line aim after movement', () => {
		const initial = battleState(starter({ x: 0, z: 0 }, { x: 2, z: 1 }));
		const moved = movedState(initial, 'hero', { x: 0, z: 1 });

		const commands = planBattleTurn(moved, 'hero', AGGRESSOR);

		expect(commands[0]).toEqual({
			type: 'useMove',
			actorId: 'hero',
			moveId: 'piercing_thrust',
			aim: { x: 1, z: 1 }
		});
		expect(commands[1]?.type).toBe('endTurn');
		replayCommands(moved, commands);
	});

	it('keeps the first arc aim when later aims hit the same enemy', () => {
		const initial = battleState(starter({ x: 0, z: 0 }, { x: 2, z: 2 }));
		const moved = movedState(initial, 'hero', { x: 1, z: 1 });
		const targets = getMoveTargets(moved, 'cloud_sweep');

		expect(targets.map((target) => target.aim)).toEqual([
			{ x: 2, z: 1 },
			{ x: 1, z: 2 }
		]);
		expect(targets.map((target) => target.targetIds)).toEqual([['lu'], ['lu']]);

		const commands = planBattleTurn(moved, 'hero', AGGRESSOR);

		expect(commands[0]).toEqual({
			type: 'useMove',
			actorId: 'hero',
			moveId: 'cloud_sweep',
			aim: { x: 2, z: 1 }
		});
		expect(commands[1]?.type).toBe('endTurn');
		replayCommands(moved, commands);
	});

	it('chooses a later arc aim when it hits an additional enemy', () => {
		const rows = Array.from({ length: 5 }, () => '.....');
		const initial = battleState(
			setup(
				[
					placement('hero', { x: 1, z: 2 }, { facing: 'E' }),
					placement(
						'north',
						{ x: 1, z: 0 },
						{ side: 'enemy', template: luTemplate(), facing: 'S' }
					),
					placement('east', { x: 2, z: 1 }, { side: 'enemy', template: luTemplate(), facing: 'W' }),
					placement(
						'diagonal',
						{ x: 2, z: 2 },
						{ side: 'enemy', template: luTemplate(), facing: 'W' }
					)
				],
				{ terrain: rows }
			)
		);
		const moved = movedState(initial, 'hero', { x: 1, z: 1 });
		const targets = getMoveTargets(moved, 'cloud_sweep');

		expect(targets.map((target) => target.aim)).toEqual([
			{ x: 1, z: 0 },
			{ x: 2, z: 1 },
			{ x: 1, z: 2 }
		]);
		expect(targets.map((target) => target.targetIds)).toEqual([
			['north'],
			['east', 'diagonal'],
			['diagonal']
		]);

		const commands = planBattleTurn(moved, 'hero', AGGRESSOR);

		expect(commands[0]).toEqual({
			type: 'useMove',
			actorId: 'hero',
			moveId: 'cloud_sweep',
			aim: { x: 2, z: 1 }
		});
		expect(commands[1]?.type).toBe('endTurn');
		replayCommands(moved, commands);
	});

	it('does not enumerate qi-costing moves the actor cannot afford', () => {
		const initial = battleState(starter({ x: 0, z: 0 }, { x: 1, z: 1 }));
		const moved = movedState(initial, 'hero', { x: 0, z: 1 });
		const lowQi = patchFighter(moved, 'hero', { qi: 24 });

		const commands = planBattleTurn(lowQi, 'hero', AGGRESSOR);

		expect(commands[0]).toMatchObject({ type: 'useMove', moveId: 'sword_cut' });
		expect(commands.some((command) => command.type === 'useMove')).toBe(true);
		replayCommands(lowQi, commands);
	});

	it('uses weighted terrain and obstacles when choosing a legal approach cell', () => {
		const rows = ['.....', '.TTT.', '..#..', '.....', '.....'];
		const state = battleState(
			setup(
				[
					placement('hero', { x: 1, z: 2 }, { facing: 'E' }),
					placement(
						'lu',
						{ x: 3, z: 2 },
						{
							side: 'enemy',
							template: luTemplate(),
							facing: 'W'
						}
					)
				],
				{ terrain: rows }
			)
		);
		const reachable = getReachableCells(state);
		expect(reachable.some((entry) => entry.cell.x === 3 && entry.cell.z === 1)).toBe(false);
		expect(reachable.find((entry) => entry.cell.x === 3 && entry.cell.z === 3)?.cost).toBe(3);

		const commands = planBattleTurn(state, 'hero', AGGRESSOR);
		const move = commands.find((command) => command.type === 'move');

		expect(move).toMatchObject({ cell: { x: 3, z: 3 } });
		expect(commands.some((command) => command.type === 'useMove')).toBe(true);
		replayCommands(state, commands);
	});

	it('falls back to Guard when no attack is available from any reachable cell', () => {
		const rows = Array.from({ length: 12 }, () => '............');
		const state = battleState(
			setup(
				[
					placement('hero', { x: 1, z: 6 }, { facing: 'E' }),
					placement(
						'lu',
						{ x: 10, z: 6 },
						{
							side: 'enemy',
							template: luTemplate(),
							facing: 'W'
						}
					)
				],
				{ terrain: rows }
			)
		);

		const commands = planBattleTurn(state, 'hero', AGGRESSOR);

		expect(commands.some((command) => command.type === 'useMove')).toBe(false);
		expect(commands.some((command) => command.type === 'guard')).toBe(true);
		expect(commands.some((command) => command.type === 'move')).toBe(true);
		replayCommands(state, commands);
	});
});

describe('archetype scoring behavior', () => {
	it('closes in and attacks when movement brings an Aggressor into reach', () => {
		const state = battleState(
			setup(
				[
					placement('hero', { x: 1, z: 3 }, { facing: 'E' }),
					placement('lu', { x: 5, z: 3 }, { side: 'enemy', template: luTemplate(), facing: 'W' })
				],
				{ terrain: openRows(8) }
			)
		);

		const commands = planBattleTurn(state, 'hero', AGGRESSOR);
		const move = moveIn(commands);
		const attack = useMoveIn(commands);

		const startingDistance = cellDistance(fighter(state, 'hero').cell, fighter(state, 'lu').cell);
		expect(startingDistance).toBeGreaterThan(1);
		expect(cellDistance(move.cell, fighter(state, 'lu').cell)).toBeLessThan(startingDistance);
		expect(attack.actorId).toBe('hero');
		replayCommands(state, commands);
	});

	it('prefers the weaker of otherwise equal Aggressor targets', () => {
		const created = battleState(
			setup([
				placement(
					'hero',
					{ x: 2, z: 2 },
					{ template: { externalArtId: 'stone_palm' }, facing: 'E' }
				),
				placement('strong', { x: 2, z: 1 }, { side: 'enemy', template: luTemplate(), facing: 'W' }),
				placement('weak', { x: 2, z: 3 }, { side: 'enemy', template: luTemplate(), facing: 'W' })
			])
		);
		const weakened = patchFighter(created, 'weak', { health: 50 });
		const state: BattleState = { ...weakened, hasMoved: true };

		const commands = planBattleTurn(state, 'hero', AGGRESSOR);
		const attack = useMoveIn(commands);
		const replayed = replayCommands(state, commands);

		expect(attack.aim).toEqual(fighter(state, 'weak').cell);
		expect(
			replayed.events.filter((event) => event.type === 'damaged').map((event) => event.targetId)
		).toEqual(['weak']);
	});

	it('exploits a rear flank over an otherwise equal front target', () => {
		const created = battleState(
			setup([
				placement(
					'hero',
					{ x: 2, z: 2 },
					{ template: { externalArtId: 'stone_palm' }, facing: 'E' }
				),
				placement('front', { x: 2, z: 1 }, { side: 'enemy', template: luTemplate(), facing: 'S' }),
				placement('rear', { x: 2, z: 3 }, { side: 'enemy', template: luTemplate(), facing: 'S' })
			])
		);
		const state: BattleState = { ...created, hasMoved: true };

		const commands = planBattleTurn(state, 'hero', AGGRESSOR);
		const attack = useMoveIn(commands);

		expect(attack.aim).toEqual(fighter(state, 'rear').cell);
		replayCommands(state, commands);
	});

	it('moves a Marksman from adjacency to preferred standoff before shooting', () => {
		const rows = ['###.###', '###.###', '.......', '.......', '.......', '.......', '.......'];
		const state = battleState(
			setup(
				[
					placement('hero', { x: 3, z: 1 }, { template: willowTemplate(), facing: 'N' }),
					placement('lu', { x: 3, z: 0 }, { side: 'enemy', template: luTemplate(), facing: 'S' })
				],
				{ terrain: rows }
			)
		);

		const commands = planBattleTurn(state, 'hero', { archetype: 'marksman' });
		const move = moveIn(commands);
		useMoveIn(commands);

		expect(cellDistance(fighter(state, 'hero').cell, fighter(state, 'lu').cell)).toBe(1);
		expect(cellDistance(move.cell, fighter(state, 'lu').cell)).toBe(3);
		replayCommands(state, commands);
	});

	it('moves a Marksman into bamboo cover at standoff range', () => {
		const rows = ['###.###', '###.###', '.......', '...T...', '.......', '.......', '.......'];
		const state = battleState(
			setup(
				[
					placement('hero', { x: 3, z: 1 }, { template: willowTemplate(), facing: 'N' }),
					placement('lu', { x: 3, z: 0 }, { side: 'enemy', template: luTemplate(), facing: 'S' })
				],
				{ terrain: rows }
			)
		);

		const commands = planBattleTurn(state, 'hero', { archetype: 'marksman' });
		const move = moveIn(commands);

		expect(cellDistance(move.cell, fighter(state, 'lu').cell)).toBe(3);
		expect(state.map.terrain[move.cell.z][move.cell.x]).toBe('bamboo');
		replayCommands(state, commands);
	});

	it('breaks a Monk Staff Marksman mutual-Guard standoff when a sweep is reachable', () => {
		const created = battleState(
			setup(
				[
					placement(
						'hero',
						{ x: 2, z: 1 },
						{ template: { externalArtId: 'monk_staff' }, facing: 'S' }
					),
					placement(
						'lu',
						{ x: 2, z: 3 },
						{
							side: 'enemy',
							template: luTemplate({ externalArtId: 'monk_staff' }),
							facing: 'N'
						}
					)
				],
				{ terrain: STARTER_BATTLE_TERRAIN }
			)
		);
		const state = patchFighter(created, 'lu', { guarding: true });

		const commands = planBattleTurn(state, 'hero', { archetype: 'marksman' });

		expect(commands.some((command) => command.type === 'useMove')).toBe(true);
		replayCommands(state, commands);
	});

	it('keeps a Guardian on its authored post when no punishment is available', () => {
		const post = { x: 2, z: 2 };
		const state = battleState(
			setup(
				[
					placement('hero', post, { facing: 'E' }),
					placement('lu', { x: 9, z: 2 }, { side: 'enemy', template: luTemplate(), facing: 'W' })
				],
				{ terrain: openRows(10) }
			)
		);

		const commands = planBattleTurn(state, 'hero', { archetype: 'guardian', post });

		expect(commands.some((command) => command.type === 'move')).toBe(false);
		replayCommands(state, commands);
	});

	it('guards a threatened fixed post but gathers there without a threat', () => {
		const post = { x: 2, z: 2 };
		const fixedState = (enemyX: number): BattleState => {
			const created = battleState(
				setup(
					[
						placement('hero', post, { facing: 'E' }),
						placement(
							'dart',
							{ x: enemyX, z: 2 },
							{ side: 'enemy', template: willowTemplate({ agility: 1 }), facing: 'W' }
						)
					],
					{ terrain: openRows(10) }
				)
			);
			const lowQi = patchFighter(patchFighter(created, 'hero', { qi: 99 }), 'dart', { qi: 0 });
			return { ...lowQi, hasMoved: true };
		};
		const profile: BattleAiProfile = { archetype: 'guardian', post };

		const threatenedState = fixedState(8);
		expect(
			threatOrigins(
				buildActorExcludedThreatMap(threatenedState, fighter(threatenedState, 'hero')),
				'dart',
				post
			)
		).toBeDefined();
		const threatenedCommands = planBattleTurn(threatenedState, 'hero', profile);
		const threatenedReplay = replayCommands(threatenedState, threatenedCommands);

		expect(threatenedCommands.map((command) => command.type)).toEqual(['guard', 'endTurn']);
		expect(fighter(threatenedReplay.state, 'hero').cell).toEqual(post);

		const clearState = fixedState(9);
		expect(
			threatOrigins(
				buildActorExcludedThreatMap(clearState, fighter(clearState, 'hero')),
				'dart',
				post
			)
		).toBeUndefined();
		const clearCommands = planBattleTurn(clearState, 'hero', profile);
		const clearReplay = replayCommands(clearState, clearCommands);
		const gathered = clearReplay.events.find((event) => event.type === 'qiGathered');

		expect(clearCommands.map((command) => command.type)).toEqual(['gatherQi', 'endTurn']);
		expect(fighter(clearReplay.state, 'hero').cell).toEqual(post);
		if (!gathered || gathered.type !== 'qiGathered') {
			throw new Error('chosen Gather emitted no qiGathered event');
		}
		expect(gathered.qiAfter - gathered.qiBefore).toBe(1);
	});

	it('punishes an approaching vulnerable opponent instead of only guarding the post', () => {
		const post = { x: 2, z: 2 };
		const created = battleState(
			setup(
				[
					placement('hero', post, { facing: 'E' }),
					placement(
						'vulnerable',
						{ x: 3, z: 2 },
						{ side: 'enemy', template: luTemplate(), facing: 'W' }
					),
					placement('far', { x: 9, z: 9 }, { side: 'enemy', template: luTemplate(), facing: 'W' })
				],
				{ terrain: openRows(10) }
			)
		);
		const state = patchFighter(created, 'vulnerable', { health: 5 });

		const commands = planBattleTurn(state, 'hero', { archetype: 'guardian', post });
		const attack = useMoveIn(commands);
		const replayed = replayCommands(state, commands);

		expect(attack.aim).toEqual(fighter(state, 'vulnerable').cell);
		expect(fighter(replayed.state, 'vulnerable').health).toBe(0);
		expect(replayed.state.outcome).toBe('ongoing');
	});
});

describe('multi-hit, gather, counter and facing behavior', () => {
	it('moves away from its start to hit two enemies with one line attack', () => {
		const rows = ['.......', '.......', '.......'];
		const created = battleState(
			setup(
				[
					placement('hero', { x: 1, z: 1 }, { facing: 'E' }),
					placement('near', { x: 3, z: 1 }, { side: 'enemy', template: luTemplate(), facing: 'W' }),
					placement('far', { x: 4, z: 1 }, { side: 'enemy', template: luTemplate(), facing: 'W' })
				],
				{ terrain: rows }
			)
		);
		const state = patchFighter(created, 'hero', { qi: 30 });

		const commands = planBattleTurn(state, 'hero', AGGRESSOR);
		const attack = useMoveIn(commands);
		const replayed = replayCommands(state, commands);

		expect(commands.some((command) => command.type === 'move')).toBe(true);
		expect(attack.moveId).toBe('piercing_thrust');
		expect(
			replayed.events.filter((event) => event.type === 'damaged').map((event) => event.targetId)
		).toEqual(['near', 'far']);
	});

	it('values actual clamped Gather gain but not a zero full-qi Gather', () => {
		const rows = Array.from({ length: 12 }, () => '............');
		const scenarios = [
			{ qi: 90, gathers: true, gain: 10 },
			{ qi: 100, gathers: false, gain: 0 }
		];

		for (const scenario of scenarios) {
			const created = battleState(
				setup(
					[
						placement('hero', { x: 1, z: 6 }, { facing: 'E' }),
						placement('lu', { x: 11, z: 6 }, { side: 'enemy', template: luTemplate(), facing: 'W' })
					],
					{ terrain: rows }
				)
			);
			const state = patchFighter(created, 'hero', { qi: scenario.qi });

			const commands = planBattleTurn(state, 'hero', AGGRESSOR);
			const replayed = replayCommands(state, commands);
			const gathered = replayed.events.find((event) => event.type === 'qiGathered');

			expect(commands.some((command) => command.type === 'gatherQi')).toBe(scenario.gathers);
			if (scenario.gathers) {
				if (!gathered || gathered.type !== 'qiGathered') {
					throw new Error('chosen Gather emitted no qiGathered event');
				}
				expect(gathered.qiAfter - gathered.qiBefore).toBe(scenario.gain);
			} else {
				expect(gathered).toBeUndefined();
				expect(commands.some((command) => command.type === 'guard')).toBe(true);
			}
		}
	});

	it('accounts for Guard counters when the counter costs more than the hit gains', () => {
		const makeState = (guarding: boolean): BattleState => {
			const created = battleState(
				setup([
					placement('hero', { x: 2, z: 2 }, { template: { power: 1 }, facing: 'N' }),
					placement(
						'lu',
						{ x: 2, z: 1 },
						{ side: 'enemy', template: luTemplate({ power: 20 }), facing: 'S' }
					)
				])
			);
			const patched = patchFighter(created, 'lu', { guarding });
			return { ...patched, hasMoved: true };
		};

		const unguardedCommands = planBattleTurn(makeState(false), 'hero', AGGRESSOR);
		const guardedCommands = planBattleTurn(makeState(true), 'hero', AGGRESSOR);

		expect(unguardedCommands.some((command) => command.type === 'useMove')).toBe(true);
		expect(guardedCommands.some((command) => command.type === 'useMove')).toBe(false);
	});

	it('uses an ignoreGuard finisher to bypass Guard reduction and its counter', () => {
		const created = battleState(
			setup([
				placement(
					'hero',
					{ x: 2, z: 2 },
					{ template: { externalArtId: 'stone_palm' }, facing: 'N' }
				),
				placement('lu', { x: 2, z: 1 }, { side: 'enemy', template: luTemplate(), facing: 'S' })
			])
		);
		const state = patchFighter(created, 'lu', { guarding: true });

		const commands = planBattleTurn(state, 'hero', AGGRESSOR);
		const attack = useMoveIn(commands);
		const replayed = replayCommands(state, commands);

		expect(attack.moveId).toBe('stone_breaker');
		expect(replayed.events.some((event) => event.type === 'countered')).toBe(false);
		expect(
			replayed.events.find((event) => event.type === 'damaged' && event.targetId === 'lu')
		).toMatchObject({ guardPercent: 100 });
	});

	it('turns toward a living threat after the actor has already acted', () => {
		const state = battleState(
			setup([
				placement('hero', { x: 2, z: 2 }, { facing: 'W' }),
				placement('lu', { x: 4, z: 2 }, { side: 'enemy', template: luTemplate(), facing: 'W' })
			])
		);
		const acted = accept(applyBattleCommand(state, { type: 'guard', actorId: 'hero' })).state;

		const commands = planBattleTurn(acted, 'hero', AGGRESSOR);

		expect(endTurnIn(commands).facing).toBe('E');
		replayCommands(acted, commands);
	});

	it('never treats an allied fighter as an attack target', () => {
		const created = battleState(
			setup([
				placement('hero', { x: 2, z: 2 }, { facing: 'E' }),
				placement('ally', { x: 2, z: 1 }, { facing: 'S' }),
				placement('lu', { x: 2, z: 3 }, { side: 'enemy', template: luTemplate(), facing: 'N' })
			])
		);
		const state = patchFighter(created, 'ally', { health: 5 });

		const commands = planBattleTurn(state, 'hero', AGGRESSOR);
		const attack = useMoveIn(commands);
		const replayed = replayCommands(state, commands);

		expect(attack.aim).not.toEqual(fighter(state, 'ally').cell);
		expect(
			replayed.events.filter((event) => event.type === 'damaged').map((event) => event.targetId)
		).not.toContain('ally');
		expect(fighter(replayed.state, 'ally').health).toBe(5);
	});

	it('filters a killed hostile from the threat lookup before choosing final facing', () => {
		const rows = Array.from({ length: 12 }, () => '............');
		const created = battleState(
			setup(
				[
					placement('hero', { x: 2, z: 2 }, { facing: 'W' }),
					placement('near', { x: 3, z: 2 }, { side: 'enemy', template: luTemplate(), facing: 'W' }),
					placement('far', { x: 7, z: 2 }, { side: 'enemy', template: luTemplate(), facing: 'N' })
				],
				{ terrain: rows }
			)
		);
		const weakened = patchFighter(patchFighter(created, 'near', { health: 5 }), 'far', { qi: 0 });
		const state: BattleState = { ...weakened, hasMoved: true };

		const commands = planBattleTurn(state, 'hero', AGGRESSOR);
		const replayed = replayCommands(state, commands);

		expect(fighter(replayed.state, 'near').health).toBe(0);
		expect(replayed.state.outcome).toBe('ongoing');
		expect(endTurnIn(commands).facing).toBe('W');
	});
});

describe('terminal and side behavior', () => {
	it('ranks an ongoing turn above a high-scoring terminal self-defeat', () => {
		const created = battleState(
			setup([
				placement('hero', { x: 2, z: 2 }, { template: { power: 100, agility: 30 }, facing: 'N' }),
				placement(
					'center',
					{ x: 2, z: 1 },
					{
						side: 'enemy',
						template: luTemplate({ power: 100, internalArtId: 'iron_body' }),
						facing: 'S'
					}
				),
				placement('left', { x: 1, z: 1 }, { side: 'enemy', template: luTemplate(), facing: 'S' }),
				placement('right', { x: 3, z: 1 }, { side: 'enemy', template: luTemplate(), facing: 'S' })
			])
		);
		const weakened = patchFighter(patchFighter(created, 'left', { health: 5 }), 'right', {
			health: 5
		});
		const guarded = patchFighter(patchFighter(weakened, 'hero', { health: 5 }), 'center', {
			guarding: true
		});
		const state: BattleState = { ...guarded, hasMoved: true };
		const suicide = accept(
			applyBattleCommand(state, {
				type: 'useMove',
				actorId: 'hero',
				moveId: 'cloud_sweep',
				aim: { x: 2, z: 1 }
			})
		);
		expect(suicide.state.outcome).toBe('defeat');

		const commands = planBattleTurn(state, 'hero', AGGRESSOR);
		const replayed = replayCommands(state, commands);

		expect(replayed.state.outcome).toBe('ongoing');
	});

	it('ranks a low-damage immediate win above a higher-scoring ongoing attack', () => {
		const created = battleState(
			setup([
				placement('hero', { x: 2, z: 1 }, { template: { maxHealth: 1 }, facing: 'S' }),
				placement(
					'champion',
					{ x: 3, z: 2 },
					{ template: { maxHealth: 400, agility: 10 }, facing: 'E' }
				),
				placement(
					'raider',
					{ x: 2, z: 2 },
					{ side: 'enemy', template: luTemplate({ power: 200, agility: 30 }), facing: 'N' }
				)
			])
		);
		expect(getTurnOrder(created).activeId).toBe('raider');
		const state = created;

		const highScore = accept(
			applyBattleCommand(state, {
				type: 'useMove',
				actorId: 'raider',
				moveId: 'sword_cut',
				aim: { x: 3, z: 2 }
			})
		);
		expect(highScore.state.outcome).toBe('ongoing');
		expect(highScore.events).toContainEqual(
			expect.objectContaining({
				type: 'damaged',
				targetId: 'champion',
				applied: 360,
				healthAfter: 40
			})
		);

		const immediateWin = accept(
			applyBattleCommand(state, {
				type: 'useMove',
				actorId: 'raider',
				moveId: 'sword_cut',
				aim: { x: 2, z: 1 }
			})
		);
		expect(immediateWin.state.outcome).toBe('defeat');
		expect(immediateWin.events).toContainEqual(
			expect.objectContaining({ type: 'damaged', targetId: 'hero', applied: 1, healthAfter: 0 })
		);

		const commands = planBattleTurn(state, 'raider', AGGRESSOR);
		const replayed = replayCommands(state, commands);

		expect(useMoveIn(commands).aim).toEqual(fighter(state, 'hero').cell);
		expect(commands.some((command) => command.type === 'endTurn')).toBe(false);
		expect(replayed.state.outcome).toBe('defeat');
	});

	it('omits endTurn when the chosen attack ends the battle', () => {
		const adjacent = battleState(starter({ x: 1, z: 1 }, { x: 2, z: 1 }));
		const state = patchFighter(adjacent, 'lu', { health: 5 });

		const commands = planBattleTurn(state, 'hero', AGGRESSOR);

		expect(commands.some((command) => command.type === 'useMove')).toBe(true);
		expect(commands.some((command) => command.type === 'endTurn')).toBe(false);
		const replayed = replayCommands(state, commands);
		expect(replayed.state.outcome).toBe('victory');
		expect(replayed.events.some((event) => event.type === 'battleEnded')).toBe(true);
	});

	it('plans for an enemy actor without consuming squad pills, even on a lethal turn', () => {
		const adjacent = battleState(
			setup(
				[
					placement('hero', { x: 1, z: 1 }, { facing: 'E' }),
					placement(
						'lu',
						{ x: 2, z: 1 },
						{
							side: 'enemy',
							template: luTemplate({ agility: 30 }),
							facing: 'W'
						}
					)
				],
				{ squadBag: { lesser_healing_pill: 2, lesser_qi_pill: 2 } }
			)
		);
		const state = patchFighter(adjacent, 'hero', { health: 5 });

		const commands = planBattleTurn(state, 'lu', AGGRESSOR);

		expect(commands.some((command) => command.type === 'useItem')).toBe(false);
		expect(commands.some((command) => command.type === 'useMove' && command.actorId === 'lu')).toBe(
			true
		);
		const replayed = replayCommands(state, commands);
		expect(replayed.state.outcome).toBe('defeat');
		expect(replayed.state.squadBag).toEqual({ lesser_healing_pill: 2, lesser_qi_pill: 2 });
	});
});

describe('counter-kill handoff', () => {
	it('accepts a worthwhile non-terminal counter kill without appending a stale endTurn', () => {
		const created = battleState(
			setup([
				placement('hero', { x: 0, z: 4 }, { template: { agility: 1 }, facing: 'N' }),
				placement('ally', { x: 2, z: 2 }, { template: { power: 100, agility: 30 }, facing: 'N' }),
				placement(
					'center',
					{ x: 2, z: 1 },
					{
						side: 'enemy',
						template: luTemplate({ power: 100, internalArtId: 'iron_body' }),
						facing: 'S'
					}
				),
				placement('left', { x: 1, z: 1 }, { side: 'enemy', template: luTemplate(), facing: 'S' }),
				placement('right', { x: 3, z: 1 }, { side: 'enemy', template: luTemplate(), facing: 'S' })
			])
		);
		const weakened = patchFighter(patchFighter(created, 'left', { health: 5 }), 'right', {
			health: 5
		});
		const guarded = patchFighter(patchFighter(weakened, 'ally', { health: 5 }), 'center', {
			guarding: true
		});
		const state: BattleState = { ...guarded, hasMoved: true };
		const probe = accept(
			applyBattleCommand(state, {
				type: 'useMove',
				actorId: 'ally',
				moveId: 'cloud_sweep',
				aim: { x: 2, z: 1 }
			})
		);
		expect(probe.state.outcome).toBe('ongoing');
		expect(fighter(probe.state, 'ally').health).toBe(0);
		expect(getTurnOrder(probe.state).activeId).not.toBe('ally');
		expect(probe.events.some((event) => event.type === 'turnStarted')).toBe(true);

		const commands = planBattleTurn(state, 'ally', AGGRESSOR);
		const attack = useMoveIn(commands);
		const replayed = replayCommands(state, commands);

		expect(attack.moveId).toBe('cloud_sweep');
		expect(commands.some((command) => command.type === 'endTurn')).toBe(false);
		expect(replayed.state.outcome).toBe('ongoing');
		expect(fighter(replayed.state, 'ally').health).toBe(0);
		expect(getTurnOrder(replayed.state).activeId).not.toBe('ally');
		expect(replayed.events.some((event) => event.type === 'turnEnded')).toBe(true);
		expect(replayed.events.some((event) => event.type === 'turnStarted')).toBe(true);
	});
});

describe('planner purity and replayability', () => {
	it('repeats identical commands for identical decisions', () => {
		const rows = ['.....', '.TTT.', '..#..', '.....', '.....'];
		const state = battleState(
			setup(
				[
					placement('hero', { x: 1, z: 2 }, { facing: 'E' }),
					placement('lu', { x: 3, z: 2 }, { side: 'enemy', template: luTemplate(), facing: 'W' })
				],
				{ terrain: rows }
			)
		);

		const first = planBattleTurn(state, 'hero', AGGRESSOR);
		const second = planBattleTurn(state, 'hero', AGGRESSOR);

		expect(second).toStrictEqual(first);
		replayCommands(state, first);
	});

	it('does not mutate a deep-frozen input state or profile and every command replays legally', () => {
		const state = battleState(starter({ x: 1, z: 1 }, { x: 2, z: 1 }));
		const snapshot = JSON.parse(JSON.stringify(state));
		const profile: BattleAiProfile = { archetype: 'aggressor' };
		deepFreeze(state);
		deepFreeze(profile);

		const commands = planBattleTurn(state, 'hero', profile);

		expect(state).toEqual(snapshot);
		expect(commands.length).toBeGreaterThan(0);
		replayCommands(state, commands);
	});

	it('returns move and attack coordinates independent of input fighter cells', () => {
		const rows = ['.....', '.TTT.', '..#..', '.....', '.....'];
		const created = battleState(
			setup(
				[
					placement('hero', { x: 1, z: 2 }, { facing: 'E' }),
					placement('lu', { x: 3, z: 2 }, { side: 'enemy', template: luTemplate(), facing: 'W' }),
					placement(
						'fallen',
						{ x: 3, z: 3 },
						{ side: 'enemy', template: luTemplate(), facing: 'W' }
					)
				],
				{ terrain: rows }
			)
		);
		const state = patchFighter(created, 'fallen', { health: 0 });
		const heroCell = fighter(state, 'hero').cell;
		const luCell = fighter(state, 'lu').cell;
		const fallenCell = fighter(state, 'fallen').cell;
		const inputCells = [heroCell, luCell, fallenCell];

		const commands = planBattleTurn(state, 'hero', AGGRESSOR);
		const moveCommand = commands.find((command) => command.type === 'move');
		if (!moveCommand || moveCommand.type !== 'move') {
			throw new Error('planner did not return a move command');
		}
		const attackCommand = commands.find((command) => command.type === 'useMove');
		if (!attackCommand || attackCommand.type !== 'useMove') {
			throw new Error('planner did not return an attack command');
		}

		expect(moveCommand.cell).toEqual({ x: 3, z: 3 });
		expect(attackCommand.aim).toEqual({ x: 3, z: 2 });
		for (const inputCell of inputCells) {
			expect(moveCommand.cell).not.toBe(inputCell);
			expect(attackCommand.aim).not.toBe(inputCell);
		}
		replayCommands(state, commands);
		const beforeMutation = JSON.parse(JSON.stringify(commands));

		for (const inputCell of inputCells) {
			inputCell.x = -1;
			inputCell.z = -1;
		}

		expect(JSON.parse(JSON.stringify(commands))).toEqual(beforeMutation);
	});
});
