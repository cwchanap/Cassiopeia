import { describe, expect, it } from 'vitest';
import { QUEST_STEPS } from './villageContent';
import { activeQuestStep, advanceQuest, createInitialQuest } from './quest';

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
		expect(activeQuestStep(next)?.id).toBe('spar');
	});

	it('ignores events that do not match the active step kind', () => {
		const quest = createInitialQuest();

		expect(advanceQuest(quest, { type: 'duelWon' }).stepIndex).toBe(0);

		const atSpar = { stepIndex: 1, stepProgress: 0 };
		expect(
			advanceQuest(atSpar, { type: 'dialogueComplete', villagerId: 'senior_brother_lu' }).stepIndex
		).toBe(1);
		expect(
			advanceQuest(atSpar, { type: 'dialogueComplete', villagerId: 'elder_shen' }).stepIndex
		).toBe(1);
	});

	it('completes the quest on the duel win and stays complete', () => {
		const atSpar = { stepIndex: 1, stepProgress: 0 };

		const done = advanceQuest(atSpar, { type: 'duelWon' });
		expect(done.stepIndex).toBe(QUEST_STEPS.length);
		expect(activeQuestStep(done)).toBeNull();

		const stillDone = advanceQuest(done, { type: 'duelWon' });
		expect(stillDone.stepIndex).toBe(QUEST_STEPS.length);
	});
});
