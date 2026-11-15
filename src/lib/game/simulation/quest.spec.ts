import { describe, expect, it } from 'vitest';
import { QUEST_STEPS } from './villageContent';
import { activeQuestStep, advanceQuest, createInitialQuest, normalizeQuestProgress } from './quest';

describe('quest progress', () => {
	it('starts on the first authored step', () => {
		const quest = createInitialQuest();

		expect(quest).toEqual({ stepIndex: 0, stepProgress: 0 });
		expect(activeQuestStep(quest)?.id).toBe('pay_respects');
	});

	it('advances the talk step only when the target villager finishes talking', () => {
		const quest = createInitialQuest();

		const wrongVillager = advanceQuest(quest, {
			type: 'dialogueComplete',
			villagerId: 'senior_brother_lu'
		});
		expect(wrongVillager.stepIndex).toBe(0);

		const next = advanceQuest(quest, { type: 'dialogueComplete', villagerId: 'elder_shen' });
		expect(next.stepIndex).toBe(1);
		expect(next.stepProgress).toBe(0);
		expect(activeQuestStep(next)?.id).toBe('lightness_training');
	});

	it('ignores events that do not match the active step kind', () => {
		const quest = createInitialQuest();

		expect(advanceQuest(quest, { type: 'duelWon' }).stepIndex).toBe(0);
		expect(advanceQuest(quest, { type: 'markerCrossed' }).stepIndex).toBe(0);

		const atSpar = { stepIndex: 4, stepProgress: 0 };
		expect(
			advanceQuest(atSpar, { type: 'dialogueComplete', villagerId: 'senior_brother_lu' }).stepIndex
		).toBe(4);
		expect(
			advanceQuest(atSpar, { type: 'dialogueComplete', villagerId: 'elder_shen' }).stepIndex
		).toBe(4);
	});

	it('counts ordered marker crossings and advances after the third', () => {
		const atMarkers = { stepIndex: 1, stepProgress: 0 };

		expect(advanceQuest(atMarkers, { type: 'duelWon' })).toEqual(atMarkers);
		expect(advanceQuest(atMarkers, { type: 'dialogueComplete', villagerId: 'elder_shen' })).toEqual(
			atMarkers
		);

		const first = advanceQuest(atMarkers, { type: 'markerCrossed' });
		expect(first).toEqual({ stepIndex: 1, stepProgress: 1 });

		const second = advanceQuest(first, { type: 'markerCrossed' });
		expect(second).toEqual({ stepIndex: 1, stepProgress: 2 });

		const done = advanceQuest(second, { type: 'markerCrossed' });
		expect(done).toEqual({ stepIndex: 2, stepProgress: 0 });
		expect(activeQuestStep(done)?.id).toBe('fetch_medicine');
	});

	it('stages the medicine grant on dialogue then completes on a matching quick-slot assignment', () => {
		const atMedicine = { stepIndex: 2, stepProgress: 0 };
		const step = QUEST_STEPS[2];
		expect(step.id).toBe('fetch_medicine');
		expect(step.grant).toEqual({ itemId: 'lesser_healing_pill', count: 2 });

		expect(advanceQuest(atMedicine, { type: 'duelWon' })).toEqual(atMedicine);
		expect(advanceQuest(atMedicine, { type: 'markerCrossed' })).toEqual(atMedicine);
		expect(
			advanceQuest(atMedicine, { type: 'dialogueComplete', villagerId: 'senior_brother_lu' })
		).toEqual(atMedicine);
		expect(
			advanceQuest(atMedicine, {
				type: 'quickSlotAssigned',
				itemId: 'lesser_healing_pill'
			})
		).toEqual(atMedicine);

		const granted = advanceQuest(atMedicine, {
			type: 'dialogueComplete',
			villagerId: 'auntie_qin'
		});
		expect(granted).toEqual({ stepIndex: 2, stepProgress: 1 });

		const grantedAgain = advanceQuest(granted, {
			type: 'dialogueComplete',
			villagerId: 'auntie_qin'
		});
		expect(grantedAgain).toEqual({ stepIndex: 2, stepProgress: 1 });

		expect(advanceQuest(granted, { type: 'quickSlotAssigned', itemId: 'lesser_qi_pill' })).toEqual(
			granted
		);
		expect(advanceQuest(granted, { type: 'quickSlotAssigned', itemId: 'training_sword' })).toEqual(
			granted
		);

		const done = advanceQuest(granted, {
			type: 'quickSlotAssigned',
			itemId: 'lesser_healing_pill'
		});
		expect(done).toEqual({ stepIndex: 3, stepProgress: 0 });
		expect(activeQuestStep(done)?.id).toBe('ring_shrine_bell');
	});

	it('rings the shrine bell only while its step is active', () => {
		const atBell = { stepIndex: 3, stepProgress: 0 };
		expect(QUEST_STEPS[3].id).toBe('ring_shrine_bell');

		expect(advanceQuest(atBell, { type: 'duelWon' })).toEqual(atBell);
		expect(advanceQuest(atBell, { type: 'markerCrossed' })).toEqual(atBell);
		expect(advanceQuest(atBell, { type: 'dialogueComplete', villagerId: 'old_zhu' })).toEqual(
			atBell
		);
		expect(advanceQuest(atBell, { type: 'objectUsed', targetId: 'gate_markers' })).toEqual(atBell);
		expect(
			advanceQuest(
				{ stepIndex: 0, stepProgress: 0 },
				{ type: 'objectUsed', targetId: 'shrine_bell' }
			).stepIndex
		).toBe(0);

		const done = advanceQuest(atBell, { type: 'objectUsed', targetId: 'shrine_bell' });
		expect(done).toEqual({ stepIndex: 4, stepProgress: 0 });
		expect(activeQuestStep(done)?.id).toBe('spar');
	});

	it('completes the quest on the duel win and stays complete', () => {
		const atSpar = { stepIndex: 4, stepProgress: 0 };

		const done = advanceQuest(atSpar, { type: 'duelWon' });
		expect(done.stepIndex).toBe(QUEST_STEPS.length);
		expect(activeQuestStep(done)).toBeNull();

		const stillDone = advanceQuest(done, { type: 'duelWon' });
		expect(stillDone.stepIndex).toBe(QUEST_STEPS.length);
	});
});

