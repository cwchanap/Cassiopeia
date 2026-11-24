import { describe, expect, it } from 'vitest';
import { applyBattleCommand, createBattle, getTurnOrder } from './index';
import { SECT_HERO_TEMPLATE, SENIOR_BROTHER_LU_TEMPLATE } from './content';
import type {
	BattleCommand,
	BattleCommandResult,
	BattleEvent,
	BattleFighter,
	BattlePillId,
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

function standardFighters(): FighterSetup[] {
	return [
		placement('hero', { x: 0, z: 0 }, { facing: 'E' }),
		placement('ally', { x: 0, z: 1 }, { template: { agility: 15 }, facing: 'N' }),
		placement(
			'lu',
			{ x: 4, z: 4 },
			{ side: 'enemy', template: SENIOR_BROTHER_LU_TEMPLATE, facing: 'W' }
		)
	];
}

/** Hero (agility 20) with an adjacent ally (15) against Lu (10) and a shared squad bag. */
function squad(
	bag: Partial<Record<BattlePillId, number>> = {
		lesser_healing_pill: 2,
		lesser_qi_pill: 2
	},
	fighters: FighterSetup[] = standardFighters()
): BattleSetup {
	return setup(fighters, { squadBag: bag });
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

function fighter(state: BattleState, id: string): BattleFighter {
	const found = state.fighters.find((candidate) => candidate.id === id);
	if (!found) {
		throw new Error(`unknown fighter: ${id}`);
	}
	return found;
}

function useItem(actorId: string, pillId: BattlePillId, targetId: string): BattleCommand {
	return { type: 'useItem', actorId, pillId, targetId };
}

describe('shared squad bag use', () => {
	it('heals the acting fighter, spends one pill and the action', () => {
		const state = patchFighter(createBattle(squad()).state, 'hero', { health: 50, qi: 40 });
		const snapshot = JSON.parse(JSON.stringify(state));

		const result = accept(
			applyBattleCommand(state, useItem('hero', 'lesser_healing_pill', 'hero'))
		);

		expect(result.events).toEqual([
			{
				type: 'itemUsed',
				actorId: 'hero',
				targetId: 'hero',
				pillId: 'lesser_healing_pill',
				resource: 'health',
				amount: 35,
				resourceBefore: 50,
				resourceAfter: 85,
				bagCount: 1
			}
		]);
		expect(fighter(result.state, 'hero')).toMatchObject({ health: 85, qi: 40 });
		expect(result.state.squadBag).toEqual({ lesser_healing_pill: 1, lesser_qi_pill: 2 });
		expect(result.state).toMatchObject({ hasMoved: false, hasActed: true });
		expect(state).toEqual(snapshot);
	});

	it('heals an adjacent ally without touching the actor', () => {
		const state = patchFighter(createBattle(squad()).state, 'ally', { health: 20 });

		const result = accept(
			applyBattleCommand(state, useItem('hero', 'lesser_healing_pill', 'ally'))
		);

		expect(result.events).toEqual([
			{
				type: 'itemUsed',
				actorId: 'hero',
				targetId: 'ally',
				pillId: 'lesser_healing_pill',
				resource: 'health',
				amount: 35,
				resourceBefore: 20,
				resourceAfter: 55,
				bagCount: 1
			}
		]);
		expect(fighter(result.state, 'ally').health).toBe(55);
		expect(fighter(result.state, 'hero')).toMatchObject({ health: 100, qi: 100 });
	});

	it('restores qi on an adjacent ally and leaves the acting fighter qi alone', () => {
		const state = patchFighter(createBattle(squad()).state, 'ally', { qi: 55 });

		const result = accept(applyBattleCommand(state, useItem('hero', 'lesser_qi_pill', 'ally')));

		expect(result.events).toEqual([
			{
				type: 'itemUsed',
				actorId: 'hero',
				targetId: 'ally',
				pillId: 'lesser_qi_pill',
				resource: 'qi',
				amount: 35,
				resourceBefore: 55,
				resourceAfter: 90,
				bagCount: 1
			}
		]);
		expect(fighter(result.state, 'ally').qi).toBe(90);
		expect(fighter(result.state, 'hero').qi).toBe(100);
		expect(result.state.squadBag).toEqual({ lesser_healing_pill: 2, lesser_qi_pill: 1 });
	});

	it('clamps restoration at the target maximum and reports the actual amount', () => {
		const injured = patchFighter(createBattle(squad()).state, 'hero', { health: 90 });
		const healed = accept(
			applyBattleCommand(injured, useItem('hero', 'lesser_healing_pill', 'hero'))
		);

		expect(healed.events[0]).toMatchObject({ amount: 10, resourceBefore: 90, resourceAfter: 100 });
		expect(fighter(healed.state, 'hero').health).toBe(100);

		const drained = patchFighter(createBattle(squad()).state, 'hero', { qi: 80 });
		const refilled = accept(applyBattleCommand(drained, useItem('hero', 'lesser_qi_pill', 'hero')));

		expect(refilled.events[0]).toMatchObject({
			resource: 'qi',
			amount: 20,
			resourceBefore: 80,
			resourceAfter: 100
		});
		expect(fighter(refilled.state, 'hero').qi).toBe(100);
	});

	it('lets another squad fighter spend the shared bag on itself', () => {
		let state = patchFighter(createBattle(squad()).state, 'ally', { health: 30 });
		state = accept(applyBattleCommand(state, { type: 'guard', actorId: 'hero' })).state;
		state = accept(
			applyBattleCommand(state, { type: 'endTurn', actorId: 'hero', facing: 'E' })
		).state;
		expect(getTurnOrder(state).activeId).toBe('ally');

		const healed = accept(
			applyBattleCommand(state, useItem('ally', 'lesser_healing_pill', 'ally'))
		);

		expect(healed.events[0]).toMatchObject({
			actorId: 'ally',
			targetId: 'ally',
			amount: 35,
			resourceBefore: 30,
			resourceAfter: 65,
			bagCount: 1
		});
		expect(fighter(healed.state, 'ally').health).toBe(65);
		expect(healed.state.squadBag).toEqual({ lesser_healing_pill: 1, lesser_qi_pill: 2 });
	});

	it('rejects a target whose resource is already full without spending the pill or action', () => {
		const full = createBattle(squad()).state;
		const actorInjured = patchFighter(full, 'hero', { health: 50 });

		const cases: { state: BattleState; command: BattleCommand }[] = [
			{ state: full, command: useItem('hero', 'lesser_healing_pill', 'hero') },
			{ state: full, command: useItem('hero', 'lesser_qi_pill', 'hero') },
			{ state: actorInjured, command: useItem('hero', 'lesser_healing_pill', 'ally') }
		];

		for (const { state, command } of cases) {
			const snapshot = JSON.parse(JSON.stringify(state));
			expect(applyBattleCommand(state, command)).toEqual({
				accepted: false,
				reason: 'resourceFull'
			});
			expect(state).toEqual(snapshot);
			expect(state.squadBag).toEqual({ lesser_healing_pill: 2, lesser_qi_pill: 2 });
			expect(state.hasActed).toBe(false);
		}
	});
});

describe('bag and target rejections', () => {
	it('rejects an absent pill and a depleted pill', () => {
		const missing = patchFighter(createBattle(squad({ lesser_qi_pill: 1 })).state, 'hero', {
			health: 50
		});
		expect(
			rejectionReason(applyBattleCommand(missing, useItem('hero', 'lesser_healing_pill', 'hero')))
		).toBe('invalidItem');

		const empty = patchFighter(createBattle(setup(standardFighters())).state, 'hero', {
			health: 50
		});
		expect(
			rejectionReason(applyBattleCommand(empty, useItem('hero', 'lesser_healing_pill', 'hero')))
		).toBe('invalidItem');

		// Deplete the only pill, then come back around to the hero's next turn.
		let state = patchFighter(createBattle(squad({ lesser_healing_pill: 1 })).state, 'hero', {
			health: 50
		});
		const used = accept(applyBattleCommand(state, useItem('hero', 'lesser_healing_pill', 'hero')));
		expect(used.events[0]).toMatchObject({ bagCount: 0, resourceBefore: 50, resourceAfter: 85 });
		state = used.state;
		expect(state.squadBag).toEqual({});
		state = accept(
			applyBattleCommand(state, { type: 'endTurn', actorId: 'hero', facing: 'E' })
		).state;
		state = accept(applyBattleCommand(state, { type: 'guard', actorId: 'ally' })).state;
		state = accept(
			applyBattleCommand(state, { type: 'endTurn', actorId: 'ally', facing: 'N' })
		).state;
		state = accept(applyBattleCommand(state, { type: 'guard', actorId: 'lu' })).state;
		state = accept(
			applyBattleCommand(state, { type: 'endTurn', actorId: 'lu', facing: 'W' })
		).state;
		expect(getTurnOrder(state)).toMatchObject({ round: 2, activeId: 'hero' });

		const snapshot = JSON.parse(JSON.stringify(state));
		expect(
			rejectionReason(applyBattleCommand(state, useItem('hero', 'lesser_healing_pill', 'hero')))
		).toBe('invalidItem');
		expect(state).toEqual(snapshot);
		expect(fighter(state, 'hero').health).toBe(85);
	});

	it('rejects enemy, defeated, diagonal and unknown targets', () => {
		const adjacentEnemy = createBattle(
			setup(
				[
					placement('hero', { x: 1, z: 1 }, { facing: 'E' }),
					placement(
						'lu',
						{ x: 2, z: 1 },
						{
							side: 'enemy',
							template: SENIOR_BROTHER_LU_TEMPLATE,
							facing: 'W'
						}
					),
					placement('ally', { x: 1, z: 2 }, { template: { agility: 5 } })
				],
				{ squadBag: { lesser_healing_pill: 1 } }
			)
		);
		const diagonal = createBattle(
			setup(
				[
					placement('hero', { x: 0, z: 0 }),
					placement('ally', { x: 1, z: 1 }, { template: { agility: 5 } }),
					placement('lu', { x: 4, z: 4 }, { side: 'enemy' })
				],
				{ squadBag: { lesser_healing_pill: 1 } }
			)
		);
		const defeated = createBattle(squad());

		const cases: { state: BattleState; command: BattleCommand }[] = [
			{
				state: patchFighter(adjacentEnemy.state, 'hero', { health: 50 }),
				command: useItem('hero', 'lesser_healing_pill', 'lu')
			},
			{
				state: patchFighter(defeated.state, 'ally', { health: 0 }),
				command: useItem('hero', 'lesser_healing_pill', 'ally')
			},
			{
				state: patchFighter(diagonal.state, 'hero', { health: 50 }),
				command: useItem('hero', 'lesser_healing_pill', 'ally')
			},
			{
				state: patchFighter(createBattle(squad()).state, 'hero', { health: 50 }),
				command: useItem('hero', 'lesser_healing_pill', 'nobody')
			}
		];

		for (const { state, command } of cases) {
			const snapshot = JSON.parse(JSON.stringify(state));
			expect(applyBattleCommand(state, command)).toEqual({
				accepted: false,
				reason: 'invalidTarget'
			});
			expect(state).toEqual(snapshot);
		}
	});

	it('rejects an enemy actor and a squad fighter whose turn it is not', () => {
		const enemyFirst = createBattle(
			setup(
				[
					placement(
						'lu',
						{ x: 4, z: 4 },
						{
							side: 'enemy',
							template: { ...SENIOR_BROTHER_LU_TEMPLATE, agility: 20 },
							facing: 'W'
						}
					),
					placement(
						'hero',
						{ x: 0, z: 0 },
						{
							template: { ...SECT_HERO_TEMPLATE, agility: 10 },
							facing: 'E'
						}
					)
				],
				{ squadBag: { lesser_healing_pill: 2 } }
			)
		);
		expect(getTurnOrder(enemyFirst.state).activeId).toBe('lu');
		const enemyState = patchFighter(enemyFirst.state, 'lu', { health: 50 });
		const enemySnapshot = JSON.parse(JSON.stringify(enemyState));

		expect(
			rejectionReason(applyBattleCommand(enemyState, useItem('lu', 'lesser_healing_pill', 'lu')))
		).toBe('invalidItem');
		expect(enemyState).toEqual(enemySnapshot);
		expect(enemyState.squadBag).toEqual({ lesser_healing_pill: 2 });

		const squadState = patchFighter(createBattle(squad()).state, 'hero', { health: 50 });
		expect(
			rejectionReason(
				applyBattleCommand(squadState, useItem('ally', 'lesser_healing_pill', 'hero'))
			)
		).toBe('wrongActor');
	});
});

describe('action budget and isolation', () => {
	it('allows one item action per turn and still ends the turn afterwards', () => {
		const state = patchFighter(createBattle(squad()).state, 'hero', { health: 40 });
		const used = accept(applyBattleCommand(state, useItem('hero', 'lesser_healing_pill', 'hero')));
		const snapshot = JSON.parse(JSON.stringify(used.state));

		for (const command of [
			useItem('hero', 'lesser_healing_pill', 'hero'),
			useItem('hero', 'lesser_qi_pill', 'hero'),
			useItem('hero', 'lesser_healing_pill', 'ally')
		]) {
			expect(applyBattleCommand(used.state, command)).toEqual({
				accepted: false,
				reason: 'wrongPhase'
			});
		}
		expect(used.state).toEqual(snapshot);
		expect(used.state.squadBag).toEqual({ lesser_healing_pill: 1, lesser_qi_pill: 2 });

		const ended = accept(
			applyBattleCommand(used.state, { type: 'endTurn', actorId: 'hero', facing: 'E' })
		);
		expect(getTurnOrder(ended.state).activeId).toBe('ally');
	});

	it('uses an item after moving, keeping the movement used', () => {
		const injured = patchFighter(createBattle(squad()).state, 'hero', { health: 50 });
		const moved = accept(
			applyBattleCommand(injured, { type: 'move', actorId: 'hero', cell: { x: 1, z: 0 } })
		);
		const used = accept(
			applyBattleCommand(moved.state, useItem('hero', 'lesser_healing_pill', 'hero'))
		);

		expect(used.state).toMatchObject({ hasMoved: true, hasActed: true });
		expect(fighter(used.state, 'hero')).toMatchObject({ cell: { x: 1, z: 0 }, health: 85 });
	});

	it('copies the bag and leaves the input state untouched', () => {
		const state = patchFighter(createBattle(squad()).state, 'hero', { health: 50 });
		const snapshot = JSON.parse(JSON.stringify(state));

		const result = accept(
			applyBattleCommand(state, useItem('hero', 'lesser_healing_pill', 'hero'))
		);

		expect(result.state.squadBag).not.toBe(state.squadBag);
		expect(result.state.fighters).not.toBe(state.fighters);
		result.state.squadBag.lesser_qi_pill = 0;
		result.state.squadBag.lesser_healing_pill = 9;
		result.state.fighters[0].health = 1;

		expect(state).toEqual(snapshot);
		expect(state.squadBag).toEqual({ lesser_healing_pill: 2, lesser_qi_pill: 2 });
		expect(state.fighters[0].health).toBe(50);
	});

	it('preserves item use across a JSON round trip', () => {
		const state = patchFighter(createBattle(squad()).state, 'hero', { health: 50 });
		const cloned = JSON.parse(JSON.stringify(state)) as BattleState;
		const command = useItem('hero', 'lesser_healing_pill', 'hero');

		expect(applyBattleCommand(cloned, command)).toEqual(applyBattleCommand(state, command));
	});
});
