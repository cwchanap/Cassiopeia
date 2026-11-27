import { describe, expect, it } from 'vitest';
import {
	applyBattleCommand,
	createBattle,
	getTurnOrder,
	planBattleTurn,
	SECT_HERO_TEMPLATE,
	SENIOR_BROTHER_LU_TEMPLATE,
	STARTER_BATTLE_TERRAIN,
	type BattleAiProfile,
	type BattleCommand,
	type BattleCommandResult,
	type BattleEvent,
	type BattleSetup,
	type BattleState,
	type FighterTemplate
} from './index';

const PLANNED_TURN_LIMIT = 200;

type AiJourneyTranscript = {
	commands: BattleCommand[];
	events: BattleEvent[];
	finalState: BattleState;
	plannedTurns: number;
	initialTotalHealth: number;
	endRoundFourTotalHealth: number | null;
	startedWithFullResources: boolean;
};

function accept(result: BattleCommandResult): { state: BattleState; events: BattleEvent[] } {
	if (!result.accepted) {
		throw new Error(`expected an accepted command, got ${result.reason}`);
	}
	return result;
}

function roundTripState(state: BattleState): BattleState {
	return JSON.parse(JSON.stringify(state));
}

function totalHealth(state: BattleState): number {
	return state.fighters.reduce((total, fighter) => total + fighter.health, 0);
}

function eventsOfType<T extends BattleEvent['type']>(
	events: BattleEvent[],
	type: T
): Extract<BattleEvent, { type: T }>[] {
	return events.filter((event): event is Extract<BattleEvent, { type: T }> => event.type === type);
}

function marksmanTemplate(base: FighterTemplate): FighterTemplate {
	return {
		...base,
		externalArtId: 'willow_darts',
		internalArtId: 'flowing_cloud_steps'
	};
}

function openTerrain(size: number): string[] {
	return Array.from({ length: size }, () => '.'.repeat(size));
}

/**
 * Starter-stat hero and Lu begin four cells apart. Either combatant can close to a legal attack
 * adjacent in one movement phase, so neither fixture depends on forced damage or scripted input.
 */
function mutualReachDuelSetup(): BattleSetup {
	return {
		terrain: openTerrain(7),
		fighters: [
			{
				id: 'hero',
				side: 'squad',
				template: SECT_HERO_TEMPLATE,
				cell: { x: 1, z: 3 },
				facing: 'E'
			},
			{
				id: 'lu',
				side: 'enemy',
				template: SENIOR_BROTHER_LU_TEMPLATE,
				cell: { x: 5, z: 3 },
				facing: 'W'
			}
		],
		heroId: 'hero',
		squadBag: {}
	};
}

function aggressorDuelProfiles(): Map<string, BattleAiProfile> {
	const profiles = new Map<string, BattleAiProfile>();
	profiles.set('hero', { archetype: 'aggressor' });
	profiles.set('lu', { archetype: 'aggressor' });
	return profiles;
}

function guardianDuelProfiles(): Map<string, BattleAiProfile> {
	const profiles = new Map<string, BattleAiProfile>();
	profiles.set('hero', { archetype: 'aggressor' });
	profiles.set('lu', { archetype: 'guardian', post: { x: 5, z: 3 } });
	return profiles;
}

/**
 * Two squad fighters face two enemies across the authored 12 x 12 mixed-terrain map. The melee
 * fighters begin on the obstacle row, so reaching one another requires a short legal detour; the
 * willow-dart fighters exercise Marksman positioning. The squad bag is deliberately empty.
 */
function mixedBattleSetup(): BattleSetup {
	return {
		terrain: STARTER_BATTLE_TERRAIN,
		fighters: [
			{
				id: 'hero',
				side: 'squad',
				template: SECT_HERO_TEMPLATE,
				cell: { x: 1, z: 8 },
				facing: 'E'
			},
			{
				id: 'ally-darts',
				side: 'squad',
				template: marksmanTemplate(SECT_HERO_TEMPLATE),
				cell: { x: 1, z: 9 },
				facing: 'E'
			},
			{
				id: 'lu',
				side: 'enemy',
				template: SENIOR_BROTHER_LU_TEMPLATE,
				cell: { x: 9, z: 8 },
				facing: 'W'
			},
			{
				id: 'enemy-darts',
				side: 'enemy',
				template: marksmanTemplate(SENIOR_BROTHER_LU_TEMPLATE),
				cell: { x: 9, z: 9 },
				facing: 'W'
			}
		],
		heroId: 'hero',
		squadBag: {}
	};
}

function mixedBattleProfiles(): Map<string, BattleAiProfile> {
	const profiles = new Map<string, BattleAiProfile>();
	profiles.set('hero', { archetype: 'aggressor' });
	profiles.set('ally-darts', { archetype: 'marksman' });
	profiles.set('lu', { archetype: 'guardian', post: { x: 9, z: 8 } });
	profiles.set('enemy-darts', { archetype: 'marksman' });
	return profiles;
}

function expectPlanShape(commands: BattleCommand[], actorId: string): void {
	const moveIndexes: number[] = [];
	const actionIndexes: number[] = [];
	const endIndexes: number[] = [];
	for (const [index, command] of commands.entries()) {
		expect(command.actorId).toBe(actorId);
		if (command.type === 'move') {
			moveIndexes.push(index);
		}
		if (
			command.type === 'useMove' ||
			command.type === 'useItem' ||
			command.type === 'guard' ||
			command.type === 'gatherQi'
		) {
			actionIndexes.push(index);
		}
		if (command.type === 'endTurn') {
			endIndexes.push(index);
		}
	}

	expect(moveIndexes.length, 'at most one planned move').toBeLessThanOrEqual(1);
	expect(actionIndexes.length, 'at most one planned action').toBeLessThanOrEqual(1);
	expect(endIndexes.length, 'at most one planned endTurn').toBeLessThanOrEqual(1);
	if (moveIndexes.length === 1 && actionIndexes.length === 1) {
		expect(actionIndexes[0]).toBeGreaterThan(moveIndexes[0]);
	}
	if (actionIndexes.length === 1 && endIndexes.length === 1) {
		expect(endIndexes[0]).toBeGreaterThan(actionIndexes[0]);
	}
}

