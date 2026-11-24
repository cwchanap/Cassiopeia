import { describe, expect, it } from 'vitest';
import {
	EXTERNAL_ARTS,
	INTERNAL_ARTS,
	SECT_HERO_TEMPLATE,
	SENIOR_BROTHER_LU_TEMPLATE,
	STARTER_BATTLE_TERRAIN
} from './content';
import { applyBattleCommand, createBattle, getTurnOrder } from './rules';
import type {
	BattleCommandResult,
	BattleEvent,
	BattleFighter,
	BattleSetup,
	BattleState,
	Cell,
	ExternalArtId,
	Facing,
	FighterSetup,
	FighterTemplate,
	InternalArtId
} from './types';

const OPEN_ROWS = ['.....', '.....', '.....', '.....', '.....'];

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

function setup(fighters: FighterSetup[], overrides: Partial<BattleSetup> = {}): BattleSetup {
	return { terrain: [...OPEN_ROWS], fighters, heroId: 'hero', ...overrides };
}

/** Hero (agility 20) and Lu (agility 10) on the open 5 x 5 test map. */
function starter(): BattleSetup {
	return setup([
		placement('hero', { x: 0, z: 0 }, { facing: 'E' }),
		placement(
			'lu',
			{ x: 4, z: 4 },
			{
				side: 'enemy',
				template: SENIOR_BROTHER_LU_TEMPLATE,
				facing: 'W'
			}
		)
	]);
}

function accept(result: BattleCommandResult): { state: BattleState; events: BattleEvent[] } {
	if (!result.accepted) {
		throw new Error(`expected an accepted command, got ${result.reason}`);
	}
	return result;
}

function patchFighter(state: BattleState, id: string, patch: Partial<BattleFighter>): BattleState {
	return {
		...state,
		fighters: state.fighters.map((fighter) =>
			fighter.id === id ? { ...fighter, ...patch } : fighter
		)
	};
}

describe('battle construction', () => {
	it('starts every fighter at full health and qi with round and turn-start events', () => {
		const { state, events } = createBattle(starter());

		expect(state.fighters).toHaveLength(2);
		expect(state.fighters[0]).toMatchObject({
			id: 'hero',
			side: 'squad',
			health: 100,
			maxHealth: 100,
			qi: 100,
			maxQi: 100,
			cell: { x: 0, z: 0 },
			facing: 'E',
			guarding: false
		});
		expect(state.fighters[1]).toMatchObject({
			id: 'lu',
			side: 'enemy',
			health: 100,
			maxHealth: 100,
			qi: 100,
			maxQi: 100,
			cell: { x: 4, z: 4 },
			facing: 'W',
			guarding: false
		});
		expect(state).toMatchObject({
			heroId: 'hero',
			round: 1,
			turnOrder: ['hero', 'lu'],
			turnIndex: 0,
			hasMoved: false,
			hasActed: false,
			outcome: 'ongoing'
		});
		expect(events).toEqual([
			{ type: 'roundStarted', round: 1, order: ['hero', 'lu'] },
			{
				type: 'turnStarted',
				actorId: 'hero',
				qiBefore: 100,
				qiAfter: 100
			}
		]);
		expect(JSON.parse(JSON.stringify({ state, events }))).toEqual({ state, events });
	});

	it('derives maximum qi from the internal art and normalises the shared bag', () => {
		const created = createBattle(
			setup(
				[
					placement(
						'hero',
						{ x: 0, z: 0 },
						{
							template: { ...SECT_HERO_TEMPLATE, internalArtId: 'iron_body' }
						}
					),
					placement(
						'lu',
						{ x: 4, z: 4 },
						{
							side: 'enemy',
							template: {
								...SENIOR_BROTHER_LU_TEMPLATE,
								internalArtId: 'flowing_cloud_steps'
							}
						}
					)
				],
				{ squadBag: { lesser_healing_pill: 0, lesser_qi_pill: 3 } }
			)
		);

		expect(created.state.fighters[0]).toMatchObject({ maxQi: 70, qi: 70 });
		expect(created.state.fighters[1]).toMatchObject({ maxQi: 90, qi: 90 });
		expect(created.state.squadBag).toEqual({ lesser_qi_pill: 3 });

		expect(createBattle(starter()).state.squadBag).toEqual({});
	});

	it('copies the authored setup instead of aliasing it', () => {
		const authored = starter();
		authored.squadBag = { lesser_healing_pill: 1 };
		const { state } = createBattle(authored);

		authored.fighters[0].cell = { x: 3, z: 3 };
		authored.fighters[0].template.maxHealth = 1;
		authored.squadBag.lesser_healing_pill = 9;
		authored.terrain[0] = '#####';

		expect(state.fighters[0]).toMatchObject({ cell: { x: 0, z: 0 }, maxHealth: 100 });
		expect(state.squadBag).toEqual({ lesser_healing_pill: 1 });
		expect(state.map.terrain[0][0]).toBe('ground');

		state.fighters[0].cell.x = 2;
		state.fighters[0].health = 1;
		state.squadBag.lesser_healing_pill = 0;

		expect(authored.fighters[0].cell).toEqual({ x: 3, z: 3 });
		expect(authored.squadBag.lesser_healing_pill).toBe(9);
		expect(authored.terrain[0]).toBe('#####');
	});

	it('allows bamboo spawns', () => {
		const created = createBattle(
			setup(
				[placement('hero', { x: 0, z: 0 }), placement('lu', { x: 2, z: 2 }, { side: 'enemy' })],
				{ terrain: ['T..', '...', '...'] }
			)
		);

		expect(created.state.map.terrain[0][0]).toBe('bamboo');
		expect(created.state.fighters[0].cell).toEqual({ x: 0, z: 0 });
	});
});

