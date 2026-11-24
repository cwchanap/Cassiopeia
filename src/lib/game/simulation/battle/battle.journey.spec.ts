import { describe, expect, it } from 'vitest';
import {
	applyBattleCommand,
	createBattle,
	forecastMove,
	getMoveTargets,
	getReachableCells,
	getTurnOrder,
	INTERNAL_ARTS,
	MOVES,
	SECT_HERO_TEMPLATE,
	SENIOR_BROTHER_LU_TEMPLATE,
	STARTER_BATTLE_TERRAIN,
	type BattleCommand,
	type BattleEvent,
	type BattleFighter,
	type BattleForecast,
	type BattleForecastResult,
	type BattleRejectionReason,
	type BattleSetup,
	type BattleState,
	type Cell,
	type Facing,
	type MoveId
} from './index';

/** Gather qi before the internal art bonus, as authored by the spec. */
const GATHER_QI = 20;

/**
 * The authored 12 x 12 scripted battle: the starter hero and one squad ally (both starter
 * templates) against Senior Brother Lu. Every turn below is written out by hand; no AI runs.
 */
const BATTLE_SETUP: BattleSetup = {
	terrain: STARTER_BATTLE_TERRAIN,
	fighters: [
		{
			id: 'hero',
			side: 'squad',
			template: SECT_HERO_TEMPLATE,
			cell: { x: 0, z: 1 },
			facing: 'E'
		},
		{
			id: 'ally',
			side: 'squad',
			template: SENIOR_BROTHER_LU_TEMPLATE,
			cell: { x: 0, z: 3 },
			facing: 'E'
		},
		{
			id: 'lu',
			side: 'enemy',
			template: SENIOR_BROTHER_LU_TEMPLATE,
			cell: { x: 5, z: 1 },
			facing: 'W'
		}
	],
	heroId: 'hero',
	squadBag: { lesser_healing_pill: 2, lesser_qi_pill: 1 }
};

/** Everything one playthrough produced, so two runs can be compared deep-equal. */
type Transcript = {
	events: BattleEvent[];
	states: BattleState[];
	finalState: BattleState;
};

describe('headless battle journey (public API only)', () => {
	it('plays the authored 12 x 12 battle to victory with explicit commands', () => {
		const transcript = playJourney(false);
		const final = transcript.finalState;

		expect(final.outcome).toBe('victory');
		expect(fighter(final, 'lu').health).toBe(0);
		expect(fighter(final, 'hero').health).toBeGreaterThan(0);
		expect(fighter(final, 'ally').health).toBeGreaterThan(0);
		expect(fighter(final, 'hero').cell).toEqual({ x: 3, z: 1 });
		expect(fighter(final, 'ally').cell).toEqual({ x: 4, z: 2 });
		expect(fighter(final, 'lu').cell).toEqual({ x: 4, z: 1 });
		expect(final.squadBag).toEqual({ lesser_healing_pill: 1, lesser_qi_pill: 1 });

		const lastRoundStart = transcript.events.findLast((event) => event.type === 'roundStarted');
		expect(lastRoundStart?.round).toBe(final.round);
		expect(final.round).toBeGreaterThanOrEqual(2);
	});

	it('replays deterministically, including a JSON round trip between commands', () => {
		expect(playJourney(true)).toEqual(playJourney(false));
	});
});

/**
 * The single scripted journey. It constructs the battle, then performs every command from a
 * written-out plan: moves (weighted terrain), one action per turn, facing in endTurn, qi spend
 * and regeneration, Guard/counter, Gather and a shared-bag pill. Every attack is forecast first
 * and the applied events, HP and qi are compared to that forecast. `jsonRoundTrip` serializes the
 * returned state after each accepted command, so a full replay must be deep-equal.
 */
