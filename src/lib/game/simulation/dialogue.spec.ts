import { describe, expect, it } from 'vitest';
import { createInitialGameState } from './state';
import { activeDialogueLine, advanceDialogue, dialogueLinesFor } from './dialogue';
import { getVillager } from './villageContent';
import type { GameMode } from './types';

describe('dialogueLinesFor', () => {
	it('uses quest lines only while the villager is the active step target', () => {
		const elder = getVillager('elder_shen');
		const lu = getVillager('senior_brother_lu');
		const quest = { stepIndex: 0, stepProgress: 0 };

		expect(dialogueLinesFor(quest, elder)).toBe(elder.questLines);
		expect(dialogueLinesFor(quest, lu)).toBe(lu.ambientLines);
		expect(dialogueLinesFor({ stepIndex: 1, stepProgress: 0 }, elder)).toBe(elder.ambientLines);
		expect(dialogueLinesFor({ stepIndex: 1, stepProgress: 0 }, lu)).toBe(lu.ambientLines);
		expect(dialogueLinesFor({ stepIndex: 2, stepProgress: 0 }, lu)).toBe(lu.questLines);
		expect(dialogueLinesFor({ stepIndex: 3, stepProgress: 0 }, lu)).toBe(lu.ambientLines);
	});
});

describe('advanceDialogue', () => {
	it('returns the next line one call at a time and reports the villager on the last line', () => {
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
			const result = advanceDialogue(state.mode, state.quest);
			expect(result).toEqual({
				mode: { kind: 'dialogue', villagerId: 'elder_shen', lineIndex: index },
				finishedVillagerId: null
			});
			state.mode = result!.mode;
			expect(line()?.line).toBe(elder.questLines[index]);
		}

		expect(advanceDialogue(state.mode, state.quest)).toEqual({
			mode: { kind: 'explore' },
			finishedVillagerId: 'elder_shen'
		});
	});

	it('does nothing outside dialogue mode', () => {
		const state = createInitialGameState();

		expect(advanceDialogue(state.mode, state.quest)).toBeNull();
		expect(state.mode).toEqual({ kind: 'explore' });
	});

	it('never mutates the mode it advances, so stepGame stays the only mutator', () => {
		const state = createInitialGameState();
		const mode = Object.freeze<GameMode>({
			kind: 'dialogue',
			villagerId: 'elder_shen',
			lineIndex: 0
		});

		const result = advanceDialogue(mode, state.quest);

		expect(mode).toEqual({ kind: 'dialogue', villagerId: 'elder_shen', lineIndex: 0 });
		expect(result?.mode).toEqual({
			kind: 'dialogue',
			villagerId: 'elder_shen',
			lineIndex: 1
		});
	});
});