describe('invalid authored setup', () => {
	const invalidSetups: { name: string; setup: () => BattleSetup }[] = [
		{ name: 'empty terrain', setup: () => ({ ...starter(), terrain: [] }) },
		{ name: 'an empty terrain row', setup: () => ({ ...starter(), terrain: [''] }) },
		{
			name: 'ragged terrain rows',
			setup: () => ({ ...starter(), terrain: ['...', '..'] })
		},
		{
			name: 'a row of a different length',
			setup: () => ({ ...starter(), terrain: ['...', '....', '...'] })
		},
		{
			name: 'an unknown terrain character',
			setup: () => ({ ...starter(), terrain: ['..x', '...', '...'] })
		},
		{ name: 'no fighters', setup: () => ({ ...starter(), fighters: [] }) },
		{
			name: 'duplicate fighter IDs',
			setup: () =>
				setup([
					placement('hero', { x: 0, z: 0 }),
					placement('hero', { x: 1, z: 0 }),
					placement('lu', { x: 4, z: 4 }, { side: 'enemy' })
				])
		},
		{ name: 'a missing hero', setup: () => ({ ...starter(), heroId: 'nobody' }) },
		{ name: 'a hero on the enemy side', setup: () => ({ ...starter(), heroId: 'lu' }) },
		{
			name: 'no opponent',
			setup: () => setup([placement('hero', { x: 0, z: 0 })])
		},
		{
			name: 'an out-of-bounds spawn',
			setup: () =>
				setup([
					placement('hero', { x: 5, z: 0 }),
					placement('lu', { x: 4, z: 4 }, { side: 'enemy' })
				])
		},
		{
			name: 'a fractional spawn',
			setup: () =>
				setup([
					placement('hero', { x: 0.5, z: 0 }),
					placement('lu', { x: 4, z: 4 }, { side: 'enemy' })
				])
		},
		{
			name: 'a water spawn',
			setup: () =>
				setup(
					[placement('hero', { x: 0, z: 0 }), placement('lu', { x: 2, z: 2 }, { side: 'enemy' })],
					{ terrain: ['~..', '...', '...'] }
				)
		},
		{
			name: 'an obstacle spawn',
			setup: () =>
				setup(
					[placement('hero', { x: 0, z: 0 }), placement('lu', { x: 2, z: 2 }, { side: 'enemy' })],
					{ terrain: ['#..', '...', '...'] }
				)
		},
		{
			name: 'an invalid facing',
			setup: () =>
				setup([
					placement('hero', { x: 0, z: 0 }, { facing: 'X' as Facing }),
					placement('lu', { x: 4, z: 4 }, { side: 'enemy' })
				])
		},
		{
			name: 'overlapping spawns',
			setup: () =>
				setup([
					placement('hero', { x: 0, z: 0 }),
					placement('lu', { x: 0, z: 0 }, { side: 'enemy' })
				])
		},
		{
			name: 'zero max health',
			setup: () =>
				setup([
					placement('hero', { x: 0, z: 0 }, { template: { ...SECT_HERO_TEMPLATE, maxHealth: 0 } }),
					placement('lu', { x: 4, z: 4 }, { side: 'enemy' })
				])
		},
		{
			name: 'fractional power',
			setup: () =>
				setup([
					placement('hero', { x: 0, z: 0 }, { template: { ...SECT_HERO_TEMPLATE, power: 9.5 } }),
					placement('lu', { x: 4, z: 4 }, { side: 'enemy' })
				])
		},
		{
			name: 'zero agility',
			setup: () =>
				setup([
					placement('hero', { x: 0, z: 0 }, { template: { ...SECT_HERO_TEMPLATE, agility: 0 } }),
					placement('lu', { x: 4, z: 4 }, { side: 'enemy' })
				])
		},
		{
			name: 'a negative pill count',
			setup: () => setup(starter().fighters, { squadBag: { lesser_healing_pill: -1 } })
		},
		{
			name: 'a fractional pill count',
			setup: () => setup(starter().fighters, { squadBag: { lesser_qi_pill: 1.5 } })
		}
	];

	it.each(invalidSetups)('throws for $name', ({ setup: makeSetup }) => {
		expect(() => createBattle(makeSetup())).toThrow();
	});
});