function playJourney(jsonRoundTrip: boolean): Transcript {
	const created = createBattle(BATTLE_SETUP);
	let state = created.state;
	const transcript: Transcript = {
		events: [...created.events],
		states: [state],
		finalState: state
	};

	const commit = (command: BattleCommand): BattleEvent[] => {
		const result = applyBattleCommand(state, command);
		if (!result.accepted) {
			throw new Error(`expected ${command.type} to be accepted, got ${result.reason}`);
		}
		state = jsonRoundTrip ? roundTripState(result.state) : result.state;
		transcript.events.push(...result.events);
		transcript.states.push(state);
		return result.events;
	};

	const refuse = (command: BattleCommand, reason: BattleRejectionReason): void => {
		const snapshot = roundTripState(state);
		const result = applyBattleCommand(state, command);
		expect(result, `${command.type} is rejected`).toEqual({ accepted: false, reason });
		expect(state, `${command.type} rejection leaves the state unchanged`).toEqual(snapshot);
	};

	const attack = (
		actorId: string,
		moveId: MoveId,
		aim: Cell
	): { forecast: BattleForecast; events: BattleEvent[] } => {
		const target = getMoveTargets(state, moveId).find((entry) => sameCell(entry.aim, aim));
		expect(target, `${actorId} can aim ${moveId} at ${cellLabel(aim)}`).toBeDefined();
		expect(target?.targetIds.length, `${moveId} finds a living enemy`).toBeGreaterThan(0);
		const forecast = forecastOf(forecastMove(state, actorId, moveId, aim));
		const events = commit({ type: 'useMove', actorId, moveId, aim });
		expectAttackMirrorsForecast(forecast, events, state);
		return { forecast, events };
	};

	const endTurn = (actorId: string, facing: Facing): BattleEvent[] =>
		commit({ type: 'endTurn', actorId, facing });

	// Round 1 opening: agility 20 hero, then the two agility 10 fighters with squad before enemy.
	expect(transcript.events).toEqual([
		{ type: 'roundStarted', round: 1, order: ['hero', 'ally', 'lu'] },
		{ type: 'turnStarted', actorId: 'hero', qiBefore: 100, qiAfter: 100 }
	]);
	expect(getTurnOrder(state)).toEqual({
		round: 1,
		activeId: 'hero',
		order: ['hero', 'ally', 'lu'],
		actedIds: [],
		nextRound: ['hero', 'ally', 'lu']
	});

	// Round 1 — hero: weighted movement through bamboo, then Guard and an unchanged facing.
	const heroRoutes = getReachableCells(state);
	const bambooRoute = heroRoutes.find((entry) => sameCell(entry.cell, { x: 3, z: 1 }));
	expect(bambooRoute?.cost, 'bamboo costs 2 to enter').toBe(4);
	expect(bambooRoute?.path).toEqual([
		{ x: 0, z: 1 },
		{ x: 1, z: 1 },
		{ x: 2, z: 1 },
		{ x: 3, z: 1 }
	]);
	expect(
		heroRoutes.some((entry) => sameCell(entry.cell, { x: 4, z: 1 })),
		'(4,1) is beyond the hero movement budget'
	).toBe(false);
	// A fighter ID query is a full-budget geometry exposure even off-turn, not a command permit.
	expect(
		getReachableCells(state, 'ally').some((entry) => sameCell(entry.cell, { x: 3, z: 3 }))
	).toBe(true);

	refuse({ type: 'guard', actorId: 'ally' }, 'wrongActor');
	refuse({ type: 'endTurn', actorId: 'hero', facing: 'E' }, 'wrongPhase');
	refuse(
		{ type: 'useItem', actorId: 'hero', pillId: 'lesser_healing_pill', targetId: 'hero' },
		'resourceFull'
	);
	refuse(
		{ type: 'useItem', actorId: 'hero', pillId: 'lesser_healing_pill', targetId: 'ally' },
		'invalidTarget'
	);
	refuse({ type: 'move', actorId: 'hero', cell: { x: 4, z: 3 } }, 'invalidCell'); // water
	refuse({ type: 'move', actorId: 'hero', cell: { x: 8, z: 1 } }, 'invalidCell'); // obstacle
	refuse({ type: 'move', actorId: 'hero', cell: { x: 12, z: 1 } }, 'invalidCell');
	refuse({ type: 'move', actorId: 'hero', cell: { x: 11, z: 11 } }, 'unreachable');
	expect(state.squadBag).toEqual({ lesser_healing_pill: 2, lesser_qi_pill: 1 });

	const heroMove = commit({ type: 'move', actorId: 'hero', cell: { x: 3, z: 1 } });
	expect(eventsOfType(heroMove, 'moved')).toEqual([
		{ type: 'moved', actorId: 'hero', path: bambooRoute?.path }
	]);
	expect(getReachableCells(state), 'movement is spent').toEqual([]);
	refuse({ type: 'move', actorId: 'hero', cell: { x: 3, z: 2 } }, 'wrongPhase');

	const heroGuard = commit({ type: 'guard', actorId: 'hero' });
	expect(heroGuard).toEqual([{ type: 'guarded', actorId: 'hero' }]);
	refuse({ type: 'guard', actorId: 'hero' }, 'wrongPhase');
	refuse({ type: 'gatherQi', actorId: 'hero' }, 'wrongPhase');
	refuse(
		{ type: 'useMove', actorId: 'hero', moveId: 'sword_cut', aim: { x: 4, z: 1 } },
		'wrongPhase'
	);

	const heroEnd = endTurn('hero', 'E');
	expect(eventsOfType(heroEnd, 'turnEnded')).toEqual([
		{ type: 'turnEnded', actorId: 'hero', facingBefore: 'E', facingAfter: 'E' }
	]);
	expect(eventsOfType(heroEnd, 'turnStarted')[0].actorId).toBe('ally');
	expect(getTurnOrder(state).actedIds).toEqual(['hero']);

	// Round 1 — ally: a two-cost step, then Gather at a full pool (legal but clamped).
	const allyMove = getReachableCells(state).find((entry) => sameCell(entry.cell, { x: 3, z: 3 }));
	expect(allyMove?.cost).toBe(3);
	commit({ type: 'move', actorId: 'ally', cell: { x: 3, z: 3 } });
	const allyQiBefore = fighter(state, 'ally');
	const gathered = commit({ type: 'gatherQi', actorId: 'ally' });
	const [allyGather] = eventsOfType(gathered, 'qiGathered');
	expect(allyGather).toMatchObject({
		actorId: 'ally',
		qiBefore: allyQiBefore.qi,
		qiAfter: Math.min(
			allyQiBefore.maxQi,
			allyQiBefore.qi + GATHER_QI + INTERNAL_ARTS[allyQiBefore.internalArtId].gatherBonus
		)
	});
	expect(allyGather.qiAfter).toBe(allyQiBefore.maxQi);
	expect(fighter(state, 'ally').qi).toBe(allyGather.qiAfter);

	const allyEnd = endTurn('ally', 'N');
	expect(eventsOfType(allyEnd, 'turnEnded')).toEqual([
		{ type: 'turnEnded', actorId: 'ally', facingBefore: 'E', facingAfter: 'N' }
	]);
	expect(fighter(state, 'ally').facing).toBe('N');

	// Round 1 — Lu: close to the hero, strike the Guard, and eat the front counter.
	commit({ type: 'move', actorId: 'lu', cell: { x: 4, z: 1 } });
	const luStrike = attack('lu', 'sword_cut', { x: 3, z: 1 });
	expect(luStrike.forecast.hits).toHaveLength(1);
	expect(luStrike.forecast.hits[0]).toMatchObject({
		targetId: 'hero',
		facingPercent: 100,
		guardPercent: 50,
		attackPercent: 100
	});
	expect(luStrike.forecast.counters).toHaveLength(1);
	expect(luStrike.forecast.counters[0]).toMatchObject({
		sourceId: 'hero',
		targetId: 'lu',
		attackPercent: 50,
		facingPercent: 100
	});
	expect(fighter(state, 'hero').health).toBe(luStrike.forecast.hits[0].healthAfter);
	expect(fighter(state, 'lu').health).toBe(luStrike.forecast.counters[0].healthAfter);
	expect(luStrike.events.map((event) => event.type)).toEqual([
		'attacked',
		'damaged',
		'countered',
		'damaged'
	]);

	const luEnd = endTurn('lu', 'W');
	expect(eventsOfType(luEnd, 'roundStarted')).toEqual([
		{ type: 'roundStarted', round: 2, order: ['hero', 'ally', 'lu'] }
	]);
	expect(fighter(state, 'hero').guarding, 'Guard expires at the next turn start').toBe(false);

	// Round 2 — hero: a qi technique spent from full, then regeneration next round.
	expect(getTurnOrder(state)).toMatchObject({ round: 2, activeId: 'hero', actedIds: [] });
	refuse(
		{ type: 'useMove', actorId: 'hero', moveId: 'palm_strike', aim: { x: 4, z: 1 } },
		'moveNotOwned'
	);
	refuse(
		{ type: 'useMove', actorId: 'hero', moveId: 'sword_cut', aim: { x: 3, z: 0 } },
		'invalidAim'
	);

	const thrust = attack('hero', 'piercing_thrust', { x: 4, z: 1 });
	expect(thrust.forecast.hits).toHaveLength(1);
	expect(thrust.forecast.counters).toEqual([]);
	expect(thrust.forecast.hits[0]).toMatchObject({ targetId: 'lu', facingPercent: 100 });
	expect(thrust.forecast.qiBefore - thrust.forecast.qiAfter).toBe(MOVES.piercing_thrust.qiCost);
	expect(fighter(state, 'hero').qi).toBe(thrust.forecast.qiAfter);
	expect(thrust.events.map((event) => event.type)).toEqual(['attacked', 'damaged']);
	const heroQiAfterThrust = fighter(state, 'hero').qi;
	endTurn('hero', 'E');

	// Round 2 — ally: step beside Lu (water blocks the short way) and strike his side.
	const allyRoutes = getReachableCells(state);
	expect(allyRoutes.some((entry) => sameCell(entry.cell, { x: 4, z: 3 }))).toBe(false);
	const flankStep = allyRoutes.find((entry) => sameCell(entry.cell, { x: 4, z: 2 }));
	expect(flankStep?.cost).toBe(2);
	commit({ type: 'move', actorId: 'ally', cell: { x: 4, z: 2 } });
	const allyStrike = attack('ally', 'sword_cut', { x: 4, z: 1 });
	expect(allyStrike.forecast.hits[0]).toMatchObject({
		targetId: 'lu',
		facingPercent: 125,
		guardPercent: 100
	});
	expect(fighter(state, 'lu').health).toBe(allyStrike.forecast.hits[0].healthAfter);
	const allyEndAgain = endTurn('ally', 'N');
	expect(eventsOfType(allyEndAgain, 'turnEnded')).toEqual([
		{ type: 'turnEnded', actorId: 'ally', facingBefore: 'N', facingAfter: 'N' }
	]);

	// Round 2 — Lu: hit the ally in the front.
	const luHitsAlly = attack('lu', 'sword_cut', { x: 4, z: 2 });
	expect(luHitsAlly.forecast.hits[0]).toMatchObject({ targetId: 'ally', facingPercent: 100 });
	expect(fighter(state, 'ally').health).toBe(luHitsAlly.forecast.hits[0].healthAfter);
	endTurn('lu', 'W');

	// Round 3 — hero: the spent pool regenerates before the turn starts, then an arc sweep.
	const heroRegen = INTERNAL_ARTS[SECT_HERO_TEMPLATE.internalArtId].qiRegen;
	expect(fighter(state, 'hero').qi).toBe(
		Math.min(fighter(state, 'hero').maxQi, heroQiAfterThrust + heroRegen)
	);
	const sweepAim = getMoveTargets(state, 'cloud_sweep').find((target) =>
		sameCell(target.aim, { x: 4, z: 1 })
	);
	expect(sweepAim?.cells).toEqual([
		{ x: 4, z: 1 },
		{ x: 4, z: 0 },
		{ x: 4, z: 2 }
	]);
	expect(sweepAim?.targetIds, 'the ally in the arc is not a hostile target').toEqual(['lu']);
	const sweep = attack('hero', 'cloud_sweep', { x: 4, z: 1 });
	expect(sweep.forecast.hits).toHaveLength(1);
	expect(eventsOfType(sweep.events, 'damaged')).toHaveLength(1);
	expect(sweep.forecast.qiBefore - sweep.forecast.qiAfter).toBe(MOVES.cloud_sweep.qiCost);
	endTurn('hero', 'E');

	// Round 3 — ally: another side strike.
	const allyStrikeAgain = attack('ally', 'sword_cut', { x: 4, z: 1 });
	expect(allyStrikeAgain.forecast.hits[0].targetId).toBe('lu');
	endTurn('ally', 'N');

	// Round 3 — Lu: Guard with a new facing, ready for the round-4 counter test.
	const luGuard = commit({ type: 'guard', actorId: 'lu' });
	expect(luGuard).toEqual([{ type: 'guarded', actorId: 'lu' }]);
	const luGuardEnd = endTurn('lu', 'N');
	expect(eventsOfType(luGuardEnd, 'turnEnded')).toEqual([
		{ type: 'turnEnded', actorId: 'lu', facingBefore: 'W', facingAfter: 'N' }
	]);
	expect(fighter(state, 'lu').guarding).toBe(true);

	// Round 4 — hero: hit a Guard; the primary is halved, the counter reads forced front.
	expect(getTurnOrder(state).round).toBe(4);
	const guardedHit = attack('hero', 'sword_cut', { x: 4, z: 1 });
	expect(guardedHit.forecast.hits[0]).toMatchObject({
		targetId: 'lu',
		facingPercent: 125,
		guardPercent: 50
	});
	expect(guardedHit.forecast.counters).toHaveLength(1);
	expect(guardedHit.forecast.counters[0]).toMatchObject({
		sourceId: 'lu',
		targetId: 'hero',
		facingPercent: 100,
		attackPercent: 50
	});
	expect(fighter(state, 'hero').health).toBe(guardedHit.forecast.actorHealthAfter);
	expect(fighter(state, 'lu').facing, 'a counter does not rotate the defender').toBe('N');
	expect(fighter(state, 'hero').facing, 'a counter does not rotate the attacker').toBe('E');
	endTurn('hero', 'E');

	// Round 4 — ally: reject a distant ally heal, then spend one shared healing pill on itself.
	refuse(
		{ type: 'useItem', actorId: 'ally', pillId: 'lesser_healing_pill', targetId: 'hero' },
		'invalidTarget'
	);
	const allyHealthBefore = fighter(state, 'ally').health;
	const heal = commit({
		type: 'useItem',
		actorId: 'ally',
		pillId: 'lesser_healing_pill',
		targetId: 'ally'
	});
	const [healEvent] = eventsOfType(heal, 'itemUsed');
	expect(healEvent).toMatchObject({
		actorId: 'ally',
		targetId: 'ally',
		pillId: 'lesser_healing_pill',
		resource: 'health',
		resourceBefore: allyHealthBefore,
		resourceAfter: fighter(state, 'ally').maxHealth,
		bagCount: 1
	});
	expect(healEvent.amount).toBe(healEvent.resourceAfter - healEvent.resourceBefore);
	expect(fighter(state, 'ally').health).toBe(healEvent.resourceAfter);
	expect(fighter(state, 'ally').health).toBe(fighter(state, 'ally').maxHealth);
	expect(state.squadBag).toEqual({ lesser_healing_pill: 1, lesser_qi_pill: 1 });
	endTurn('ally', 'N');

	// Round 4 — Lu: Guard is gone at turn start; strike the ally again.
	expect(fighter(state, 'lu').guarding, 'Guard expires at the guarder turn start').toBe(false);
	const luHitsAllyAgain = attack('lu', 'sword_cut', { x: 4, z: 2 });
	expect(luHitsAllyAgain.forecast.hits[0]).toMatchObject({
		targetId: 'ally',
		facingPercent: 100
	});
	endTurn('lu', 'S');

	// Round 5 — hero: Gather restores the fixed amount plus the internal-art bonus.
	const heroTurnStartQi = fighter(state, 'hero').qi;
	const gatheredAgain = commit({ type: 'gatherQi', actorId: 'hero' });
	const [heroGather] = eventsOfType(gatheredAgain, 'qiGathered');
	const gatherBonus = INTERNAL_ARTS[SECT_HERO_TEMPLATE.internalArtId].gatherBonus;
	expect(heroGather).toEqual({
		type: 'qiGathered',
		actorId: 'hero',
		qiBefore: heroTurnStartQi,
		qiAfter: Math.min(fighter(state, 'hero').maxQi, heroTurnStartQi + GATHER_QI + gatherBonus)
	});
	expect(heroGather.qiAfter - heroGather.qiBefore).toBe(GATHER_QI + gatherBonus);
	expect(fighter(state, 'hero').qi).toBe(heroGather.qiAfter);
	expect(fighter(state, 'hero').qi).toBe(heroTurnStartQi + GATHER_QI + gatherBonus);
	endTurn('hero', 'E');

	// Round 5 — ally: front strike as Lu faces south.
	const allyFinalStrike = attack('ally', 'sword_cut', { x: 4, z: 1 });
	expect(allyFinalStrike.forecast.hits[0]).toMatchObject({
		targetId: 'lu',
		facingPercent: 100
	});
	endTurn('ally', 'N');

	// Round 5 — Lu: one more front strike on the hero.
	const luFinalStrike = attack('lu', 'sword_cut', { x: 3, z: 1 });
	expect(luFinalStrike.forecast.hits[0]).toMatchObject({
		targetId: 'hero',
		facingPercent: 100
	});
	endTurn('lu', 'S');

	// Round 6 — hero: the finishing side strike ends the battle without another turn.
	const finishing = attack('hero', 'sword_cut', { x: 4, z: 1 });
	expect(finishing.forecast.outcome).toBe('victory');
	expect(finishing.forecast.activeFighterId).toBeNull();
	expect(finishing.forecast.hits).toHaveLength(1);
	expect(finishing.forecast.hits[0]).toMatchObject({
		targetId: 'lu',
		facingPercent: 125,
		defeated: true,
		healthAfter: 0
	});
	expect(finishing.forecast.hits[0].applied).toBe(finishing.forecast.hits[0].healthBefore);
	expect(finishing.forecast.hits[0].calculated).toBeGreaterThan(finishing.forecast.hits[0].applied);
	expect(finishing.events.map((event) => event.type)).toEqual([
		'attacked',
		'damaged',
		'defeated',
		'battleEnded'
	]);
	expect(eventsOfType(finishing.events, 'turnEnded')).toEqual([]);

	// Terminal state: the final round's living snapshot stays, with no active or next turn.
	expect(getTurnOrder(state)).toEqual({
		round: 6,
		activeId: null,
		order: ['hero', 'ally'],
		actedIds: ['hero'],
		nextRound: []
	});
	expect(getReachableCells(state)).toEqual([]);
	expect(getReachableCells(state, 'hero')).toEqual([]);
	expect(getMoveTargets(state, 'sword_cut')).toEqual([]);
	expect(forecastMove(state, 'hero', 'sword_cut', { x: 4, z: 1 })).toEqual({
		accepted: false,
		reason: 'terminal'
	});
	refuse({ type: 'endTurn', actorId: 'hero', facing: 'E' }, 'terminal');
	refuse({ type: 'move', actorId: 'hero', cell: { x: 3, z: 2 } }, 'terminal');
	refuse(
		{ type: 'useItem', actorId: 'hero', pillId: 'lesser_qi_pill', targetId: 'hero' },
		'terminal'
	);
	expect(transcript.events.at(-1)).toEqual({ type: 'battleEnded', outcome: 'victory' });
	expect(eventsOfType(transcript.events, 'battleEnded')).toHaveLength(1);
	expect(state.outcome).toBe('victory');

	transcript.finalState = state;
	return transcript;
}

