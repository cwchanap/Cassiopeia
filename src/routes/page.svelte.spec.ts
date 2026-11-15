import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

describe('Wuxia MVP route', () => {
	it('renders the game shell and HUD regions', async () => {
		render(Page);

		await expect.element(page.getByTestId('game-shell')).toBeInTheDocument();
		await expect.element(page.getByTestId('objective-chip')).toBeInTheDocument();
		await expect.element(page.getByTestId('status-cluster')).toBeInTheDocument();
	});

	it('derives the initial objective and prompt from the first HUD snapshot', async () => {
		render(Page);

		await expect.element(page.getByTestId('objective-chip')).toHaveTextContent('拜师 Pay Respects');
		await expect
			.element(page.getByTestId('objective-chip'))
			.toHaveTextContent('Pay respects to Elder Shen in the courtyard');
		await expect
			.element(page.getByTestId('game-prompt'))
			.toHaveTextContent('Press E to speak with Senior Brother Lu');
	});
});
