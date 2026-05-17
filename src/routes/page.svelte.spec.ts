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
});
