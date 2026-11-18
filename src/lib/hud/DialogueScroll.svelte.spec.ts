import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { getVillager, QUEST_STEPS } from '$lib/game/simulation/villageContent';
import DialogueScroll from './DialogueScroll.svelte';

const elder = getVillager('elder_shen');
const lu = getVillager('senior_brother_lu');

describe('DialogueScroll', () => {
	it('shows the current quest context during dialogue and removes it after completion', async () => {
		const dialogue = {
			villagerId: 'elder_shen' as const,
			speaker: elder.name,
			line: elder.questLines[0],
			lineIndex: 0,
			lineCount: elder.questLines.length
		};
		const quest = {
			stepIndex: 0,
			title: QUEST_STEPS[0].title,
			instruction: QUEST_STEPS[0].instruction
		};
		const { rerender } = render(DialogueScroll, { props: { dialogue, quest } });

		const context = page.getByTestId('dialogue-quest-context');
		await expect.element(context).toHaveTextContent(quest.title);
		await expect.element(context).toHaveTextContent('Step 1 of 5');

		await rerender({ dialogue, quest: null });
		expect(context.all()).toHaveLength(0);
	});

	it('shows the speaker, line, progress dots and E Continue hint on the prompt', async () => {
		render(DialogueScroll, {
			props: {
				dialogue: {
					villagerId: 'elder_shen',
					speaker: elder.name,
					line: elder.questLines[1],
					lineIndex: 1,
					lineCount: elder.questLines.length
				}
			}
		});

		const prompt = page.getByTestId('game-prompt');
		await expect.element(prompt).toBeInTheDocument();
		await expect.element(prompt).toHaveTextContent(`${elder.name}:`);
		await expect.element(prompt).toHaveTextContent(elder.questLines[1]);

		expect(page.getByTestId('dialogue-line-dot').all()).toHaveLength(elder.questLines.length);
		const dots = page.getByTestId('dialogue-line-dot').all();
		expect(await dots[0].element()).toHaveClass('done');
		expect(await dots[1].element()).toHaveClass('current');
		expect(await dots[2].element()).not.toHaveClass('done');

		await expect.element(page.getByText('Continue')).toBeInTheDocument();
	});

	it('maps each villager to its own portrait atlas cell', async () => {
		const { container, rerender } = render(DialogueScroll, {
			props: {
				dialogue: {
					villagerId: 'elder_shen',
					speaker: elder.name,
					line: elder.ambientLines[0],
					lineIndex: 0,
					lineCount: elder.ambientLines.length
				}
			}
		});

		const portrait = container.querySelector<HTMLElement>('[data-testid="dialogue-portrait"]')!;
		expect(portrait.style.backgroundPosition).toBe('33.3333% 0%');
		expect(container.querySelector('.speaker-title')?.textContent?.trim()).toBe('沈长老');
		expect(container.querySelector('.speaker-title')?.getAttribute('aria-hidden')).toBe('true');

		await rerender({
			dialogue: {
				villagerId: 'peddler_wei',
				speaker: getVillager('peddler_wei').name,
				line: getVillager('peddler_wei').ambientLines[0],
				lineIndex: 0,
				lineCount: 1
			}
		});

		const moved = container.querySelector<HTMLElement>('[data-testid="dialogue-portrait"]')!;
		expect(moved.style.backgroundPosition).toBe('33.3333% 100%');
		expect(container.querySelector('.speaker-title')?.textContent?.trim()).toBe('对话');
	});

	it('renders Senior Brother Lu with his portrait cell for the duel intro', async () => {
		const { container } = render(DialogueScroll, {
			props: {
				dialogue: {
					villagerId: 'senior_brother_lu',
					speaker: lu.name,
					line: lu.questLines[0],
					lineIndex: 0,
					lineCount: lu.questLines.length
				}
			}
		});

		const portrait = container.querySelector<HTMLElement>('[data-testid="dialogue-portrait"]')!;
		expect(portrait.style.backgroundPosition).toBe('66.6667% 0%');
		expect(container.querySelector('.speaker-title')?.textContent?.trim()).toBe('陆师兄');
		await expect.element(page.getByTestId('game-prompt')).toHaveTextContent(`${lu.name}:`);
	});
});
