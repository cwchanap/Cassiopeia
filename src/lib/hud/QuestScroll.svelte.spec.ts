import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';
import { QUEST_STEPS } from '$lib/game/simulation/villageContent';
import QuestScroll from './QuestScroll.svelte';
import './hud.css';

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
		await expect.element(page.getByTestId('objective-chip')).toHaveTextContent('Step 5 of 5');
		const title = document.querySelector<HTMLElement>('.quest-scroll strong')!;
		expect(title.scrollWidth).toBeLessThanOrEqual(title.clientWidth);
		expect(page.getByTestId('quest-step-dot').all()).toHaveLength(0);
	});

	it('reveals the full duel objective on keyboard focus even when the HUD ignores pointer events', async () => {
		document.body.classList.add('hud-layer');
		document.body.style.pointerEvents = 'none';
		try {
			const quest = {
				stepIndex: 4,
				title: QUEST_STEPS[4].title,
				instruction: QUEST_STEPS[4].instruction
			};
			const { container } = render(QuestScroll, {
				variant: 'line',
				modeLabel: 'Duel',
				region: null,
				quest,
				objective: quest.instruction,
				markerProgress: null
			});
			const trigger = container.querySelector<HTMLButtonElement>('.quest-detail-trigger')!;
			const detail = container.querySelector<HTMLElement>('[role="tooltip"]')!;
			expect(trigger.textContent).toContain('Spar with the rival');
			expect(trigger.scrollWidth).toBeLessThanOrEqual(trigger.clientWidth);
			expect(getComputedStyle(trigger).pointerEvents).toBe('auto');
			expect(getComputedStyle(detail).visibility).toBe('hidden');
			trigger.focus();
			expect(getComputedStyle(detail).visibility).toBe('visible');
			expect(detail.textContent).toBe(quest.instruction);
			trigger.click();
			await tick();
			trigger.blur();
			expect(trigger.getAttribute('aria-pressed')).toBe('true');
			expect(getComputedStyle(detail).visibility).toBe('visible');
			trigger.click();
			await tick();
			expect(trigger.getAttribute('aria-pressed')).toBe('false');
			expect(getComputedStyle(detail).visibility).toBe('hidden');
		} finally {
			document.body.classList.remove('hud-layer');
			document.body.style.pointerEvents = '';
		}
	});

	it('stacks the bilingual step title on Cormorant then the small CJK serif fallback', async () => {
		document.body.classList.add('hud-layer');
		try {
			render(QuestScroll, {
				variant: 'full',
				modeLabel: 'Quest',
				region: null,
				quest: step,
				objective: step.instruction,
				markerProgress: null
			});

			const strong = document.querySelector('.quest-scroll strong');
			expect(strong).not.toBeNull();
			const family = getComputedStyle(strong!).fontFamily;
			expect(family).toContain('Cormorant Garamond');
			expect(family).toContain('Songti SC');
			expect(family).toContain('Ma Shan Zheng');
			expect(family.indexOf('Songti SC')).toBeLessThan(family.indexOf('Ma Shan Zheng'));
		} finally {
			document.body.classList.remove('hud-layer');
		}
	});

	it('collapses to one visually rendered line with the long objective still exposed', async () => {
		document.body.classList.add('hud-layer');
		try {
			const longStep = QUEST_STEPS.reduce((a, b) =>
				a.instruction.length + a.title.length >= b.instruction.length + b.title.length ? a : b
			);
			const quest = { stepIndex: 2, title: longStep.title, instruction: longStep.instruction };
			render(QuestScroll, {
				variant: 'line',
				modeLabel: 'Duel',
				region: 'Jadebank Market',
				quest,
				objective: longStep.instruction,
				markerProgress: null
			});

			const chip = document.querySelector<HTMLElement>('[data-testid="objective-chip"]');
			const strong = chip?.querySelector<HTMLElement>('strong');
			expect(strong).not.toBeNull();
			const strongRect = strong!.getBoundingClientRect();
			const chipRect = chip!.getBoundingClientRect();
			const lineHeight = parseFloat(getComputedStyle(strong!).lineHeight);
			expect(strongRect.height).toBeLessThanOrEqual(lineHeight * 1.5);
			expect(strongRect.right).toBeLessThanOrEqual(chipRect.right + 0.5);
			expect(strongRect.left).toBeGreaterThanOrEqual(chipRect.left - 0.5);
			expect(strong!.textContent).toContain(longStep.title);
			expect(chip!.textContent).toContain(longStep.instruction);
			expect(strong!.getAttribute('title')).toBe(`${longStep.title} · ${longStep.instruction}`);
		} finally {
			document.body.classList.remove('hud-layer');
		}
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
