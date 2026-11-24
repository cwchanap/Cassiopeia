import { describe, expect, it } from 'vitest';
import { EXTERNAL_ARTS, MOVES, SECT_HERO_TEMPLATE, SENIOR_BROTHER_LU_TEMPLATE } from './content';
import { facingStep } from './grid';
import { applyBattleCommand, createBattle, getMoveTargets } from './rules';
import type {
	BattleCommand,
	BattleCommandResult,
	BattleEvent,
	BattleFighter,
	BattleRejectionReason,
	BattleSetup,
	BattleState,
	Cell,
	ExternalArtId,
	Facing,
	FighterSetup,
	FighterTemplate,
	MoveId,
	MoveSlot
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

function luTemplate(overrides: Partial<FighterTemplate> = {}): Partial<FighterTemplate> {
	return { ...SENIOR_BROTHER_LU_TEMPLATE, ...overrides };
}

function setup(fighters: FighterSetup[], overrides: Partial<BattleSetup> = {}): BattleSetup {
	return { terrain: [...OPEN_ROWS], fighters, heroId: 'hero', ...overrides };
}

type DuelOptions = {
	hero?: Partial<FighterTemplate>;
	heroCell?: Cell;
	heroFacing?: Facing;
	lu?: Partial<FighterTemplate>;
	luCell?: Cell;
	luFacing?: Facing;
	terrain?: string[];
};

/** Hero (agility 20) against Lu (agility 10), adjacent by default. */
function duel(options: DuelOptions = {}): BattleSetup {
	return setup(
		[
			placement('hero', options.heroCell ?? { x: 0, z: 0 }, {
				facing: options.heroFacing ?? 'E',
				template: options.hero
			}),
			placement('lu', options.luCell ?? { x: 1, z: 0 }, {
				side: 'enemy',
				facing: options.luFacing ?? 'W',
				template: luTemplate(options.lu)
			})
		],
		options.terrain ? { terrain: options.terrain } : {}
	);
}

function accept(result: BattleCommandResult): { state: BattleState; events: BattleEvent[] } {
	if (!result.accepted) {
		throw new Error(`expected an accepted command, got ${result.reason}`);
	}
	return result;
}

function rejectionReason(result: BattleCommandResult): BattleRejectionReason {
	if (result.accepted) {
		throw new Error('expected a rejected command');
	}
	return result.reason;
}

function patchFighter(state: BattleState, id: string, patch: Partial<BattleFighter>): BattleState {
	return {
		...state,
		fighters: state.fighters.map((fighter) =>
			fighter.id === id ? { ...fighter, ...patch } : fighter
		)
	};
}

function activate(state: BattleState, id: string): BattleState {
	return {
		...state,
		turnIndex: state.turnOrder.indexOf(id),
		hasMoved: false,
		hasActed: false
	};
}

function fighter(state: BattleState, id: string): BattleFighter {
	const found = state.fighters.find((candidate) => candidate.id === id);
	if (!found) {
		throw new Error(`unknown fighter: ${id}`);
	}
	return found;
}

function eventsOfType<T extends BattleEvent['type']>(
	events: BattleEvent[],
	type: T
): Extract<BattleEvent, { type: T }>[] {
	return events.filter((event): event is Extract<BattleEvent, { type: T }> => event.type === type);
}

function eventTypes(events: BattleEvent[]): string[] {
	return events.map((event) => event.type);
}

function useMove(actorId: string, moveId: MoveId, aim: Cell): BattleCommand {
	return { type: 'useMove', actorId, moveId, aim };
}

describe('facing from the defender orientation', () => {
	it.each(['N', 'E', 'S', 'W'] as Facing[])(
		'reads front, side and rear around a defender facing %s',
		(facing) => {
			const defenderCell = { x: 2, z: 2 };
			const step = facingStep(facing);
			const sideStep = facing === 'N' || facing === 'S' ? { x: 1, z: 0 } : { x: 0, z: 1 };
			const cases: { offset: Cell; facingPercent: number; damage: number }[] = [
				{ offset: step, facingPercent: 100, damage: 12 },
				{ offset: { x: -step.x, z: -step.z }, facingPercent: 150, damage: 18 },
				{ offset: sideStep, facingPercent: 125, damage: 15 }
			];

			for (const expected of cases) {
				const { state } = createBattle(
					duel({
						heroCell: {
							x: defenderCell.x + expected.offset.x,
							z: defenderCell.z + expected.offset.z
						},
						luCell: defenderCell,
						luFacing: facing
					})
				);

				const [damaged] = eventsOfType(
					accept(applyBattleCommand(state, useMove('hero', 'sword_cut', defenderCell))).events,
					'damaged'
				);

				expect(damaged).toMatchObject({
					targetId: 'lu',
					facingPercent: expected.facingPercent,
					calculated: expected.damage,
					applied: expected.damage
				});
			}
		}
	);

	it('treats a diagonal attacker as a side hit even when the components tie', () => {
		const { state } = createBattle(
			duel({
				heroCell: { x: 2, z: 2 },
				luCell: { x: 1, z: 3 },
				luFacing: 'N',
				hero: { externalArtId: 'sect_sword_form' }
			})
		);

		// Diagonal to the defender, so the arc lateral cell is a 125% side hit.
		const [damaged] = eventsOfType(
			accept(applyBattleCommand(state, useMove('hero', 'cloud_sweep', { x: 1, z: 2 }))).events,
			'damaged'
		);

		expect(damaged).toMatchObject({ facingPercent: 125, calculated: 30 });
	});
});

describe('damage mitigation', () => {
	it('applies bamboo cover only when the defender is more than one step away', () => {
		const terrain = ['.....', '.....', '.....', '..T..', '..T..'];

		const adjacent = createBattle(
			duel({
				heroCell: { x: 2, z: 2 },
				luCell: { x: 2, z: 3 },
				luFacing: 'N',
				terrain
			})
		);
		const [closeHit] = eventsOfType(
			accept(applyBattleCommand(adjacent.state, useMove('hero', 'sword_cut', { x: 2, z: 3 })))
				.events,
			'damaged'
		);
		expect(closeHit).toMatchObject({ coverPercent: 100, facingPercent: 100, calculated: 12 });

		const distant = createBattle(
			duel({
				heroCell: { x: 2, z: 0 },
				hero: { externalArtId: 'willow_darts' },
				luCell: { x: 2, z: 3 },
				luFacing: 'N',
				terrain
			})
		);
		const [coveredHit] = eventsOfType(
			accept(applyBattleCommand(distant.state, useMove('hero', 'twin_darts', { x: 2, z: 3 })))
				.events,
			'damaged'
		);
		expect(coveredHit).toMatchObject({ coverPercent: 75, facingPercent: 100, calculated: 9 });
	});

	it("applies Guard's reduction from the front while the guard still counters", () => {
		const created = createBattle(duel());
		const state = patchFighter(created.state, 'lu', { guarding: true });

		const result = accept(applyBattleCommand(state, useMove('hero', 'sword_cut', { x: 1, z: 0 })));
		const damaged = eventsOfType(result.events, 'damaged');

		expect(damaged[0]).toMatchObject({ targetId: 'lu', guardPercent: 50, calculated: 6 });
		expect(eventTypes(result.events)).toEqual(['attacked', 'damaged', 'countered', 'damaged']);
	});

	it("keeps Guard's reduction on a rear hit that cannot counter", () => {
		const created = createBattle(duel({ luFacing: 'E' }));
		const state = patchFighter(created.state, 'lu', { guarding: true });

		const result = accept(applyBattleCommand(state, useMove('hero', 'sword_cut', { x: 1, z: 0 })));

		expect(eventsOfType(result.events, 'damaged')[0]).toMatchObject({
			facingPercent: 150,
			guardPercent: 50,
			calculated: 9
		});
		expect(eventsOfType(result.events, 'countered')).toEqual([]);
	});

	it('combines Guard and Iron Body mitigation', () => {
		const created = createBattle(
			duel({
				hero: { internalArtId: 'iron_body' },
				lu: { internalArtId: 'iron_body' }
			})
		);
		const state = patchFighter(created.state, 'lu', { guarding: true });

		const [damaged] = eventsOfType(
			accept(applyBattleCommand(state, useMove('hero', 'sword_cut', { x: 1, z: 0 }))).events,
			'damaged'
		);

		expect(damaged).toMatchObject({
			targetId: 'lu',
			guardPercent: 50,
			passivePercent: 80,
			calculated: 4,
			applied: 4
		});
	});

	it('clamps applied damage to the remaining health and reports both values', () => {
		const created = createBattle(duel());
		const state = patchFighter(created.state, 'lu', { health: 5 });

		const result = accept(applyBattleCommand(state, useMove('hero', 'sword_cut', { x: 1, z: 0 })));
		const [damaged] = eventsOfType(result.events, 'damaged');

		expect(damaged).toMatchObject({
			calculated: 12,
			applied: 5,
			healthBefore: 5,
			healthAfter: 0
		});
		expect(fighter(result.state, 'lu').health).toBe(0);
	});
});

describe('attack validation', () => {
	it('debits the move qi exactly once and reports it on the attack event', () => {
		const { state } = createBattle(duel({ luCell: { x: 1, z: 0 } }));

		const result = accept(
			applyBattleCommand(state, useMove('hero', 'piercing_thrust', { x: 1, z: 0 }))
		);
		const [attacked] = eventsOfType(result.events, 'attacked');

		expect(attacked).toMatchObject({ qiBefore: 100, qiAfter: 75, moveId: 'piercing_thrust' });
		expect(fighter(result.state, 'hero').qi).toBe(75);
	});

	it('rejects a move without enough qi and leaves the state untouched', () => {
		const created = createBattle(duel());
		const state = patchFighter(created.state, 'hero', { qi: 24 });
		const snapshot = JSON.parse(JSON.stringify(state));

		expect(
			rejectionReason(applyBattleCommand(state, useMove('hero', 'piercing_thrust', { x: 1, z: 0 })))
		).toBe('insufficientQi');
		expect(state).toEqual(snapshot);

		const exact = patchFighter(created.state, 'hero', { qi: 25 });
		const result = accept(
			applyBattleCommand(exact, useMove('hero', 'piercing_thrust', { x: 1, z: 0 }))
		);
		expect(fighter(result.state, 'hero').qi).toBe(0);
	});

	it('rejects moves outside the acting fighter art before checking qi', () => {
		const { state } = createBattle(duel());
		const broke = patchFighter(state, 'hero', { qi: 0 });

		expect(
			rejectionReason(applyBattleCommand(state, useMove('hero', 'staff_sweep', { x: 1, z: 0 })))
		).toBe('moveNotOwned');
		expect(
			rejectionReason(
				applyBattleCommand(state, useMove('hero', 'not_a_move' as MoveId, { x: 1, z: 0 }))
			)
		).toBe('moveNotOwned');
		expect(
			rejectionReason(applyBattleCommand(broke, useMove('hero', 'whirling_staff', { x: 1, z: 0 })))
		).toBe('moveNotOwned');
		expect(getMoveTargets(state, 'staff_sweep')).toEqual([]);
		expect(getMoveTargets(broke, 'whirling_staff')).toEqual([]);
	});

	it('rejects aims that are not a legal geometry for the move', () => {
		const { state } = createBattle(duel({ luCell: { x: 3, z: 0 } }));

		for (const aim of [
			{ x: 0, z: 0 },
			{ x: 2, z: 0 },
			{ x: 5, z: 0 },
			{ x: 1, z: 1 }
		]) {
			expect(rejectionReason(applyBattleCommand(state, useMove('hero', 'sword_cut', aim)))).toBe(
				'invalidAim'
			);
		}
	});

	it('ignores friendly fighters and dead defenders when choosing targets', () => {
		const created = createBattle(
			setup([
				placement('hero', { x: 1, z: 1 }, { facing: 'E' }),
				placement('ally', { x: 2, z: 0 }, { template: { agility: 5 }, facing: 'E' }),
				placement('lu', { x: 2, z: 1 }, { side: 'enemy', facing: 'W' }),
				placement('ghost', { x: 2, z: 2 }, { side: 'enemy', facing: 'W' })
			])
		);
		const state = patchFighter(created.state, 'ghost', { health: 0 });

		const result = accept(
			applyBattleCommand(state, useMove('hero', 'cloud_sweep', { x: 2, z: 1 }))
		);
		const [attacked] = eventsOfType(result.events, 'attacked');
		const damaged = eventsOfType(result.events, 'damaged');

		expect(attacked.cells).toEqual([
			{ x: 2, z: 1 },
			{ x: 2, z: 0 },
			{ x: 2, z: 2 }
		]);
		expect(damaged.map((event) => event.targetId)).toEqual(['lu']);
		expect(eventsOfType(result.events, 'defeated')).toEqual([]);
	});

	it('spends area qi once while damaging every living enemy in pattern order', () => {
		const created = createBattle(
			setup([
				placement('hero', { x: 1, z: 1 }, { facing: 'E' }),
				placement('lu', { x: 2, z: 1 }, { side: 'enemy', facing: 'W' }),
				placement('brute', { x: 2, z: 2 }, { side: 'enemy', facing: 'W' })
			])
		);

		const result = accept(
			applyBattleCommand(created.state, useMove('hero', 'cloud_sweep', { x: 2, z: 1 }))
		);

		expect(eventsOfType(result.events, 'attacked')[0]).toMatchObject({
			qiBefore: 100,
			qiAfter: 55
		});
		expect(eventsOfType(result.events, 'damaged').map((event) => event.targetId)).toEqual([
			'lu',
			'brute'
		]);
		expect(fighter(result.state, 'hero').qi).toBe(55);
	});

	it('cannot accept any command once an attack ends the battle', () => {
		const created = createBattle(duel());
		const state = patchFighter(created.state, 'lu', { health: 12 });
		const result = accept(applyBattleCommand(state, useMove('hero', 'sword_cut', { x: 1, z: 0 })));

		expect(result.state.outcome).toBe('victory');
		for (const command of [
			{ type: 'move', actorId: 'hero', cell: { x: 0, z: 1 } },
			useMove('hero', 'sword_cut', { x: 1, z: 0 }),
			{ type: 'guard', actorId: 'hero' },
			{ type: 'gatherQi', actorId: 'hero' },
			{ type: 'endTurn', actorId: 'hero', facing: 'E' }
		] satisfies BattleCommand[]) {
			expect(applyBattleCommand(result.state, command)).toEqual({
				accepted: false,
				reason: 'terminal'
			});
		}
		expect(getMoveTargets(result.state, 'sword_cut')).toEqual([]);
	});
});

describe('multi-target geometry', () => {
	it('hits both thrust cells near to far and resolves each defeat in order', () => {
		const created = createBattle(
			setup([
				placement('hero', { x: 0, z: 0 }, { facing: 'E' }),
				placement('lu', { x: 1, z: 0 }, { side: 'enemy', facing: 'W' }),
				placement('brute', { x: 2, z: 0 }, { side: 'enemy', facing: 'W' })
			])
		);
		const state = patchFighter(created.state, 'lu', { health: 17 });

		const result = accept(
			applyBattleCommand(state, useMove('hero', 'piercing_thrust', { x: 1, z: 0 }))
		);

		expect(eventsOfType(result.events, 'attacked')[0].cells).toEqual([
			{ x: 1, z: 0 },
			{ x: 2, z: 0 }
		]);
		expect(eventTypes(result.events)).toEqual(['attacked', 'damaged', 'defeated', 'damaged']);
		expect(eventsOfType(result.events, 'damaged').map((event) => event.targetId)).toEqual([
			'lu',
			'brute'
		]);
		expect(result.state.outcome).toBe('ongoing');
	});

	it('hits an arc lateral cell even when the centre aim is empty', () => {
		const created = createBattle(
			duel({
				heroCell: { x: 2, z: 2 },
				luCell: { x: 1, z: 3 },
				luFacing: 'N'
			})
		);
		const state = patchFighter(created.state, 'hero', { qi: 45 });

		const result = accept(
			applyBattleCommand(state, useMove('hero', 'cloud_sweep', { x: 1, z: 2 }))
		);
		const [damaged] = eventsOfType(result.events, 'damaged');

		expect(eventsOfType(result.events, 'attacked')[0].aim).toEqual({ x: 1, z: 2 });
		expect(damaged).toMatchObject({ targetId: 'lu', calculated: 30 });
	});

	it('rejects an arc whose every cell is empty or clipped', () => {
		const created = createBattle(
			duel({ heroCell: { x: 2, z: 2 }, luCell: { x: 2, z: 4 }, luFacing: 'N' })
		);

		for (const aim of [
			{ x: 2, z: 1 },
			{ x: 3, z: 2 },
			{ x: 1, z: 2 }
		]) {
			expect(
				rejectionReason(applyBattleCommand(created.state, useMove('hero', 'cloud_sweep', aim)))
			).toBe('invalidAim');
		}
		expect(getMoveTargets(created.state, 'cloud_sweep')).toEqual([]);
	});

	it('clips only blocked arc cells from the affected area', () => {
		const created = createBattle(
			duel({
				heroCell: { x: 1, z: 1 },
				luCell: { x: 2, z: 2 },
				luFacing: 'N',
				terrain: ['..#..', '.....', '.....', '.....', '.....']
			})
		);

		const result = accept(
			applyBattleCommand(created.state, useMove('hero', 'cloud_sweep', { x: 2, z: 1 }))
		);

		expect(eventsOfType(result.events, 'attacked')[0].cells).toEqual([
			{ x: 2, z: 1 },
			{ x: 2, z: 2 }
		]);
		expect(eventsOfType(result.events, 'damaged')[0].targetId).toBe('lu');
	});

	it('blocks darts on obstacles but passes water and occupied cells', () => {
		const blocked = createBattle(
			duel({
				heroCell: { x: 0, z: 0 },
				hero: { externalArtId: 'willow_darts' },
				luCell: { x: 2, z: 0 },
				terrain: ['.#...', '.....', '.....', '.....', '.....']
			})
		);
		expect(
			rejectionReason(
				applyBattleCommand(blocked.state, useMove('hero', 'twin_darts', { x: 2, z: 0 }))
			)
		).toBe('invalidAim');
		expect(
			rejectionReason(
				applyBattleCommand(blocked.state, useMove('hero', 'twin_darts', { x: 1, z: 0 }))
			)
		).toBe('invalidAim');

		const water = createBattle(
			duel({
				heroCell: { x: 0, z: 0 },
				hero: { externalArtId: 'willow_darts' },
				luCell: { x: 2, z: 0 },
				terrain: ['.~...', '.....', '.....', '.....', '.....']
			})
		);
		expect(
			accept(applyBattleCommand(water.state, useMove('hero', 'twin_darts', { x: 2, z: 0 }))).events
				.length
		).toBeGreaterThan(0);

		const occupied = createBattle(
			setup([
				placement(
					'hero',
					{ x: 0, z: 0 },
					{
						facing: 'E',
						template: { externalArtId: 'willow_darts' }
					}
				),
				placement('ally', { x: 0, z: 1 }, { template: { agility: 5 }, facing: 'E' }),
				placement('lu', { x: 0, z: 2 }, { side: 'enemy', facing: 'N' })
			])
		);
		const [damaged] = eventsOfType(
			accept(applyBattleCommand(occupied.state, useMove('hero', 'twin_darts', { x: 0, z: 2 })))
				.events,
			'damaged'
		);
		expect(damaged.targetId).toBe('lu');
	});
});

describe('guard counters', () => {
	it('counters a front attacker with the basic move at 50 percent', () => {
		const created = createBattle(duel());
		const state = patchFighter(created.state, 'lu', { guarding: true });

		const result = accept(applyBattleCommand(state, useMove('hero', 'sword_cut', { x: 1, z: 0 })));
		const [countered] = eventsOfType(result.events, 'countered');
		const counterDamage = eventsOfType(result.events, 'damaged')[1];

		expect(countered).toEqual({
			type: 'countered',
			actorId: 'lu',
			targetId: 'hero',
			moveId: 'sword_cut'
		});
		expect(counterDamage).toMatchObject({
			sourceId: 'lu',
			targetId: 'hero',
			attackPercent: 50,
			facingPercent: 100,
			calculated: 5,
			applied: 5,
			healthBefore: 100,
			healthAfter: 95
		});
		expect(fighter(result.state, 'hero').health).toBe(95);
	});

	it('counters a side attacker', () => {
		const created = createBattle(duel({ luFacing: 'N' }));
		const state = patchFighter(created.state, 'lu', { guarding: true });

		const result = accept(applyBattleCommand(state, useMove('hero', 'sword_cut', { x: 1, z: 0 })));

		expect(eventsOfType(result.events, 'countered')[0]).toMatchObject({
			actorId: 'lu',
			targetId: 'hero'
		});
		expect(eventsOfType(result.events, 'damaged')[0].facingPercent).toBe(125);
	});

	it('never counters a rear or a distant attacker', () => {
		const rear = createBattle(duel({ luFacing: 'E' }));
		const rearState = patchFighter(rear.state, 'lu', { guarding: true });
		const rearResult = accept(
			applyBattleCommand(rearState, useMove('hero', 'sword_cut', { x: 1, z: 0 }))
		);
		expect(eventsOfType(rearResult.events, 'countered')).toEqual([]);

		const distant = createBattle(
			duel({
				heroCell: { x: 0, z: 0 },
				hero: { externalArtId: 'willow_darts' },
				luCell: { x: 0, z: 3 },
				luFacing: 'N'
			})
		);
		const distantState = patchFighter(distant.state, 'lu', { guarding: true });
		const distantResult = accept(
			applyBattleCommand(distantState, useMove('hero', 'twin_darts', { x: 0, z: 3 }))
		);
		expect(eventsOfType(distantResult.events, 'countered')).toEqual([]);
		expect(eventsOfType(distantResult.events, 'damaged')[0]).toMatchObject({
			facingPercent: 100,
			guardPercent: 50
		});
	});

	it('does not let a defender defeated by the primary hit counter while the battle goes on', () => {
		const created = createBattle(
			setup([
				placement('hero', { x: 0, z: 0 }, { facing: 'E' }),
				placement('lu', { x: 1, z: 0 }, { side: 'enemy', facing: 'W' }),
				placement('brute', { x: 3, z: 3 }, { side: 'enemy', facing: 'N' })
			])
		);
		const state = patchFighter(created.state, 'lu', { guarding: true, health: 6 });

		const result = accept(applyBattleCommand(state, useMove('hero', 'sword_cut', { x: 1, z: 0 })));

		expect(eventTypes(result.events)).toEqual(['attacked', 'damaged', 'defeated']);
		expect(eventsOfType(result.events, 'countered')).toEqual([]);
		expect(result.state.outcome).toBe('ongoing');
		expect(fighter(result.state, 'lu').health).toBe(0);
		expect(fighter(result.state, 'brute').health).toBe(100);
	});

	it('does not let a defender defeated by the primary hit counter when it is the last enemy', () => {
		const created = createBattle(duel());
		const state = patchFighter(created.state, 'lu', { guarding: true, health: 6 });

		const result = accept(applyBattleCommand(state, useMove('hero', 'sword_cut', { x: 1, z: 0 })));

		expect(eventTypes(result.events)).toEqual(['attacked', 'damaged', 'defeated', 'battleEnded']);
		expect(eventsOfType(result.events, 'countered')).toEqual([]);
	});

	it('bypasses Guard reduction and the counter for an ignoreGuard move', () => {
		const created = createBattle(
			duel({
				hero: { externalArtId: 'stone_palm' },
				heroFacing: 'E'
			})
		);
		const state = patchFighter(created.state, 'lu', { guarding: true });

		const result = accept(
			applyBattleCommand(state, useMove('hero', 'stone_breaker', { x: 1, z: 0 }))
		);
		const [damaged] = eventsOfType(result.events, 'damaged');

		expect(damaged).toMatchObject({ guardPercent: 100, calculated: 36 });
		expect(eventsOfType(result.events, 'countered')).toEqual([]);
		expect(eventTypes(result.events)).toEqual(['attacked', 'damaged']);
	});

	it('counters only the original attacker with the basic slot, never splashing', () => {
		const created = createBattle(
			setup([
				placement('hero', { x: 0, z: 0 }, { facing: 'E' }),
				placement(
					'monk',
					{ x: 1, z: 0 },
					{
						side: 'enemy',
						facing: 'W',
						template: luTemplate({ externalArtId: 'monk_staff' })
					}
				),
				placement('ally', { x: 1, z: 1 }, { template: { agility: 5 }, facing: 'N' })
			])
		);
		const state = patchFighter(created.state, 'monk', { guarding: true });

		const result = accept(applyBattleCommand(state, useMove('hero', 'sword_cut', { x: 1, z: 0 })));

		expect(eventsOfType(result.events, 'countered')[0].moveId).toBe('staff_sweep');
		expect(eventsOfType(result.events, 'damaged').map((event) => event.targetId)).toEqual([
			'monk',
			'hero'
		]);
		expect(fighter(result.state, 'ally').health).toBe(100);
	});

	it('never chains a counter into another counter', () => {
		const created = createBattle(duel());
		const state = patchFighter(created.state, 'hero', { guarding: true });
		const guarded = patchFighter(state, 'lu', { guarding: true });

		const result = accept(
			applyBattleCommand(guarded, useMove('hero', 'sword_cut', { x: 1, z: 0 }))
		);

		expect(eventsOfType(result.events, 'countered')).toHaveLength(1);
		expect(eventTypes(result.events)).toEqual(['attacked', 'damaged', 'countered', 'damaged']);
		expect(fighter(result.state, 'hero').guarding).toBe(true);
	});

	it.each(['E', 'S', 'W'] as Facing[])(
		"ignores the attacker's stored facing %s and keeps its Iron Body on the counter",
		(heroFacing) => {
			const created = createBattle(
				duel({
					hero: { internalArtId: 'iron_body' },
					heroFacing,
					lu: { power: 14 }
				})
			);
			const state = patchFighter(created.state, 'lu', { guarding: true });

			const result = accept(
				applyBattleCommand(state, useMove('hero', 'sword_cut', { x: 1, z: 0 }))
			);
			const counterDamage = eventsOfType(result.events, 'damaged').find(
				(event) => event.sourceId === 'lu'
			);

			// Front (E), side (S) and rear (W) would be 6, 8 and 10 without the forced front.
			expect(counterDamage).toMatchObject({
				facingPercent: 100,
				passivePercent: 80,
				attackPercent: 50,
				calculated: 6
			});
			expect(fighter(result.state, 'hero').facing).toBe(heroFacing);
			expect(fighter(result.state, 'lu').facing).toBe('W');
		}
	);
});

describe('outcomes and automatic turn handoff', () => {
	it('ends the battle at exact zero health with battleEnded last', () => {
		const created = createBattle(duel());
		const state = patchFighter(created.state, 'lu', { health: 12 });

		const result = accept(applyBattleCommand(state, useMove('hero', 'sword_cut', { x: 1, z: 0 })));

		expect(eventTypes(result.events)).toEqual(['attacked', 'damaged', 'defeated', 'battleEnded']);
		expect(result.events[result.events.length - 1]).toEqual({
			type: 'battleEnded',
			outcome: 'victory'
		});
		expect(result.state.outcome).toBe('victory');
		expect(eventsOfType(result.events, 'turnEnded')).toEqual([]);
	});

	it('loses when the hero falls even with a living ally', () => {
		const created = createBattle(
			setup([
				placement('hero', { x: 0, z: 0 }, { facing: 'E' }),
				placement('lu', { x: 1, z: 0 }, { side: 'enemy', facing: 'W' }),
				placement('ally', { x: 0, z: 2 }, { template: { agility: 5 }, facing: 'N' })
			])
		);
		const state = patchFighter(patchFighter(created.state, 'hero', { health: 5 }), 'lu', {
			guarding: true
		});

		const result = accept(applyBattleCommand(state, useMove('hero', 'sword_cut', { x: 1, z: 0 })));

		expect(eventTypes(result.events)).toEqual([
			'attacked',
			'damaged',
			'countered',
			'damaged',
			'defeated',
			'battleEnded'
		]);
		expect(result.events[result.events.length - 1]).toEqual({
			type: 'battleEnded',
			outcome: 'defeat'
		});
		expect(fighter(result.state, 'ally').health).toBe(100);
	});

	it('takes defeat precedence when the hero and every enemy are dead', () => {
		const created = createBattle(
			setup([
				placement('hero', { x: 0, z: 1 }, { template: { agility: 5 }, facing: 'E' }),
				placement('lu', { x: 1, z: 0 }, { side: 'enemy', facing: 'W' }),
				placement('ally', { x: 0, z: 0 }, { facing: 'E' })
			])
		);
		const state = patchFighter(patchFighter(created.state, 'hero', { health: 0 }), 'lu', {
			health: 12
		});

		const result = accept(applyBattleCommand(state, useMove('ally', 'sword_cut', { x: 1, z: 0 })));

		expect(result.state.outcome).toBe('defeat');
		expect(result.events[result.events.length - 1]).toEqual({
			type: 'battleEnded',
			outcome: 'defeat'
		});
	});

	it('auto-advances a defeated ally turn to the next living fighter', () => {
		const created = createBattle(
			setup([
				placement('hero', { x: 0, z: 0 }, { template: { agility: 5 }, facing: 'N' }),
				placement('ally', { x: 1, z: 1 }, { template: { agility: 15 }, facing: 'E' }),
				placement(
					'lu',
					{ x: 2, z: 1 },
					{
						side: 'enemy',
						template: luTemplate(),
						facing: 'W'
					}
				)
			])
		);
		const state = patchFighter(patchFighter(created.state, 'ally', { health: 5 }), 'lu', {
			guarding: true,
			qi: 90
		});

		const result = accept(applyBattleCommand(state, useMove('ally', 'sword_cut', { x: 2, z: 1 })));

		expect(eventTypes(result.events)).toEqual([
			'attacked',
			'damaged',
			'countered',
			'damaged',
			'defeated',
			'turnEnded',
			'turnStarted'
		]);
		expect(eventsOfType(result.events, 'turnEnded')[0]).toEqual({
			type: 'turnEnded',
			actorId: 'ally',
			facingBefore: 'E',
			facingAfter: 'E'
		});
		expect(eventsOfType(result.events, 'turnStarted')[0]).toEqual({
			type: 'turnStarted',
			actorId: 'lu',
			qiBefore: 90,
			qiAfter: 100
		});
		expect(result.state.outcome).toBe('ongoing');
		expect(result.state.round).toBe(1);
		expect(result.state.turnIndex).toBe(1);
		expect(fighter(result.state, 'lu').guarding).toBe(false);
	});

	it('skips dead turn entries while auto-advancing', () => {
		const created = createBattle(
			setup([
				placement('hero', { x: 0, z: 0 }, { template: { agility: 20 } }),
				placement('ally', { x: 1, z: 1 }, { template: { agility: 15 }, facing: 'E' }),
				placement(
					'ghost',
					{ x: 0, z: 3 },
					{
						side: 'enemy',
						template: luTemplate({ agility: 12 })
					}
				),
				placement(
					'lu',
					{ x: 2, z: 1 },
					{
						side: 'enemy',
						template: luTemplate(),
						facing: 'W'
					}
				)
			])
		);
		const state = activate(
			patchFighter(patchFighter(created.state, 'ally', { health: 5 }), 'ghost', { health: 0 }),
			'ally'
		);
		const withGuard = patchFighter(state, 'lu', { guarding: true });

		const result = accept(
			applyBattleCommand(withGuard, useMove('ally', 'sword_cut', { x: 2, z: 1 }))
		);

		expect(result.state.round).toBe(1);
		expect(result.state.turnIndex).toBe(3);
		expect(eventTypes(result.events)).toEqual([
			'attacked',
			'damaged',
			'countered',
			'damaged',
			'defeated',
			'turnEnded',
			'turnStarted'
		]);
		expect(eventsOfType(result.events, 'turnStarted')[0].actorId).toBe('lu');
	});

	it('auto-advances into a new round when the dying fighter was last', () => {
		const created = createBattle(
			setup([
				placement('hero', { x: 0, z: 0 }, { template: { agility: 20 } }),
				placement('ally', { x: 1, z: 1 }, { template: { agility: 5 }, facing: 'E' }),
				placement('lu', { x: 2, z: 1 }, { side: 'enemy', facing: 'W' })
			])
		);
		const state = activate(
			patchFighter(patchFighter(created.state, 'ally', { health: 5 }), 'hero', {
				guarding: true,
				qi: 95
			}),
			'ally'
		);
		const withGuard = patchFighter(state, 'lu', { guarding: true });

		const result = accept(
			applyBattleCommand(withGuard, useMove('ally', 'sword_cut', { x: 2, z: 1 }))
		);

		expect(result.state.round).toBe(2);
		expect(eventTypes(result.events)).toEqual([
			'attacked',
			'damaged',
			'countered',
			'damaged',
			'defeated',
			'turnEnded',
			'roundStarted',
			'turnStarted'
		]);
		expect(eventsOfType(result.events, 'roundStarted')[0]).toEqual({
			type: 'roundStarted',
			round: 2,
			order: ['hero', 'lu']
		});
		expect(eventsOfType(result.events, 'turnStarted')[0]).toEqual({
			type: 'turnStarted',
			actorId: 'hero',
			qiBefore: 95,
			qiAfter: 100
		});
		expect(fighter(result.state, 'hero').guarding).toBe(false);
	});

	it('auto-advances when a non-last enemy dies to the hero counter', () => {
		const created = createBattle(
			setup([
				placement(
					'e1',
					{ x: 1, z: 0 },
					{
						side: 'enemy',
						facing: 'W',
						template: luTemplate({ agility: 20 })
					}
				),
				placement('e2', { x: 3, z: 0 }, { side: 'enemy', facing: 'W' }),
				placement('hero', { x: 0, z: 0 }, { template: { agility: 5 }, facing: 'E' })
			])
		);
		const state = patchFighter(patchFighter(created.state, 'e1', { health: 6 }), 'hero', {
			guarding: true
		});

		const result = accept(applyBattleCommand(state, useMove('e1', 'sword_cut', { x: 0, z: 0 })));

		expect(eventTypes(result.events)).toEqual([
			'attacked',
			'damaged',
			'countered',
			'damaged',
			'defeated',
			'turnEnded',
			'turnStarted'
		]);
		expect(fighter(result.state, 'hero').health).toBe(95);
		expect(fighter(result.state, 'hero').guarding).toBe(true);
		expect(result.state.outcome).toBe('ongoing');
		expect(eventsOfType(result.events, 'turnStarted')[0].actorId).toBe('e2');
	});
});

describe('getMoveTargets', () => {
	it('lists only aims that hit a living enemy and are accepted unchanged', () => {
		const created = createBattle(duel());
		const snapshot = JSON.parse(JSON.stringify(created.state));
		const targets = getMoveTargets(created.state, 'sword_cut');

		expect(targets).toEqual([{ aim: { x: 1, z: 0 }, cells: [{ x: 1, z: 0 }], targetIds: ['lu'] }]);
		for (const target of targets) {
			expect(
				applyBattleCommand(created.state, useMove('hero', 'sword_cut', target.aim)).accepted
			).toBe(true);
		}
		expect(created.state).toEqual(snapshot);
	});

	it('lists area aims with their affected cells in pattern order', () => {
		const created = createBattle(
			setup([
				placement(
					'hero',
					{ x: 1, z: 1 },
					{
						facing: 'E',
						template: { externalArtId: 'monk_staff' }
					}
				),
				placement('lu', { x: 2, z: 2 }, { side: 'enemy', facing: 'N' })
			])
		);

		expect(getMoveTargets(created.state, 'staff_sweep')).toEqual([
			{
				aim: { x: 2, z: 1 },
				cells: [
					{ x: 2, z: 1 },
					{ x: 2, z: 0 },
					{ x: 2, z: 2 }
				],
				targetIds: ['lu']
			},
			{
				aim: { x: 1, z: 2 },
				cells: [
					{ x: 1, z: 2 },
					{ x: 2, z: 2 },
					{ x: 0, z: 2 }
				],
				targetIds: ['lu']
			}
		]);
	});

	it('recomputes targets after an optional movement command', () => {
		const created = createBattle(duel({ luCell: { x: 2, z: 0 } }));

		expect(getMoveTargets(created.state, 'sword_cut')).toEqual([]);

		const moved = accept(
			applyBattleCommand(created.state, {
				type: 'move',
				actorId: 'hero',
				cell: { x: 1, z: 0 }
			})
		);

		expect(getMoveTargets(moved.state, 'sword_cut').map((target) => target.aim)).toEqual([
			{ x: 2, z: 0 }
		]);
		expect(
			applyBattleCommand(moved.state, useMove('hero', 'sword_cut', { x: 2, z: 0 })).accepted
		).toBe(true);
	});

	it('returns nothing in terminal, acted, unowned, unaffordable or headless states', () => {
		const created = createBattle(duel());

		expect(getMoveTargets({ ...created.state, outcome: 'victory' }, 'sword_cut')).toEqual([]);

		const guarded = accept(applyBattleCommand(created.state, { type: 'guard', actorId: 'hero' }));
		expect(getMoveTargets(guarded.state, 'sword_cut')).toEqual([]);

		const attacked = accept(
			applyBattleCommand(created.state, useMove('hero', 'sword_cut', { x: 1, z: 0 }))
		);
		expect(getMoveTargets(attacked.state, 'sword_cut')).toEqual([]);

		expect(getMoveTargets(created.state, 'staff_sweep')).toEqual([]);
		expect(
			getMoveTargets(patchFighter(created.state, 'hero', { qi: 24 }), 'piercing_thrust')
		).toEqual([]);
		expect(getMoveTargets({ ...created.state, turnIndex: 99 }, 'sword_cut')).toEqual([]);
	});
});

describe('all twelve starter moves through the data path', () => {
	const cases = (Object.keys(EXTERNAL_ARTS) as ExternalArtId[]).flatMap((externalArtId) =>
		(Object.keys(EXTERNAL_ARTS[externalArtId].moves) as MoveSlot[]).map(
			(slot) =>
				[externalArtId, slot, EXTERNAL_ARTS[externalArtId].moves[slot]] as [
					ExternalArtId,
					MoveSlot,
					MoveId
				]
		)
	);

	it('covers every authored move exactly once', () => {
		expect(cases.map(([, , moveId]) => moveId).sort()).toEqual(
			(Object.keys(MOVES) as MoveId[]).sort()
		);
	});

	it.each(cases)('%s %s resolves %s', (externalArtId, _slot, moveId) => {
		const move = MOVES[moveId];
		const created = createBattle(
			duel({
				heroCell: { x: 1, z: 1 },
				hero: { externalArtId },
				luCell: { x: 2, z: 1 },
				luFacing: 'W'
			})
		);

		const result = accept(
			applyBattleCommand(created.state, useMove('hero', moveId, { x: 2, z: 1 }))
		);
		const [attacked] = eventsOfType(result.events, 'attacked');
		const [damaged] = eventsOfType(result.events, 'damaged');
		const expectedCells =
			move.targeting.shape === 'arc'
				? [
						{ x: 2, z: 1 },
						{ x: 2, z: 0 },
						{ x: 2, z: 2 }
					]
				: move.targeting.shape === 'line'
					? [
							{ x: 2, z: 1 },
							{ x: 3, z: 1 }
						]
					: [{ x: 2, z: 1 }];

		expect(attacked).toMatchObject({
			moveId,
			aim: { x: 2, z: 1 },
			cells: expectedCells,
			qiBefore: 100,
			qiAfter: 100 - move.qiCost
		});
		expect(damaged).toMatchObject({
			sourceId: 'hero',
			targetId: 'lu',
			facingPercent: 100,
			coverPercent: 100,
			guardPercent: 100,
			passivePercent: 100,
			attackPercent: 100,
			calculated: move.baseDamage
		});
		expect(fighter(result.state, 'hero').qi).toBe(100 - move.qiCost);
	});
});