/**
 * Runs only the public battle API. Every command in every turn comes from planBattleTurn; the
 * harness applies each one unchanged through applyBattleCommand and requires a real handoff.
 */
function playAiBattle(
	setup: BattleSetup,
	profiles: Map<string, BattleAiProfile>,
	jsonRoundTrip: boolean
): AiJourneyTranscript {
	const created = createBattle(setup);
	let state = jsonRoundTrip ? roundTripState(created.state) : created.state;
	const transcript: AiJourneyTranscript = {
		commands: [],
		events: [...created.events],
		finalState: state,
		plannedTurns: 0,
		initialTotalHealth: totalHealth(state),
		endRoundFourTotalHealth: null,
		startedWithFullResources: state.fighters.every(
			(fighter) => fighter.health === fighter.maxHealth && fighter.qi === fighter.maxQi
		)
	};

	const captureRoundFourCheckpoint = (): void => {
		if (
			transcript.endRoundFourTotalHealth === null &&
			(state.round >= 5 || state.outcome !== 'ongoing')
		) {
			transcript.endRoundFourTotalHealth = totalHealth(state);
		}
	};

	while (state.outcome === 'ongoing') {
		if (transcript.plannedTurns >= PLANNED_TURN_LIMIT) {
			throw new Error(`AI battle remained ongoing after ${PLANNED_TURN_LIMIT} planned turns`);
		}
		const activeId = getTurnOrder(state).activeId;
		if (!activeId) {
			throw new Error('ongoing battle has no active actor');
		}
		const profile = profiles.get(activeId);
		if (!profile) {
			throw new Error(`missing AI profile for ${activeId}`);
		}
		const planned = planBattleTurn(state, activeId, profile);
		if (planned.length === 0) {
			throw new Error(`planner returned no commands for active actor ${activeId}`);
		}
		expectPlanShape(planned, activeId);
		transcript.plannedTurns += 1;

		const turnEvents: BattleEvent[] = [];
		for (const command of planned) {
			const accepted = accept(applyBattleCommand(state, command));
			state = jsonRoundTrip ? roundTripState(accepted.state) : accepted.state;
			turnEvents.push(...accepted.events);
			transcript.events.push(...accepted.events);
			transcript.commands.push(command);
			captureRoundFourCheckpoint();
		}

		const after = getTurnOrder(state);
		if (state.outcome === 'ongoing') {
			expect(after.activeId, `handoff after ${activeId}`).not.toBe(activeId);
			const turnStarts = eventsOfType(turnEvents, 'turnStarted');
			const lastStart = turnStarts.at(-1);
			if (!lastStart) {
				throw new Error(`handoff after ${activeId} emitted no turnStarted event`);
			}
			expect(lastStart.actorId).toBe(after.activeId);
		}
	}

	transcript.finalState = state;
	return transcript;
}

function expectTerminalBattle(transcript: AiJourneyTranscript): void {
	expect(transcript.plannedTurns).toBeLessThanOrEqual(PLANNED_TURN_LIMIT);
	expect(transcript.finalState.outcome).not.toBe('ongoing');
	expect(['victory', 'defeat']).toContain(transcript.finalState.outcome);
	const endings = eventsOfType(transcript.events, 'battleEnded');
	expect(endings).toHaveLength(1);
	const ending = endings[0];
	if (!ending) {
		throw new Error('terminal transcript emitted no battleEnded event');
	}
	expect(ending.outcome).toBe(transcript.finalState.outcome);
	expect(getTurnOrder(transcript.finalState).activeId).toBeNull();
	expect(getTurnOrder(transcript.finalState).nextRound).toEqual([]);
}

function expectRoundFourDamage(transcript: AiJourneyTranscript): void {
	expect(transcript.startedWithFullResources).toBe(true);
	if (transcript.endRoundFourTotalHealth === null) {
		throw new Error('battle never reached an end-of-round-four checkpoint');
	}
	expect(transcript.endRoundFourTotalHealth).toBeLessThan(transcript.initialTotalHealth);
}

describe('enemy AI public-API journeys', () => {
	it('fights an Aggressor hero versus Aggressor Lu mutual-reach duel to a real outcome', () => {
		const transcript = playAiBattle(mutualReachDuelSetup(), aggressorDuelProfiles(), false);

		expectTerminalBattle(transcript);
		expectRoundFourDamage(transcript);
	});

	it('fights an Aggressor hero versus Guardian Lu at his post to a real outcome', () => {
		const transcript = playAiBattle(mutualReachDuelSetup(), guardianDuelProfiles(), false);

		expectTerminalBattle(transcript);
		expectRoundFourDamage(transcript);
	});

	it('fights the mixed-archetype 12 x 12 battle deterministically through JSON round trips', () => {
		const fresh = playAiBattle(mixedBattleSetup(), mixedBattleProfiles(), false);
		const roundTripped = playAiBattle(mixedBattleSetup(), mixedBattleProfiles(), true);

		expectTerminalBattle(fresh);
		expect(roundTripped.commands).toStrictEqual(fresh.commands);
		expect(roundTripped.events).toStrictEqual(fresh.events);
		expect(roundTripped.finalState).toStrictEqual(fresh.finalState);
		expect(roundTripped.plannedTurns).toBe(fresh.plannedTurns);
	});
});
