import { describe, expect, it } from 'vitest';
import { hudLayout, type HudLayoutInput } from './layout';
import type { GameModeKind } from '$lib/game/simulation/types';

const cases: { mode: GameModeKind; isPaused: boolean; bagOpen: boolean }[] = [];
for (const mode of ['explore', 'dialogue', 'duel'] as const) {
	for (const isPaused of [false, true]) {
		for (const bagOpen of [false, true]) {
			cases.push({ mode, isPaused, bagOpen });
		}
	}
}

function layout(mode: GameModeKind, isPaused = false, bagOpen = false) {
	return hudLayout({ mode, isPaused, bagOpen } satisfies HudLayoutInput);
}

describe('hudLayout', () => {
	it('shows full chrome in plain exploration', () => {
		const l = layout('explore');
		expect(l).toEqual({
			vitals: true,
			quest: 'full',
			map: true,
			anchors: true,
			techniques: true,
			rivalBar: false,
			dialogue: false,
			banner: true,
			damageNumbers: true,
			itemFeedback: true
		});
	});

	it('hides everything but the dialogue scroll in dialogue', () => {
		const l = layout('dialogue');
		expect(l.dialogue).toBe(true);
		expect(l.vitals).toBe(false);
		expect(l.quest).toBe('hidden');
		expect(l.map).toBe(false);
		expect(l.anchors).toBe(false);
		expect(l.techniques).toBe(false);
		expect(l.rivalBar).toBe(false);
		expect(l.banner).toBe(false);
		expect(l.damageNumbers).toBe(false);
		expect(l.itemFeedback).toBe(false);
	});

	it('keeps vitals and the rival bar in a duel, with the quest as one line', () => {
		const l = layout('duel');
		expect(l.vitals).toBe(true);
		expect(l.rivalBar).toBe(true);
		expect(l.quest).toBe('line');
		expect(l.map).toBe(false);
		expect(l.anchors).toBe(false);
		expect(l.techniques).toBe(true);
		expect(l.damageNumbers).toBe(true);
	});

	it('keeps the rival bar visible behind a paused duel', () => {
		const l = layout('duel', true);
		expect(l.rivalBar).toBe(true);
		expect(l.vitals).toBe(true);
		expect(l.damageNumbers).toBe(false);
		expect(l.quest).toBe('hidden');
	});

	it('hides the rival bar when the bag is open, even in a duel', () => {
		const l = layout('duel', false, true);
		expect(l.rivalBar).toBe(false);
		expect(l.vitals).toBe(false);
		expect(l.quest).toBe('hidden');
		expect(l.itemFeedback).toBe(true);
	});

	it('keeps item feedback visible while the bag is open in explore', () => {
		const l = layout('explore', false, true);
		expect(l.itemFeedback).toBe(true);
		expect(l.damageNumbers).toBe(false);
		expect(l.map).toBe(false);
		expect(l.banner).toBe(false);
	});

	it('hides the dialogue scroll when paused or bagged', () => {
		expect(layout('dialogue', true).dialogue).toBe(false);
		expect(layout('dialogue', false, true).dialogue).toBe(false);
	});

	it('produces a stable flag set for every mode/overlay combination', () => {
		for (const input of cases) {
			const l = hudLayout(input);
			if (input.bagOpen) {
				expect(l.vitals).toBe(false);
				expect(l.rivalBar).toBe(false);
				expect(l.map).toBe(false);
				expect(l.anchors).toBe(false);
				expect(l.banner).toBe(false);
				expect(l.damageNumbers).toBe(false);
				expect(l.dialogue).toBe(false);
				expect(l.quest).toBe('hidden');
			}
			if (input.isPaused) {
				expect(l.map).toBe(false);
				expect(l.anchors).toBe(false);
				expect(l.banner).toBe(false);
				expect(l.damageNumbers).toBe(false);
				expect(l.itemFeedback).toBe(false);
				expect(l.quest).toBe('hidden');
			}
			if (input.mode === 'dialogue' && !input.isPaused && !input.bagOpen) {
				expect(l.dialogue).toBe(true);
			}
		}
	});
});