describe('authored content construction', () => {
	it('constructs the authored starter battle', () => {
		const { state } = createBattle({
			terrain: STARTER_BATTLE_TERRAIN,
			fighters: [
				{
					id: 'hero',
					side: 'squad',
					template: SECT_HERO_TEMPLATE,
					cell: { x: 0, z: 0 },
					facing: 'E'
				},
				{
					id: 'lu',
					side: 'enemy',
					template: SENIOR_BROTHER_LU_TEMPLATE,
					cell: { x: 11, z: 11 },
					facing: 'W'
				}
			],
			heroId: 'hero',
			squadBag: { lesser_healing_pill: 2, lesser_qi_pill: 0 }
		});

		expect(state.map).toMatchObject({ width: 12, height: 12 });
		expect(state.squadBag).toEqual({ lesser_healing_pill: 2 });
		expect(state.turnOrder).toEqual(['hero', 'lu']);
	});

	it('constructs a battle for every authored external and internal art', () => {
		for (const externalArtId of Object.keys(EXTERNAL_ARTS) as ExternalArtId[]) {
			for (const internalArtId of Object.keys(INTERNAL_ARTS) as InternalArtId[]) {
				const { state } = createBattle({
					terrain: ['...', '...', '...'],
					fighters: [
						{
							id: 'squad',
							side: 'squad',
							template: { ...SECT_HERO_TEMPLATE, externalArtId, internalArtId },
							cell: { x: 0, z: 0 },
							facing: 'N'
						},
						{
							id: 'enemy',
							side: 'enemy',
							template: { ...SENIOR_BROTHER_LU_TEMPLATE, externalArtId, internalArtId },
							cell: { x: 2, z: 2 },
							facing: 'S'
						}
					],
					heroId: 'squad'
				});

				expect(state.fighters[0]).toMatchObject({
					externalArtId,
					internalArtId,
					maxQi: INTERNAL_ARTS[internalArtId].maxQi
				});
				expect(state.fighters[1].maxQi).toBe(INTERNAL_ARTS[internalArtId].maxQi);
			}
		}
	});
});

