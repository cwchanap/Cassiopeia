import { describe, expect, it } from 'vitest';
import { SECT_HERO_TEMPLATE, SENIOR_BROTHER_LU_TEMPLATE } from './content';
import { affectedCells } from './grid';
import {
	applyBattleCommand,
	createBattle,
	forecastMove,
	getReachableCells,
	getTurnOrder
} from './rules';
import type {
	BattleCommand,
	BattleCommandResult,
	BattleEvent,
	BattleFighter,
	BattleRejectionReason,
	BattleSetup,
	BattleState,
	Cell,
	Facing,
	FighterSetup,
	FighterTemplate
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

function allCommands(actorId: string): BattleCommand[] {
	return [
		{ type: 'move', actorId, cell: { x: 3, z: 0 } },
		{ type: 'useMove', actorId, moveId: 'sword_cut', aim: { x: 3, z: 0 } },
		{ type: 'useItem', actorId, pillId: 'lesser_healing_pill', targetId: actorId },
		{ type: 'guard', actorId },
		{ type: 'gatherQi', actorId },
		{ type: 'endTurn', actorId, facing: 'N' }
	];
}

describe('actor and terminal validation', () => {
	it('rejects commands from a fighter whose turn it is not', () => {
		const { state } = createBattle(starter());
		const snapshot = JSON.parse(JSON.stringify(state));

		for (const command of allCommands('lu')) {
			expect(applyBattleCommand(state, command)).toEqual({
				accepted: false,
				reason: 'wrongActor'
			});
		}
		expect(applyBattleCommand(state, { type: 'guard', actorId: 'nobody' })).toEqual({
			accepted: false,
			reason: 'wrongActor'
		});

		const guarded = accept(applyBattleCommand(state, { type: 'guard', actorId: 'hero' }));
		expect(
			applyBattleCommand(guarded.state, {
				type: 'move',
				actorId: 'lu',
				cell: { x: 3, z: 0 }
			})
		).toEqual({ accepted: false, reason: 'wrongActor' });
		expect(state).toEqual(snapshot);
	});

	it('rejects every command once the battle is over', () => {
		const { state } = createBattle(starter());
		const terminal: BattleState = { ...state, outcome: 'defeat' };
		const snapshot = JSON.parse(JSON.stringify(terminal));

		for (const command of allCommands('hero')) {
			expect(applyBattleCommand(terminal, command)).toEqual({
				accepted: false,
				reason: 'terminal'
			});
		}
		expect(applyBattleCommand(terminal, { type: 'guard', actorId: 'lu' })).toEqual({
			accepted: false,
			reason: 'terminal'
		});
		expect(terminal).toEqual(snapshot);
	});

	it('rejects ending the turn before taking an action', () => {
		const { state } = createBattle(starter());
		const snapshot = JSON.parse(JSON.stringify(state));

		expect(
			rejectionReason(applyBattleCommand(state, { type: 'endTurn', actorId: 'hero', facing: 'E' }))
		).toBe('wrongPhase');
		expect(
			rejectionReason(
				applyBattleCommand(state, { type: 'endTurn', actorId: 'hero', facing: 'X' as Facing })
			)
		).toBe('wrongPhase');
		expect(state).toEqual(snapshot);
	});

	it('rejects a second action', () => {
		const { state } = createBattle(starter());
		const guarded = accept(applyBattleCommand(state, { type: 'guard', actorId: 'hero' }));

		expect(
			rejectionReason(applyBattleCommand(guarded.state, { type: 'guard', actorId: 'hero' }))
		).toBe('wrongPhase');
		expect(
			rejectionReason(applyBattleCommand(guarded.state, { type: 'gatherQi', actorId: 'hero' }))
		).toBe('wrongPhase');
		expect(
			rejectionReason(
				applyBattleCommand(guarded.state, {
					type: 'useMove',
					actorId: 'hero',
					moveId: 'sword_cut',
					aim: { x: 1, z: 0 }
				})
			)
		).toBe('wrongPhase');
		expect(
			rejectionReason(
				applyBattleCommand(guarded.state, {
					type: 'move',
					actorId: 'hero',
					cell: { x: 99, z: 99 }
				})
			)
		).toBe('wrongPhase');
	});

	it('rejects a second movement but still allows the action', () => {
		const { state } = createBattle(starter());
		const moved = accept(
			applyBattleCommand(state, { type: 'move', actorId: 'hero', cell: { x: 2, z: 0 } })
		);

		expect(
			rejectionReason(
				applyBattleCommand(moved.state, {
					type: 'move',
					actorId: 'hero',
					cell: { x: 3, z: 0 }
				})
			)
		).toBe('wrongPhase');

		const guarded = accept(applyBattleCommand(moved.state, { type: 'guard', actorId: 'hero' }));
		expect(guarded.state.fighters[0]).toMatchObject({ guarding: true, cell: { x: 2, z: 0 } });
	});

	it('rejects movement after the action', () => {
		const { state } = createBattle(starter());
		const guarded = accept(applyBattleCommand(state, { type: 'guard', actorId: 'hero' }));

		expect(
			rejectionReason(
				applyBattleCommand(guarded.state, {
					type: 'move',
					actorId: 'hero',
					cell: { x: 1, z: 0 }
				})
			)
		).toBe('wrongPhase');
	});

	it('rejects an invalid facing without changing the state', () => {
		const { state } = createBattle(starter());
		const guarded = accept(applyBattleCommand(state, { type: 'guard', actorId: 'hero' }));
		const snapshot = JSON.parse(JSON.stringify(guarded.state));

		expect(
			rejectionReason(
				applyBattleCommand(guarded.state, {
					type: 'endTurn',
					actorId: 'hero',
					facing: 'X' as Facing
				})
			)
		).toBe('invalidFacing');
		expect(guarded.state).toEqual(snapshot);
	});
});

describe('movement', () => {
	it('moves along the weighted path and records the complete route', () => {
		const { state } = createBattle(
			setup(
				[placement('hero', { x: 0, z: 0 }), placement('lu', { x: 4, z: 4 }, { side: 'enemy' })],
				{ terrain: ['..T..', '.....', '.....', '.....', '.....'] }
			)
		);
		const snapshot = JSON.parse(JSON.stringify(state));

		const moved = accept(
			applyBattleCommand(state, { type: 'move', actorId: 'hero', cell: { x: 3, z: 0 } })
		);

		expect(moved.events).toEqual([
			{
				type: 'moved',
				actorId: 'hero',
				path: [
					{ x: 0, z: 0 },
					{ x: 1, z: 0 },
					{ x: 2, z: 0 },
					{ x: 3, z: 0 }
				]
			}
		]);
		expect(moved.state.fighters[0].cell).toEqual({ x: 3, z: 0 });
		expect(moved.state.hasMoved).toBe(true);
		expect(moved.state.hasActed).toBe(false);
		expect(state).toEqual(snapshot);
	});

	it('rejects cells that are occupied, blocked, outside the map or unchanged', () => {
		const { state } = createBattle(
			setup(
				[
					placement('hero', { x: 0, z: 0 }),
					placement('ally', { x: 1, z: 0 }),
					placement('lu', { x: 2, z: 0 }, { side: 'enemy' })
				],
				{ terrain: ['....#', '.....', '.....', '.....', '.....'] }
			)
		);

		expect(
			rejectionReason(
				applyBattleCommand(state, { type: 'move', actorId: 'hero', cell: { x: 0, z: 0 } })
			)
		).toBe('invalidCell');
		expect(
			rejectionReason(
				applyBattleCommand(state, { type: 'move', actorId: 'hero', cell: { x: 5, z: 0 } })
			)
		).toBe('invalidCell');
		expect(
			rejectionReason(
				applyBattleCommand(state, { type: 'move', actorId: 'hero', cell: { x: 1.5, z: 0 } })
			)
		).toBe('invalidCell');
		expect(
			rejectionReason(
				applyBattleCommand(state, { type: 'move', actorId: 'hero', cell: { x: 4, z: 0 } })
			)
		).toBe('invalidCell');
		expect(
			rejectionReason(
				applyBattleCommand(state, { type: 'move', actorId: 'hero', cell: { x: 1, z: 0 } })
			)
		).toBe('unreachable');
		expect(
			rejectionReason(
				applyBattleCommand(state, { type: 'move', actorId: 'hero', cell: { x: 2, z: 0 } })
			)
		).toBe('unreachable');
	});

	it('rejects water and obstacles as destinations', () => {
		const { state } = createBattle(
			setup(
				[placement('hero', { x: 0, z: 0 }), placement('lu', { x: 4, z: 4 }, { side: 'enemy' })],
				{ terrain: ['..~.#', '.....', '.....', '.....', '.....'] }
			)
		);

		expect(
			rejectionReason(
				applyBattleCommand(state, { type: 'move', actorId: 'hero', cell: { x: 2, z: 0 } })
			)
		).toBe('invalidCell');
		expect(
			rejectionReason(
				applyBattleCommand(state, { type: 'move', actorId: 'hero', cell: { x: 4, z: 0 } })
			)
		).toBe('invalidCell');
	});

	it('rejects destinations beyond the movement budget', () => {
		const { state } = createBattle(starter());

		expect(getReachableCells(state).some((entry) => entry.cell.x === 4 && entry.cell.z === 0)).toBe(
			true
		);
		expect(
			rejectionReason(
				applyBattleCommand(state, { type: 'move', actorId: 'hero', cell: { x: 4, z: 1 } })
			)
		).toBe('unreachable');
	});
});

describe('guard and gather', () => {
	it('guards without changing qi or position and consumes the action', () => {
		const { state } = createBattle(starter());
		const snapshot = JSON.parse(JSON.stringify(state));

		const guarded = accept(applyBattleCommand(state, { type: 'guard', actorId: 'hero' }));

		expect(guarded.events).toEqual([{ type: 'guarded', actorId: 'hero' }]);
		expect(guarded.state.fighters[0]).toMatchObject({
			guarding: true,
			qi: 100,
			cell: { x: 0, z: 0 }
		});
		expect(guarded.state.hasActed).toBe(true);
		expect(guarded.state.hasMoved).toBe(false);
		expect(state).toEqual(snapshot);
	});

	it('gathers a fixed 20 plus the internal bonus, capped at maximum', () => {
		const { state } = createBattle(starter());
		const low = patchFighter(state, 'hero', { qi: 50 });

		const gathered = accept(applyBattleCommand(low, { type: 'gatherQi', actorId: 'hero' }));

		expect(gathered.events).toEqual([
			{ type: 'qiGathered', actorId: 'hero', qiBefore: 50, qiAfter: 80 }
		]);
		expect(gathered.state.fighters[0].qi).toBe(80);
		expect(gathered.state.hasActed).toBe(true);

		const nearFull = patchFighter(state, 'hero', { qi: 90 });
		const capped = accept(applyBattleCommand(nearFull, { type: 'gatherQi', actorId: 'hero' }));

		expect(capped.events).toEqual([
			{ type: 'qiGathered', actorId: 'hero', qiBefore: 90, qiAfter: 100 }
		]);
	});

	it('gathers without a bonus for Iron Body', () => {
		const { state } = createBattle(
			setup([
				placement(
					'hero',
					{ x: 0, z: 0 },
					{
						template: { ...SECT_HERO_TEMPLATE, internalArtId: 'iron_body' }
					}
				),
				placement('lu', { x: 4, z: 4 }, { side: 'enemy' })
			])
		);
		const low = patchFighter(state, 'hero', { qi: 30 });

		const gathered = accept(applyBattleCommand(low, { type: 'gatherQi', actorId: 'hero' }));

		expect(gathered.events).toEqual([
			{ type: 'qiGathered', actorId: 'hero', qiBefore: 30, qiAfter: 50 }
		]);
	});

	it('allows Gather at full qi', () => {
		const { state } = createBattle(starter());

		const gathered = accept(applyBattleCommand(state, { type: 'gatherQi', actorId: 'hero' }));

		expect(gathered.events).toEqual([
			{ type: 'qiGathered', actorId: 'hero', qiBefore: 100, qiAfter: 100 }
		]);
		expect(gathered.state.fighters[0].qi).toBe(100);
		expect(gathered.state.hasActed).toBe(true);
	});
});

describe('endTurn', () => {
	it('applies the chosen facing and advances once', () => {
		const { state } = createBattle(starter());
		const guarded = accept(applyBattleCommand(state, { type: 'guard', actorId: 'hero' }));

		const ended = accept(
			applyBattleCommand(guarded.state, { type: 'endTurn', actorId: 'hero', facing: 'S' })
		);

		expect(ended.events).toEqual([
			{ type: 'turnEnded', actorId: 'hero', facingBefore: 'E', facingAfter: 'S' },
			{ type: 'turnStarted', actorId: 'lu', qiBefore: 100, qiAfter: 100 }
		]);
		expect(ended.state.fighters[0].facing).toBe('S');
		expect(ended.state.turnIndex).toBe(1);
		expect(ended.state.hasMoved).toBe(false);
		expect(ended.state.hasActed).toBe(false);
		expect(getTurnOrder(ended.state).activeId).toBe('lu');
	});

	it('keeps an unchanged facing while still advancing', () => {
		const { state } = createBattle(starter());
		const guarded = accept(applyBattleCommand(state, { type: 'guard', actorId: 'hero' }));

		const ended = accept(
			applyBattleCommand(guarded.state, { type: 'endTurn', actorId: 'hero', facing: 'E' })
		);

		expect(ended.events[0]).toEqual({
			type: 'turnEnded',
			actorId: 'hero',
			facingBefore: 'E',
			facingAfter: 'E'
		});
		expect(ended.state.fighters[0].facing).toBe('E');
		expect(getTurnOrder(ended.state).activeId).toBe('lu');
	});

	it('emits turnEnded, roundStarted and turnStarted when the round wraps', () => {
		const { state } = createBattle(starter());
		const heroGuarded = accept(applyBattleCommand(state, { type: 'guard', actorId: 'hero' }));
		const heroEnded = accept(
			applyBattleCommand(heroGuarded.state, {
				type: 'endTurn',
				actorId: 'hero',
				facing: 'E'
			})
		);
		const luGuarded = accept(applyBattleCommand(heroEnded.state, { type: 'guard', actorId: 'lu' }));

		const luEnded = accept(
			applyBattleCommand(luGuarded.state, { type: 'endTurn', actorId: 'lu', facing: 'W' })
		);

		expect(luEnded.events).toEqual([
			{ type: 'turnEnded', actorId: 'lu', facingBefore: 'W', facingAfter: 'W' },
			{ type: 'roundStarted', round: 2, order: ['hero', 'lu'] },
			{ type: 'turnStarted', actorId: 'hero', qiBefore: 100, qiAfter: 100 }
		]);
		expect(luEnded.state.round).toBe(2);
		expect(luEnded.state.turnIndex).toBe(0);
	});

	it('allows ending after movement and an action', () => {
		const { state } = createBattle(starter());
		const moved = accept(
			applyBattleCommand(state, { type: 'move', actorId: 'hero', cell: { x: 2, z: 0 } })
		);
		const guarded = accept(applyBattleCommand(moved.state, { type: 'guard', actorId: 'hero' }));

		const ended = accept(
			applyBattleCommand(guarded.state, { type: 'endTurn', actorId: 'hero', facing: 'S' })
		);

		expect(ended.state.fighters[0]).toMatchObject({
			cell: { x: 2, z: 0 },
			facing: 'S',
			guarding: true
		});
		expect(getTurnOrder(ended.state).activeId).toBe('lu');
	});
});

describe('reachable cells', () => {
	it("returns the active fighter's legal movement including its own cell", () => {
		const { state } = createBattle(starter());

		const reachable = getReachableCells(state);

		expect(reachable[0]).toEqual({
			cell: { x: 0, z: 0 },
			cost: 0,
			path: [{ x: 0, z: 0 }]
		});
		expect(reachable.find((entry) => entry.cell.x === 4 && entry.cell.z === 0)?.cost).toBe(4);
		expect(reachable.some((entry) => entry.cell.x === 4 && entry.cell.z === 1)).toBe(false);
	});

	it('returns nothing for the active fighter after moving or acting', () => {
		const { state } = createBattle(starter());
		const moved = accept(
			applyBattleCommand(state, { type: 'move', actorId: 'hero', cell: { x: 2, z: 0 } })
		);

		expect(getReachableCells(moved.state)).toEqual([]);
		expect(getReachableCells(moved.state, 'hero').length).toBeGreaterThan(1);

		const guarded = accept(applyBattleCommand(state, { type: 'guard', actorId: 'hero' }));
		expect(getReachableCells(guarded.state)).toEqual([]);
		expect(getReachableCells(guarded.state, 'hero').length).toBeGreaterThan(1);
	});

	it('gives an explicit non-active fighter its full budget regardless of phase or turn', () => {
		const { state } = createBattle(starter());
		const luCells = getReachableCells(state, 'lu');

		expect(luCells.find((entry) => entry.cell.x === 4 && entry.cell.z === 1)?.cost).toBe(3);
		expect(luCells.find((entry) => entry.cell.x === 4 && entry.cell.z === 2)).toEqual({
			cell: { x: 4, z: 2 },
			cost: 2,
			path: [
				{ x: 4, z: 4 },
				{ x: 4, z: 3 },
				{ x: 4, z: 2 }
			]
		});
		expect(luCells.some((entry) => entry.cell.x === 4 && entry.cell.z === 0)).toBe(false);

		const moved = accept(
			applyBattleCommand(state, { type: 'move', actorId: 'hero', cell: { x: 2, z: 0 } })
		);
		expect(getReachableCells(moved.state, 'lu')).toEqual(luCells);

		const heroGuarded = accept(applyBattleCommand(state, { type: 'guard', actorId: 'hero' }));
		const heroEnded = accept(
			applyBattleCommand(heroGuarded.state, {
				type: 'endTurn',
				actorId: 'hero',
				facing: 'E'
			})
		);
		const luGuarded = accept(applyBattleCommand(heroEnded.state, { type: 'guard', actorId: 'lu' }));
		expect(
			getReachableCells(luGuarded.state, 'lu').some(
				(entry) => entry.cell.x === 4 && entry.cell.z === 1
			)
		).toBe(true);
	});

	it('blocks other fighters for an explicit non-active query', () => {
		const { state } = createBattle(
			setup([placement('hero', { x: 3, z: 4 }), placement('lu', { x: 4, z: 4 }, { side: 'enemy' })])
		);

		const luCells = getReachableCells(state, 'lu');

		expect(luCells.some((entry) => entry.cell.x === 3 && entry.cell.z === 4)).toBe(false);
		expect(
			luCells.every((entry) => entry.path.every((cell) => !(cell.x === 3 && cell.z === 4)))
		).toBe(true);
	});

	it('adds the internal art movement bonus to the budget', () => {
		const { state } = createBattle(
			setup([
				placement(
					'hero',
					{ x: 0, z: 0 },
					{
						template: { ...SECT_HERO_TEMPLATE, internalArtId: 'flowing_cloud_steps' }
					}
				),
				placement('lu', { x: 4, z: 4 }, { side: 'enemy' })
			])
		);

		expect(getReachableCells(state).some((entry) => entry.cell.x === 4 && entry.cell.z === 1)).toBe(
			true
		);

		const withoutBonus = createBattle(starter());
		expect(
			getReachableCells(withoutBonus.state).some(
				(entry) => entry.cell.x === 4 && entry.cell.z === 1
			)
		).toBe(false);
	});

	it('blocks occupied cells from both sides without offering them as destinations', () => {
		const { state } = createBattle(
			setup([
				placement('hero', { x: 0, z: 0 }),
				placement('ally', { x: 1, z: 0 }),
				placement('lu', { x: 2, z: 0 }, { side: 'enemy' })
			])
		);

		const reachable = getReachableCells(state);
		const occupied = ['1,0', '2,0'];

		expect(reachable.some((entry) => occupied.includes(`${entry.cell.x},${entry.cell.z}`))).toBe(
			false
		);
		expect(
			reachable.every((entry) =>
				entry.path.every((cell) => !occupied.includes(`${cell.x},${cell.z}`))
			)
		).toBe(true);
		expect(reachable.some((entry) => entry.cell.x === 2 && entry.cell.z === 1)).toBe(true);
	});

	it('ignores defeated fighters as obstacles', () => {
		const { state } = createBattle(
			setup([
				placement('hero', { x: 0, z: 0 }),
				placement('ally', { x: 1, z: 0 }),
				placement('lu', { x: 2, z: 0 }, { side: 'enemy' })
			])
		);

		const reachable = getReachableCells(patchFighter(state, 'ally', { health: 0 }));

		expect(reachable.find((entry) => entry.cell.x === 1 && entry.cell.z === 0)?.cost).toBe(1);
	});

	it('returns nothing for terminal battles, defeated fighters or unknown IDs', () => {
		const { state } = createBattle(starter());

		expect(getReachableCells({ ...state, outcome: 'victory' })).toEqual([]);
		expect(getReachableCells({ ...state, outcome: 'victory' }, 'hero')).toEqual([]);

		const deadHero = patchFighter(state, 'hero', { health: 0 });
		expect(getReachableCells(deadHero)).toEqual([]);
		expect(getReachableCells(deadHero, 'hero')).toEqual([]);
		expect(getReachableCells(state, 'nobody')).toEqual([]);
	});

	it('does not mutate the battle state while querying', () => {
		const { state } = createBattle(starter());
		const snapshot = JSON.parse(JSON.stringify(state));

		getReachableCells(state);
		getReachableCells(state, 'lu');

		expect(state).toEqual(snapshot);
	});

	it('returns exactly the destinations a move command accepts', () => {
		const { state } = createBattle(starter());

		for (const entry of getReachableCells(state).filter((candidate) => candidate.cost > 0)) {
			expect(
				applyBattleCommand(state, {
					type: 'move',
					actorId: 'hero',
					cell: entry.cell
				}).accepted
			).toBe(true);
		}
	});
});

describe('grid and public data boundary', () => {
	it('rejects a fractional diagonal line aim that the grid also refuses', () => {
		const { state } = createBattle(starter());

		expect(
			applyBattleCommand(state, {
				type: 'useMove',
				actorId: 'hero',
				moveId: 'piercing_thrust',
				aim: { x: 0.5, z: 0.5 }
			})
		).toEqual({ accepted: false, reason: 'invalidAim' });
	});

	it('rejects an aim whose fractional offset cancels to a cardinal step', () => {
		const { state } = createBattle(starter());
		const aim = { x: 1e-20, z: 0 };

		expect(affectedCells(state.map, { x: 1, z: 0 }, aim, { shape: 'single', range: 1 })).toEqual(
			[]
		);
		expect(affectedCells(state.map, { x: 1, z: 0 }, aim, { shape: 'line', length: 2 })).toEqual([]);
		expect(
			applyBattleCommand(state, {
				type: 'useMove',
				actorId: 'hero',
				moveId: 'sword_cut',
				aim
			})
		).toEqual({ accepted: false, reason: 'invalidAim' });
		expect(
			applyBattleCommand(state, {
				type: 'useMove',
				actorId: 'hero',
				moveId: 'piercing_thrust',
				aim
			})
		).toEqual({ accepted: false, reason: 'invalidAim' });
	});

	it('strips caller metadata, aliases and negative zero at the public boundary', () => {
		const spawned = setup(
			[
				{
					...placement('hero', { x: 0, z: 0 }, { facing: 'E' }),
					cell: { x: -0, z: 0, label: 'spawn' } as Cell
				},
				placement('lu', { x: 2, z: 0 }, { side: 'enemy', facing: 'W' })
			],
			{
				squadBag: {
					lesser_healing_pill: 1,
					training_sword: 2
				} as unknown as BattleSetup['squadBag']
			}
		);
		const created = createBattle(spawned);

		expect(created.state.fighters[0].cell).toEqual({ x: 0, z: 0 });
		expect('label' in created.state.fighters[0].cell).toBe(false);
		expect(Object.is(created.state.fighters[0].cell.x, -0)).toBe(false);
		expect(created.state.squadBag).toEqual({ lesser_healing_pill: 1 });
		expect(JSON.parse(JSON.stringify(created))).toEqual(created);

		const moved = accept(
			applyBattleCommand(created.state, {
				type: 'move',
				actorId: 'hero',
				cell: { x: 1, z: 0, label: 'move' } as Cell
			})
		);
		expect(moved.state.fighters[0].cell).toEqual({ x: 1, z: 0 });
		expect(JSON.parse(JSON.stringify(moved))).toEqual(moved);

		const taggedAim = { x: 2, z: 0, label: 'aim' } as Cell;
		const forecast = forecastMove(moved.state, 'hero', 'sword_cut', taggedAim);
		expect(forecast.accepted).toBe(true);
		if (!forecast.accepted) {
			throw new Error(`expected an accepted forecast, got ${forecast.reason}`);
		}
		expect(forecast.forecast.aim).toEqual({ x: 2, z: 0 });
		expect(JSON.parse(JSON.stringify(forecast))).toEqual(forecast);

		const attacked = accept(
			applyBattleCommand(moved.state, {
				type: 'useMove',
				actorId: 'hero',
				moveId: 'sword_cut',
				aim: taggedAim
			})
		);
		expect(attacked.events[0]).toMatchObject({ type: 'attacked', aim: { x: 2, z: 0 } });
		expect(JSON.parse(JSON.stringify(attacked))).toEqual(attacked);
	});
});

describe('isolation and serialization', () => {
	it('returns fresh state and event snapshots without mutating the input', () => {
		const { state } = createBattle(starter());
		const snapshot = JSON.parse(JSON.stringify(state));

		const moved = accept(
			applyBattleCommand(state, { type: 'move', actorId: 'hero', cell: { x: 2, z: 0 } })
		);

		expect(state).toEqual(snapshot);
		expect(moved.state).not.toBe(state);
		expect(moved.state.map).not.toBe(state.map);
		expect(moved.state.map.terrain).not.toBe(state.map.terrain);
		expect(moved.state.map.terrain[0]).not.toBe(state.map.terrain[0]);
		expect(moved.state.fighters).not.toBe(state.fighters);
		expect(moved.state.fighters[0]).not.toBe(state.fighters[0]);
		expect(moved.state.turnOrder).not.toBe(state.turnOrder);
		expect(moved.state.squadBag).not.toBe(state.squadBag);

		const path = moved.events[0].type === 'moved' ? moved.events[0].path : [];
		moved.state.map.width = 99;
		moved.state.map.terrain[0][0] = 'obstacle';
		moved.state.fighters[0].cell.x = 4;
		moved.state.fighters[0].health = 1;
		moved.state.turnOrder.push('lu');

		expect(state).toEqual(snapshot);
		expect(state.map.width).toBe(5);
		expect(state.map.terrain[0][0]).toBe('ground');
		expect(path).toEqual([
			{ x: 0, z: 0 },
			{ x: 1, z: 0 },
			{ x: 2, z: 0 }
		]);
	});

	it('preserves commands and queries across a JSON round trip', () => {
		let state = createBattle(starter()).state;
		state = accept(
			applyBattleCommand(state, { type: 'move', actorId: 'hero', cell: { x: 2, z: 0 } })
		).state;
		state = accept(applyBattleCommand(state, { type: 'guard', actorId: 'hero' })).state;
		state = accept(
			applyBattleCommand(state, { type: 'endTurn', actorId: 'hero', facing: 'S' })
		).state;

		const cloned = JSON.parse(JSON.stringify(state)) as BattleState;
		const next: BattleCommand = { type: 'gatherQi', actorId: 'lu' };

		expect(cloned).toEqual(state);
		expect(applyBattleCommand(cloned, next)).toEqual(applyBattleCommand(state, next));
		expect(getReachableCells(cloned)).toEqual(getReachableCells(state));
		expect(getReachableCells(cloned, 'hero')).toEqual(getReachableCells(state, 'hero'));
		expect(getTurnOrder(cloned)).toEqual(getTurnOrder(state));
	});
});
