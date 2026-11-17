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

	it('derives the initial objective from the first HUD snapshot', async () => {
		render(Page);

		await expect.element(page.getByTestId('objective-chip')).toHaveTextContent('拜师 Pay Respects');
		await expect
			.element(page.getByTestId('objective-chip'))
			.toHaveTextContent('Pay respects to Elder Shen in the courtyard');
	});

	it('shows the exploration minimap and no game-prompt without an interact target', async () => {
		render(Page);

		await expect.element(page.getByTestId('mini-map')).toBeInTheDocument();
		expect(page.getByTestId('game-prompt').all()).toHaveLength(0);
	});

	it('keeps the dialogue scroll, rival meter and damage numbers out of plain explore', async () => {
		render(Page);

		expect(page.getByTestId('dialogue-scroll').all()).toHaveLength(0);
		expect(page.getByRole('meter', { name: 'Rival health' }).all()).toHaveLength(0);
		expect(page.getByTestId('damage-number').all()).toHaveLength(0);
	});
});