describe('normalizeQuestProgress', () => {
	it('accepts in-bounds progress for the authored steps', () => {
		expect(normalizeQuestProgress({ stepIndex: 0, stepProgress: 0 })).toEqual({
			stepIndex: 0,
			stepProgress: 0
		});
		expect(normalizeQuestProgress({ stepIndex: 1, stepProgress: 0 })).toEqual({
			stepIndex: 1,
			stepProgress: 0
		});
		expect(normalizeQuestProgress({ stepIndex: 1, stepProgress: 2 })).toEqual({
			stepIndex: 1,
			stepProgress: 2
		});
		expect(normalizeQuestProgress({ stepIndex: 2, stepProgress: 0 })).toEqual({
			stepIndex: 2,
			stepProgress: 0
		});
		expect(normalizeQuestProgress({ stepIndex: 2, stepProgress: 1 })).toEqual({
			stepIndex: 2,
			stepProgress: 1
		});
		expect(normalizeQuestProgress({ stepIndex: 3, stepProgress: 0 })).toEqual({
			stepIndex: 3,
			stepProgress: 0
		});
		expect(normalizeQuestProgress({ stepIndex: 4, stepProgress: 0 })).toEqual({
			stepIndex: 4,
			stepProgress: 0
		});
	});

	it('accepts quest completion only with zero step progress', () => {
		expect(normalizeQuestProgress({ stepIndex: QUEST_STEPS.length, stepProgress: 0 })).toEqual({
			stepIndex: QUEST_STEPS.length,
			stepProgress: 0
		});
		expect(normalizeQuestProgress({ stepIndex: QUEST_STEPS.length, stepProgress: 1 })).toBeNull();
	});

	it('rejects progress the active step cannot produce', () => {
		expect(normalizeQuestProgress({ stepIndex: 0, stepProgress: 1 })).toBeNull();
		expect(normalizeQuestProgress({ stepIndex: 1, stepProgress: 3 })).toBeNull();
		expect(normalizeQuestProgress({ stepIndex: 2, stepProgress: 2 })).toBeNull();
		expect(normalizeQuestProgress({ stepIndex: 3, stepProgress: 1 })).toBeNull();
		expect(normalizeQuestProgress({ stepIndex: 4, stepProgress: 1 })).toBeNull();
		expect(normalizeQuestProgress({ stepIndex: 0, stepProgress: -1 })).toBeNull();
	});

	it('rejects malformed and out-of-bounds data', () => {
		expect(normalizeQuestProgress(null)).toBeNull();
		expect(normalizeQuestProgress('{"stepIndex":0,"stepProgress":0}')).toBeNull();
		expect(normalizeQuestProgress([0, 0])).toBeNull();
		expect(normalizeQuestProgress({})).toBeNull();
		expect(normalizeQuestProgress({ stepIndex: 0 })).toBeNull();
		expect(normalizeQuestProgress({ stepProgress: 0 })).toBeNull();
		expect(normalizeQuestProgress({ stepIndex: '1', stepProgress: 0 })).toBeNull();
		expect(normalizeQuestProgress({ stepIndex: 0.5, stepProgress: 0 })).toBeNull();
		expect(normalizeQuestProgress({ stepIndex: -1, stepProgress: 0 })).toBeNull();
		expect(
			normalizeQuestProgress({ stepIndex: QUEST_STEPS.length + 1, stepProgress: 0 })
		).toBeNull();
	});
});