/** The applied attack must be the forecast: same qi delta, per-hit mitigation, HP and outcome. */
function expectAttackMirrorsForecast(
	forecast: BattleForecast,
	events: BattleEvent[],
	state: BattleState
): void {
	const attacked = eventsOfType(events, 'attacked');
	expect(attacked).toHaveLength(1);
	expect(attacked[0]).toMatchObject({
		actorId: forecast.actorId,
		moveId: forecast.moveId,
		aim: forecast.aim,
		qiBefore: forecast.qiBefore,
		qiAfter: forecast.qiAfter
	});
	expect(forecast.qiBefore - forecast.qiAfter).toBe(forecast.qiCost);

	const projected = [...forecast.hits, ...forecast.counters];
	const damaged = eventsOfType(events, 'damaged');
	expect(damaged).toHaveLength(projected.length);
	for (const [index, hit] of projected.entries()) {
		expect(damaged[index]).toEqual({
			type: 'damaged',
			sourceId: hit.sourceId,
			targetId: hit.targetId,
			calculated: hit.calculated,
			applied: hit.applied,
			facingPercent: hit.facingPercent,
			coverPercent: hit.coverPercent,
			guardPercent: hit.guardPercent,
			passivePercent: hit.passivePercent,
			attackPercent: hit.attackPercent,
			healthBefore: hit.healthBefore,
			healthAfter: hit.healthAfter
		});
		expect(hit.applied).toBe(Math.min(hit.calculated, hit.healthBefore));
		expect(hit.healthAfter).toBe(hit.healthBefore - hit.applied);
		expect(fighter(state, hit.targetId).health).toBe(hit.healthAfter);
	}

	expect(eventsOfType(events, 'countered')).toEqual(
		forecast.counters.map((hit) => ({
			type: 'countered',
			actorId: hit.sourceId,
			targetId: hit.targetId,
			moveId: hit.moveId
		}))
	);
	expect(eventsOfType(events, 'defeated').map((event) => event.fighterId)).toEqual(
		projected.filter((hit) => hit.defeated).map((hit) => hit.targetId)
	);

	expect(state.outcome).toBe(forecast.outcome);
	expect(state.round).toBe(forecast.round);
	expect(getTurnOrder(state).activeId).toBe(forecast.activeFighterId);
	expect(fighter(state, forecast.actorId).health).toBe(forecast.actorHealthAfter);
	expect(fighter(state, forecast.actorId).qi).toBe(forecast.qiAfter);
}

function eventsOfType<T extends BattleEvent['type']>(
	events: BattleEvent[],
	type: T
): Extract<BattleEvent, { type: T }>[] {
	return events.filter((event): event is Extract<BattleEvent, { type: T }> => event.type === type);
}

function forecastOf(result: BattleForecastResult): BattleForecast {
	if (!result.accepted) {
		throw new Error(`expected an accepted forecast, got ${result.reason}`);
	}
	return result.forecast;
}

function fighter(state: BattleState, id: string): BattleFighter {
	const found = state.fighters.find((candidate) => candidate.id === id);
	if (!found) {
		throw new Error(`unknown fighter: ${id}`);
	}
	return found;
}

function roundTripState(state: BattleState): BattleState {
	return JSON.parse(JSON.stringify(state)) as BattleState;
}

function sameCell(a: Cell, b: Cell): boolean {
	return a.x === b.x && a.z === b.z;
}

function cellLabel(cell: Cell): string {
	return `(${cell.x},${cell.z})`;
}
