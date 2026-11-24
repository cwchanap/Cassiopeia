import { describe, expect, it } from 'vitest';
import {
	affectedCells,
	applyBattleCommand,
	createBattle,
	forecastMove,
	getMoveTargets,
	getReachableCells,
	getTurnOrder,
	MOVES
} from './index';
import { SECT_HERO_TEMPLATE, SENIOR_BROTHER_LU_TEMPLATE } from './content';
import type {
	BattleCommand,
	BattleCommandResult,
	BattleEvent,
	BattleFighter,
	BattleForecast,
	BattleForecastHit,
	BattleForecastResult,
	BattleRejectionReason,
	BattleSetup,
	BattleState,
	Cell,
	Facing,
	FighterSetup,
	FighterTemplate,
	MoveId
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
};

/** Hero (agility 20) against Lu (agility 10), adjacent by default. */
function duel(options: DuelOptions = {}): BattleSetup {
	return setup([
		placement('hero', options.heroCell ?? { x: 0, z: 0 }, {
			facing: options.heroFacing ?? 'E',
			template: options.hero
		}),
		placement('lu', options.luCell ?? { x: 1, z: 0 }, {
			side: 'enemy',
			facing: options.luFacing ?? 'W',
			template: luTemplate(options.lu)
		})
	]);
}

function accept(result: BattleCommandResult): { state: BattleState; events: BattleEvent[] } {
	if (!result.accepted) {
		throw new Error(`expected an accepted command, got ${result.reason}`);
	}
	return result;
}