describe('initiative and turn order', () => {
	it('sorts living fighters by descending agility', () => {
		const created = createBattle(
			setup([
				placement(
					'lu',
					{ x: 4, z: 4 },
					{
						side: 'enemy',
						template: SENIOR_BROTHER_LU_TEMPLATE
					}
				),
				placement('hero', { x: 0, z: 0 })
			])
		);

		expect(created.state.turnOrder).toEqual(['hero', 'lu']);
		expect(created.events[0]).toEqual({
			type: 'roundStarted',
			round: 1,
			order: ['hero', 'lu']
		});
	});

	it('places squad before enemy when agility ties across sides', () => {
		const created = createBattle(
			setup([
				placement(
					'lu',
					{ x: 4, z: 4 },
					{
						side: 'enemy',
						template: { ...SENIOR_BROTHER_LU_TEMPLATE, agility: 20 }
					}
				),
				placement('hero', { x: 0, z: 0 })
			])
		);

		expect(created.state.turnOrder).toEqual(['hero', 'lu']);
	});

	it('keeps setup order within a side when agility ties', () => {
		const created = createBattle(
			setup([
				placement(
					'ally',
					{ x: 0, z: 0 },
					{
						template: { ...SECT_HERO_TEMPLATE, agility: 10 }
					}
				),
				placement(
					'hero',
					{ x: 1, z: 0 },
					{
						template: { ...SECT_HERO_TEMPLATE, agility: 10 }
					}
				),
				placement(
					'lu',
					{ x: 4, z: 4 },
					{
						side: 'enemy',
						template: { ...SENIOR_BROTHER_LU_TEMPLATE, agility: 10 }
					}
				)
			])
		);

		expect(created.state.turnOrder).toEqual(['ally', 'hero', 'lu']);
	});

	it('reports the current and next round orders', () => {
		const { state } = createBattle(starter());

		expect(getTurnOrder(state)).toEqual({
			round: 1,
			activeId: 'hero',
			order: ['hero', 'lu'],
			actedIds: [],
			nextRound: ['hero', 'lu']
		});

		const guarded = accept(applyBattleCommand(state, { type: 'guard', actorId: 'hero' }));
		const ended = accept(
			applyBattleCommand(guarded.state, { type: 'endTurn', actorId: 'hero', facing: 'E' })
		);

		expect(getTurnOrder(ended.state)).toEqual({
			round: 1,
			activeId: 'lu',
			order: ['hero', 'lu'],
			actedIds: ['hero'],
			nextRound: ['hero', 'lu']
		});
	});

	it('has no active or next turn once the battle is over', () => {
		const { state } = createBattle(starter());

		expect(getTurnOrder({ ...state, outcome: 'victory' })).toEqual({
			round: 1,
			activeId: null,
			order: [],
			actedIds: [],
			nextRound: []
		});
	});

	it('skips defeated IDs without re-sorting and recomputes the next round from survivors', () => {
		const created = createBattle(
			setup([
				placement('hero', { x: 0, z: 0 }, { facing: 'E' }),
				placement(
					'ally',
					{ x: 0, z: 1 },
					{
						template: { ...SECT_HERO_TEMPLATE, agility: 15 }
					}
				),
				placement(
					'lu',
					{ x: 4, z: 4 },
					{
						side: 'enemy',
						template: SENIOR_BROTHER_LU_TEMPLATE,
						facing: 'W'
					}
				)
			])
		);
		expect(created.state.turnOrder).toEqual(['hero', 'ally', 'lu']);

		const state = patchFighter(created.state, 'ally', { health: 0 });

		const heroGuarded = accept(applyBattleCommand(state, { type: 'guard', actorId: 'hero' }));
		const heroEnded = accept(
			applyBattleCommand(heroGuarded.state, {
				type: 'endTurn',
				actorId: 'hero',
				facing: 'E'
			})
		);
		expect(heroEnded.events).toEqual([
			{ type: 'turnEnded', actorId: 'hero', facingBefore: 'E', facingAfter: 'E' },
			{ type: 'turnStarted', actorId: 'lu', qiBefore: 100, qiAfter: 100 }
		]);
		expect(getTurnOrder(heroEnded.state)).toEqual({
			round: 1,
			activeId: 'lu',
			order: ['hero', 'lu'],
			actedIds: ['hero'],
			nextRound: ['hero', 'lu']
		});

		const luGuarded = accept(applyBattleCommand(heroEnded.state, { type: 'guard', actorId: 'lu' }));
		const luEnded = accept(
			applyBattleCommand(luGuarded.state, { type: 'endTurn', actorId: 'lu', facing: 'W' })
		);
		expect(luEnded.events).toEqual([
			{ type: 'turnEnded', actorId: 'lu', facingBefore: 'W', facingAfter: 'W' },
			{ type: 'roundStarted', round: 2, order: ['hero', 'lu'] },
			{ type: 'turnStarted', actorId: 'hero', qiBefore: 100, qiAfter: 100 }
		]);
		expect(getTurnOrder(luEnded.state)).toEqual({
			round: 2,
			activeId: 'hero',
			order: ['hero', 'lu'],
			actedIds: [],
			nextRound: ['hero', 'lu']
		});
	});

	it('regenerates qi at the next turn start and caps at maximum', () => {
		const created = createBattle(starter());
		let state = patchFighter(created.state, 'hero', { qi: 95 });
		state = patchFighter(state, 'lu', { qi: 55 });

		const heroGuarded = accept(applyBattleCommand(state, { type: 'guard', actorId: 'hero' }));
		const heroEnded = accept(
			applyBattleCommand(heroGuarded.state, {
				type: 'endTurn',
				actorId: 'hero',
				facing: 'E'
			})
		);
		expect(heroEnded.events).toEqual([
			{ type: 'turnEnded', actorId: 'hero', facingBefore: 'E', facingAfter: 'E' },
			{ type: 'turnStarted', actorId: 'lu', qiBefore: 55, qiAfter: 65 }
		]);

		const luGuarded = accept(applyBattleCommand(heroEnded.state, { type: 'guard', actorId: 'lu' }));
		const luEnded = accept(
			applyBattleCommand(luGuarded.state, { type: 'endTurn', actorId: 'lu', facing: 'W' })
		);
		expect(luEnded.events).toEqual([
			{ type: 'turnEnded', actorId: 'lu', facingBefore: 'W', facingAfter: 'W' },
			{ type: 'roundStarted', round: 2, order: ['hero', 'lu'] },
			{ type: 'turnStarted', actorId: 'hero', qiBefore: 95, qiAfter: 100 }
		]);
		expect(luEnded.state.fighters.find((fighter) => fighter.id === 'hero')?.qi).toBe(100);
	});

	it('uses the internal art regeneration', () => {
		const created = createBattle(
			setup([
				placement('hero', { x: 0, z: 0 }),
				placement(
					'ally',
					{ x: 0, z: 1 },
					{
						template: {
							...SECT_HERO_TEMPLATE,
							agility: 15,
							internalArtId: 'iron_body'
						}
					}
				),
				placement(
					'lu',
					{ x: 4, z: 4 },
					{
						side: 'enemy',
						template: SENIOR_BROTHER_LU_TEMPLATE
					}
				)
			])
		);
		const state = patchFighter(created.state, 'ally', { qi: 65 });

		const heroGuarded = accept(applyBattleCommand(state, { type: 'guard', actorId: 'hero' }));
		const heroEnded = accept(
			applyBattleCommand(heroGuarded.state, {
				type: 'endTurn',
				actorId: 'hero',
				facing: 'N'
			})
		);

		expect(heroEnded.events).toEqual([
			{ type: 'turnEnded', actorId: 'hero', facingBefore: 'N', facingAfter: 'N' },
			{ type: 'turnStarted', actorId: 'ally', qiBefore: 65, qiAfter: 70 }
		]);
	});

	it("clears Guard only at the guarding fighter's next turn start", () => {
		const created = createBattle(starter());
		const heroGuarded = accept(
			applyBattleCommand(created.state, { type: 'guard', actorId: 'hero' })
		);
		expect(heroGuarded.state.fighters[0].guarding).toBe(true);

		const heroEnded = accept(
			applyBattleCommand(heroGuarded.state, { type: 'endTurn', actorId: 'hero', facing: 'E' })
		);
		expect(heroEnded.state.fighters[0].guarding).toBe(true);

		const luGuarded = accept(applyBattleCommand(heroEnded.state, { type: 'guard', actorId: 'lu' }));
		const luEnded = accept(
			applyBattleCommand(luGuarded.state, { type: 'endTurn', actorId: 'lu', facing: 'W' })
		);

		expect(luEnded.state.fighters[0].guarding).toBe(false);
		expect(luEnded.state.fighters[1].guarding).toBe(true);
	});
});
