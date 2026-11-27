import { describe, expect, it } from 'vitest';
import {
	AI_ARCHETYPES,
	AI_SHARED_WEIGHTS,
	applyBattleCommand,
	createBattle,
	getMoveTargets,
	getReachableCells,
	planBattleTurn,
	SECT_HERO_TEMPLATE,
	SENIOR_BROTHER_LU_TEMPLATE,
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

describe('terminal and side behavior', () => {
	it('omits endTurn when the chosen attack ends the battle', () => {
		const adjacent = battleState(starter({ x: 1, z: 1 }, { x: 2, z: 1 }));
		const state = patchFighter(adjacent, 'lu', { health: 5 });

		const commands = planBattleTurn(state, 'hero', AGGRESSOR);

		expect(commands).toEqual([
			{
				type: 'useMove',
				actorId: 'hero',
				moveId: 'sword_cut',
				aim: { x: 2, z: 1 }
			}
		]);
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
		expect(commands[0]).toMatchObject({ type: 'useMove', actorId: 'lu', moveId: 'sword_cut' });
		const replayed = replayCommands(state, commands);
		expect(replayed.state.outcome).toBe('defeat');
		expect(replayed.state.squadBag).toEqual({ lesser_healing_pill: 2, lesser_qi_pill: 2 });
	});
});

describe('planner purity and replayability', () => {
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
