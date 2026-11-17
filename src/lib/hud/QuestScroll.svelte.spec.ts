import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { QUEST_STEPS } from '$lib/game/simulation/villageContent';
import QuestScroll from './QuestScroll.svelte';

const step = { stepIndex: 1, title: QUEST_STEPS[1].title, instruction: QUEST_STEPS[1].instruction };

describe('QuestScroll', () => {
	it('shows the chain title, five step dots and the current bilingual step', async () => {
		render(QuestScroll, {
			variant: 'full',
			modeLabel: 'Quest',
			region: null,
			quest: step,
			objective: step.instruction,
			markerProgress: { current: 1, total: 3 }
		});

		await expect.element(page.getByTestId('objective-chip')).toBeInTheDocument();
		await expect
			.element(page.getByTestId('objective-chip'))
			.toHaveTextContent('First Day at the Sect');
		await expect.element(page.getByTestId('objective-chip')).toHaveTextContent(step.title);
		await expect.element(page.getByTestId('objective-chip')).toHaveTextContent(step.instruction);
		await expect.element(page.getByTestId('objective-chip')).toHaveTextContent('1/3');
		expect(page.getByTestId('quest-step-dot').all()).toHaveLength(5);
	});

	it('collapses to a single line in the duel variant', async () => {
		render(QuestScroll, {
			variant: 'line',
			modeLabel: 'Duel',
			region: null,
			quest: { stepIndex: 4, title: QUEST_STEPS[4].title, instruction: QUEST_STEPS[4].instruction },
			objective: QUEST_STEPS[4].instruction,
			markerProgress: null
		});

		await expect
			.element(page.getByTestId('objective-chip'))
			.toHaveTextContent(QUEST_STEPS[4].title);
		expect(page.getByTestId('quest-step-dot').all()).toHaveLength(0);
	});

	it('shows one free-roam line and no extra step when the quest is complete', async () => {
		render(QuestScroll, {
			variant: 'full',
			modeLabel: 'Quest',
			region: 'Jadebank Market',
			quest: null,
			objective: 'First day complete — free roam',
			markerProgress: null
		});

		await expect.element(page.getByTestId('objective-chip')).toHaveTextContent('free roam');
		await expect.element(page.getByTestId('objective-chip')).toHaveTextContent('Jadebank Market');
		expect(page.getByTestId('quest-step-dot').all()).toHaveLength(5);
	});
});