function forecastOf(result: BattleForecastResult): BattleForecast {
	if (!result.accepted) {
		throw new Error(`expected an accepted forecast, got ${result.reason}`);
	}
	return result.forecast;
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

/**
 * Asserts that the forecast is exactly the applied command's resolution: the attacked event's qi
 * delta (not a later turn start), one projected hit per damaged event with the counter's move, and
 * the resulting actor HP, outcome, active fighter and round.
 */
function expectForecastToMirror(
	forecast: BattleForecast,
	applied: { state: BattleState; events: BattleEvent[] }
): void {
	const [attacked] = eventsOfType(applied.events, 'attacked');
	if (!attacked) {
		throw new Error('accepted attack emitted no attacked event');
	}
	expect(forecast.qiBefore).toBe(attacked.qiBefore);
	expect(forecast.qiAfter).toBe(attacked.qiAfter);
	expect(forecast.qiCost).toBe(attacked.qiBefore - attacked.qiAfter);

	const hits: BattleForecastHit[] = [];
	const counters: BattleForecastHit[] = [];
	let counterMoveId: MoveId | null = null;
	for (const event of applied.events) {
		if (event.type === 'countered') {
			counterMoveId = event.moveId;
			continue;
		}
		if (event.type !== 'damaged') {
			continue;
		}
		const primary = event.sourceId === forecast.actorId;
		let moveId = attacked.moveId;
		if (!primary) {
			if (!counterMoveId) {
				throw new Error('counter damage without a countered event');
			}
			moveId = counterMoveId;
		}
		(primary ? hits : counters).push({
			sourceId: event.sourceId,
			targetId: event.targetId,
			moveId,
			calculated: event.calculated,
			applied: event.applied,
			facingPercent: event.facingPercent,
			coverPercent: event.coverPercent,
			guardPercent: event.guardPercent,
			passivePercent: event.passivePercent,
			attackPercent: event.attackPercent,
			healthBefore: event.healthBefore,
			healthAfter: event.healthAfter,
			defeated: event.healthAfter === 0
		});
	}

	expect(forecast.hits).toEqual(hits);
	expect(forecast.counters).toEqual(counters);
	expect(forecast.actorHealthAfter).toBe(fighter(applied.state, forecast.actorId).health);
	expect(forecast.actorDefeated).toBe(forecast.actorHealthAfter === 0);
	expect(forecast.outcome).toBe(applied.state.outcome);
	expect(forecast.activeFighterId).toBe(getTurnOrder(applied.state).activeId);
	expect(forecast.round).toBe(applied.state.round);
}

describe('single-hit projection', () => {
	it('projects every mitigation field, HP, qi and the resulting turn', () => {
		const created = createBattle(duel());
		const snapshot = JSON.parse(JSON.stringify(created.state));
		const aim = { x: 1, z: 0 };

		const forecast = forecastOf(forecastMove(created.state, 'hero', 'sword_cut', aim));

		expect(forecast).toEqual({
			actorId: 'hero',
			moveId: 'sword_cut',
			aim: { x: 1, z: 0 },
			qiCost: 0,
			qiBefore: 100,
			qiAfter: 100,
			hits: [
				{
					sourceId: 'hero',
					targetId: 'lu',
					moveId: 'sword_cut',
					calculated: 12,
					applied: 12,
					facingPercent: 100,
					coverPercent: 100,
					guardPercent: 100,
					passivePercent: 100,
					attackPercent: 100,
					healthBefore: 100,
					healthAfter: 88,
					defeated: false
				}
			],
			counters: [],
			actorHealthAfter: 100,
			actorDefeated: false,
			outcome: 'ongoing',
			activeFighterId: 'hero',
			round: 1
		});
		expect(created.state).toEqual(snapshot);

		const applied = accept(applyBattleCommand(created.state, useMove('hero', 'sword_cut', aim)));
		expect(eventTypes(applied.events)).toEqual(['attacked', 'damaged']);
		expectForecastToMirror(forecast, applied);
	});
});

describe('area projection', () => {
	it('projects both hits in pattern order, the guard counter and the actor HP after', () => {
		const created = createBattle(
			setup([
				placement('hero', { x: 1, z: 1 }, { facing: 'E' }),
				placement('lu', { x: 2, z: 1 }, { side: 'enemy', template: luTemplate(), facing: 'W' }),
				placement(
					'brute',
					{ x: 2, z: 2 },
					{
						side: 'enemy',
						template: luTemplate(),
						facing: 'W'
					}
				)
			])
		);
		const state = patchFighter(patchFighter(created.state, 'lu', { guarding: true }), 'brute', {
			guarding: true
		});
		const aim = { x: 2, z: 1 };

		const forecast = forecastOf(forecastMove(state, 'hero', 'cloud_sweep', aim));

		expect(forecast).toMatchObject({
			actorId: 'hero',
			moveId: 'cloud_sweep',
			aim: { x: 2, z: 1 },
			qiCost: 45,
			qiBefore: 100,
			qiAfter: 55,
			actorHealthAfter: 95,
			actorDefeated: false,
			outcome: 'ongoing',
			activeFighterId: 'hero',
			round: 1
		});
		expect(
			forecast.hits.map((hit) => ({
				targetId: hit.targetId,
				moveId: hit.moveId,
				facingPercent: hit.facingPercent,
				guardPercent: hit.guardPercent,
				calculated: hit.calculated,
				applied: hit.applied,
				healthBefore: hit.healthBefore,
				healthAfter: hit.healthAfter,
				attackPercent: hit.attackPercent,
				defeated: hit.defeated
			}))
		).toEqual([
			{
				targetId: 'lu',
				moveId: 'cloud_sweep',
				facingPercent: 100,
				guardPercent: 50,
				calculated: 12,
				applied: 12,
				healthBefore: 100,
				healthAfter: 88,
				attackPercent: 100,
				defeated: false
			},
			{
				targetId: 'brute',
				moveId: 'cloud_sweep',
				facingPercent: 125,
				guardPercent: 50,
				calculated: 15,
				applied: 15,
				healthBefore: 100,
				healthAfter: 85,
				attackPercent: 100,
				defeated: false
			}
		]);
		expect(forecast.counters).toEqual([
			{
				sourceId: 'lu',
				targetId: 'hero',
				moveId: 'sword_cut',
				calculated: 5,
				applied: 5,
				facingPercent: 100,
				coverPercent: 100,
				guardPercent: 100,
				passivePercent: 100,
				attackPercent: 50,
				healthBefore: 100,
				healthAfter: 95,
				defeated: false
			}
		]);

		const applied = accept(applyBattleCommand(state, useMove('hero', 'cloud_sweep', aim)));
		expect(eventTypes(applied.events)).toEqual([
			'attacked',
			'damaged',
			'damaged',
			'countered',
			'damaged'
		]);
		expect(fighter(applied.state, 'hero').qi).toBe(55);
		expectForecastToMirror(forecast, applied);
	});
});

describe('lethal projections', () => {
	it('projects a lethal primary hit as a terminal victory', () => {
		const created = createBattle(duel());
		const state = patchFighter(created.state, 'lu', { health: 12 });
		const aim = { x: 1, z: 0 };

		const forecast = forecastOf(forecastMove(state, 'hero', 'sword_cut', aim));

		expect(forecast.hits).toEqual([
			{
				sourceId: 'hero',
				targetId: 'lu',
				moveId: 'sword_cut',
				calculated: 12,
				applied: 12,
				facingPercent: 100,
				coverPercent: 100,
				guardPercent: 100,
				passivePercent: 100,
				attackPercent: 100,
				healthBefore: 12,
				healthAfter: 0,
				defeated: true
			}
		]);
		expect(forecast.counters).toEqual([]);
		expect(forecast).toMatchObject({
			qiCost: 0,
			actorHealthAfter: 100,
			actorDefeated: false,
			outcome: 'victory',
			activeFighterId: null,
			round: 1
		});

		const applied = accept(applyBattleCommand(state, useMove('hero', 'sword_cut', aim)));
		expect(eventTypes(applied.events)).toEqual(['attacked', 'damaged', 'defeated', 'battleEnded']);
		expectForecastToMirror(forecast, applied);
	});

	it('projects a lethal counter as a terminal hero defeat with the actor qi, not a new turn', () => {
		const created = createBattle(duel());
		const state = patchFighter(patchFighter(created.state, 'hero', { health: 5, qi: 100 }), 'lu', {
			guarding: true
		});
		const aim = { x: 1, z: 0 };

		const forecast = forecastOf(forecastMove(state, 'hero', 'piercing_thrust', aim));

		expect(forecast.hits).toEqual([
			{
				sourceId: 'hero',
				targetId: 'lu',
				moveId: 'piercing_thrust',
				calculated: 8,
				applied: 8,
				facingPercent: 100,
				coverPercent: 100,
				guardPercent: 50,
				passivePercent: 100,
				attackPercent: 100,
				healthBefore: 100,
				healthAfter: 92,
				defeated: false
			}
		]);
		expect(forecast.counters).toEqual([
			{
				sourceId: 'lu',
				targetId: 'hero',
				moveId: 'sword_cut',
				calculated: 5,
				applied: 5,
				facingPercent: 100,
				coverPercent: 100,
				guardPercent: 100,
				passivePercent: 100,
				attackPercent: 50,
				healthBefore: 5,
				healthAfter: 0,
				defeated: true
			}
		]);
		expect(forecast).toMatchObject({
			qiCost: 25,
			qiBefore: 100,
			qiAfter: 75,
			actorHealthAfter: 0,
			actorDefeated: true,
			outcome: 'defeat',
			activeFighterId: null,
			round: 1
		});

		const applied = accept(applyBattleCommand(state, useMove('hero', 'piercing_thrust', aim)));
		expect(eventTypes(applied.events)).toEqual([
			'attacked',
			'damaged',
			'countered',
			'damaged',
			'defeated',
			'battleEnded'
		]);
		expect(eventsOfType(applied.events, 'turnEnded')).toEqual([]);
		expect(fighter(applied.state, 'hero').qi).toBe(75);
		expectForecastToMirror(forecast, applied);
	});

	it('projects a non-terminal counter kill with actor HP zero and the next living turn', () => {
		const created = createBattle(
			setup([
				placement('hero', { x: 0, z: 0 }, { template: { agility: 5 }, facing: 'E' }),
				placement('ally', { x: 1, z: 0 }, { template: { agility: 15 }, facing: 'E' }),
				placement('lu', { x: 2, z: 0 }, { side: 'enemy', template: luTemplate(), facing: 'W' })
			])
		);
		const state = patchFighter(patchFighter(created.state, 'ally', { health: 5 }), 'lu', {
			guarding: true,
			qi: 50
		});
		const aim = { x: 2, z: 0 };

		const forecast = forecastOf(forecastMove(state, 'ally', 'piercing_thrust', aim));

		expect(forecast).toMatchObject({
			actorId: 'ally',
			moveId: 'piercing_thrust',
			qiCost: 25,
			qiBefore: 100,
			qiAfter: 75,
			actorHealthAfter: 0,
			actorDefeated: true,
			outcome: 'ongoing',
			activeFighterId: 'lu',
			round: 1
		});
		expect(forecast.hits[0]).toMatchObject({
			targetId: 'lu',
			calculated: 8,
			applied: 8,
			healthBefore: 100,
			healthAfter: 92
		});
		expect(forecast.counters).toHaveLength(1);
		expect(forecast.counters[0]).toMatchObject({
			sourceId: 'lu',
			targetId: 'ally',
			calculated: 5,
			applied: 5,
			healthBefore: 5,
			healthAfter: 0,
			defeated: true
		});

		const applied = accept(applyBattleCommand(state, useMove('ally', 'piercing_thrust', aim)));
		expect(eventTypes(applied.events)).toEqual([
			'attacked',
			'damaged',
			'countered',
			'damaged',
			'defeated',
			'turnEnded',
			'turnStarted'
		]);
		expect(eventsOfType(applied.events, 'turnStarted')[0]).toEqual({
			type: 'turnStarted',
			actorId: 'lu',
			qiBefore: 50,
			qiAfter: 60
		});
		expect(fighter(applied.state, 'ally').qi).toBe(75);
		expect(fighter(applied.state, 'hero').health).toBe(100);
		expectForecastToMirror(forecast, applied);
	});
});

describe('rejections and immutability', () => {
	it('returns the command rejection reason without mutating either path', () => {
		const created = createBattle(duel());
		const state = patchFighter(created.state, 'hero', { qi: 24 });
		const snapshot = JSON.parse(JSON.stringify(state));

		expect(forecastMove(state, 'hero', 'piercing_thrust', { x: 1, z: 0 })).toEqual({
			accepted: false,
			reason: 'insufficientQi'
		});
		expect(
			rejectionReason(applyBattleCommand(state, useMove('hero', 'piercing_thrust', { x: 1, z: 0 })))
		).toBe('insufficientQi');

		expect(forecastMove(state, 'lu', 'sword_cut', { x: 0, z: 0 })).toEqual({
			accepted: false,
			reason: 'wrongActor'
		});
		expect(
			rejectionReason(applyBattleCommand(state, useMove('lu', 'sword_cut', { x: 0, z: 0 })))
		).toBe('wrongActor');

		expect(forecastMove(state, 'hero', 'sword_cut', { x: 3, z: 0 })).toEqual({
			accepted: false,
			reason: 'invalidAim'
		});
		expect(
			rejectionReason(applyBattleCommand(state, useMove('hero', 'sword_cut', { x: 3, z: 0 })))
		).toBe('invalidAim');
		expect(state).toEqual(snapshot);
	});

	it('repeats forecasts without changing the input or the later command result', () => {
		const created = createBattle(duel());
		const snapshot = JSON.parse(JSON.stringify(created.state));
		const aim = { x: 1, z: 0 };

		const first = forecastMove(created.state, 'hero', 'sword_cut', aim);
		const second = forecastMove(created.state, 'hero', 'sword_cut', aim);

		expect(second).toEqual(first);
		expect(created.state).toEqual(snapshot);

		const applied = applyBattleCommand(created.state, useMove('hero', 'sword_cut', aim));
		const cloned = JSON.parse(JSON.stringify(created.state)) as BattleState;
		expect(applied).toEqual(applyBattleCommand(cloned, useMove('hero', 'sword_cut', aim)));
		expect(created.state).toEqual(snapshot);
	});

	it('preserves forecasts and queries across a JSON round trip', () => {
		const created = createBattle(duel());
		const state = patchFighter(created.state, 'lu', { health: 92 });
		const cloned = JSON.parse(JSON.stringify(state)) as BattleState;
		const aim = { x: 1, z: 0 };

		expect(forecastMove(cloned, 'hero', 'piercing_thrust', aim)).toEqual(
			forecastMove(state, 'hero', 'piercing_thrust', aim)
		);
		expect(applyBattleCommand(cloned, useMove('hero', 'piercing_thrust', aim))).toEqual(
			applyBattleCommand(state, useMove('hero', 'piercing_thrust', aim))
		);
		expect(getReachableCells(cloned)).toEqual(getReachableCells(state));
		expect(getReachableCells(cloned, 'lu')).toEqual(getReachableCells(state, 'lu'));
		expect(getTurnOrder(cloned)).toEqual(getTurnOrder(state));
	});
});

describe('HPA-1311 candidate-state contract', () => {
	const HERO_CELL = { x: 0, z: 0 };
	const ALLY_CELL = { x: 3, z: 3 };
	const LU_CELL = { x: 4, z: 1 };

	function scenario(): BattleSetup {
		return setup([
			placement('hero', HERO_CELL, { facing: 'E' }),
			placement('ally', ALLY_CELL, { template: { agility: 15 }, facing: 'N' }),
			placement('lu', LU_CELL, { side: 'enemy', template: luTemplate(), facing: 'W' })
		]);
	}

	function cellKey(cell: Cell): string {
		return `${cell.x},${cell.z}`;
	}

	it('forecasts attacks from the accepted result of every planned move', () => {
		const created = createBattle(scenario());
		const snapshot = JSON.parse(JSON.stringify(created.state));
		const candidates = getReachableCells(created.state).filter((entry) => entry.cost > 0);

		expect(candidates.length).toBeGreaterThan(0);
		for (const entry of candidates) {
			const moved = accept(
				applyBattleCommand(created.state, { type: 'move', actorId: 'hero', cell: entry.cell })
			).state;
			const forecast = forecastMove(moved, 'hero', 'sword_cut', LU_CELL);
			const command = applyBattleCommand(moved, useMove('hero', 'sword_cut', LU_CELL));

			expect(forecast.accepted).toBe(command.accepted);
			if (!forecast.accepted && !command.accepted) {
				expect(forecast.reason).toBe(command.reason);
			}
			if (forecast.accepted) {
				expect(getMoveTargets(moved, 'sword_cut').map((target) => target.aim)).toContainEqual(
					LU_CELL
				);
				expectForecastToMirror(forecast.forecast, accept(command));
			}
		}
		expect(created.state).toEqual(snapshot);

		// HPA-1311 scores range with the same geometry the resolver uses instead of re-deriving it.
		expect(
			affectedCells(created.state.map, { x: 3, z: 1 }, LU_CELL, MOVES.sword_cut.targeting)
		).toEqual([LU_CELL]);
	});

	it('queries squad approach cells in candidate states with full budgets and correct occupancy', () => {
		const created = createBattle(scenario());
		const candidates = getReachableCells(created.state).filter((entry) => entry.cost > 0);

		for (const entry of candidates) {
			const moved = accept(
				applyBattleCommand(created.state, { type: 'move', actorId: 'hero', cell: entry.cell })
			).state;
			expect(getReachableCells(moved)).toEqual([]);

			const allyCells = getReachableCells(moved, 'ally');
			const occupied = [entry.cell, LU_CELL].map(cellKey);

			expect(allyCells[0]).toEqual({
				cell: { ...ALLY_CELL },
				cost: 0,
				path: [{ ...ALLY_CELL }]
			});
			expect(allyCells.every((cell) => cell.cost <= 3)).toBe(true);
			expect(Math.max(...allyCells.map((cell) => cell.cost))).toBe(3);
			expect(allyCells.some((cell) => occupied.includes(cellKey(cell.cell)))).toBe(false);
			expect(
				allyCells.every((cell) =>
					cell.path.every((pathCell) => !occupied.includes(cellKey(pathCell)))
				)
			).toBe(true);
			expect(allyCells.some((cell) => cell.cell.x === LU_CELL.x && cell.cell.z === LU_CELL.z)).toBe(
				false
			);
			expect(
				allyCells.filter(
					(cell) => Math.abs(cell.cell.x - LU_CELL.x) + Math.abs(cell.cell.z - LU_CELL.z) === 1
				).length
			).toBeGreaterThan(0);

			const guarded = accept(applyBattleCommand(moved, { type: 'guard', actorId: 'hero' })).state;
			expect(getReachableCells(guarded)).toEqual([]);
			expect(getReachableCells(guarded, 'ally')).toEqual(allyCells);
		}

		const approachState = accept(
			applyBattleCommand(created.state, { type: 'move', actorId: 'hero', cell: { x: 4, z: 0 } })
		).state;
		const approachCells = getReachableCells(approachState, 'ally');

		expect(approachCells.find((cell) => cell.cell.x === 3 && cell.cell.z === 1)).toEqual({
			cell: { x: 3, z: 1 },
			cost: 2,
			path: [
				{ x: 3, z: 3 },
				{ x: 3, z: 2 },
				{ x: 3, z: 1 }
			]
		});
		expect(approachCells.find((cell) => cell.cell.x === 4 && cell.cell.z === 2)).toEqual({
			cell: { x: 4, z: 2 },
			cost: 2,
			path: [
				{ x: 3, z: 3 },
				{ x: 3, z: 2 },
				{ x: 4, z: 2 }
			]
		});
		expect(approachCells.some((cell) => cell.cell.x === 4 && cell.cell.z === 1)).toBe(false);
	});
});
