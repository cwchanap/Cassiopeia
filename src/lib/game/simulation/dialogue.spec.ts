import { describe, expect, it } from 'vitest';
import { createInitialGameState } from './state';
import { activeDialogueLine, advanceDialogue, dialogueLinesFor } from './dialogue';
import { getVillager } from './villageContent';

describe('dialogueLinesFor', () => {
	it('uses quest lines only while the villager is the active step target', () => {
		const elder = getVillager('elder_shen');
		const lu = getVillager('senior_brother_lu');
		const quest = { stepIndex: 0, stepProgress: 0 };

		expect(dialogueLinesFor(quest, elder)).toBe(elder.questLines);
		expect(dialogueLinesFor(quest, lu)).toBe(lu.ambientLines);
		expect(dialogueLinesFor({ stepIndex: 1, stepProgress: 0 }, elder)).toBe(elder.ambientLines);
		expect(dialogueLinesFor({ stepIndex: 1, stepProgress: 0 }, lu)).toBe(lu.questLines);
		expect(dialogueLinesFor({ stepIndex: 2, stepProgress: 0 }, lu)).toBe(lu.ambientLines);
	});
});

describe('advanceDialogue', () => {
	it('advances one line per call and reports the villager on the last line', () => {
		const state = createInitialGameState();
		const elder = getVillager('elder_shen');
		state.mode = { kind: 'dialogue', villagerId: 'elder_shen', lineIndex: 0 };

		const line = () => activeDialogueLine(state);
		expect(line()).toMatchObject({
			speaker: elder.name,
			line: elder.questLines[0],
			lineIndex: 0,
			lineCount: elder.questLines.length
		});

		for (let index = 1; index < elder.questLines.length; index++) {
			expect(advanceDialogue(state)).toBeNull();
			expect(state.mode).toEqual({
				kind: 'dialogue',
				villagerId: 'elder_shen',
				lineIndex: index
			});
			expect(line()?.line).toBe(elder.questLines[index]);
		}

		expect(advanceDialogue(state)).toBe('elder_shen');
		expect(state.mode).toEqual({ kind: 'explore' });
		expect(activeDialogueLine(state)).toBeNull();
	});

	it('does nothing outside dialogue mode', () => {
		const state = createInitialGameState();

		expect(advanceDialogue(state)).toBeNull();
		expect(state.mode).toEqual({ kind: 'explore' });
	});
});
