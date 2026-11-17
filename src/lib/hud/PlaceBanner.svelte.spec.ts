import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PlaceBanner from './PlaceBanner.svelte';

describe('PlaceBanner', () => {
	it('stays hidden at spawn and on unnamed travel areas', async () => {
		render(PlaceBanner, { props: { region: null } });

		expect(page.getByTestId('place-banner').all()).toHaveLength(0);
	});

	it('announces a named arrival in hanzi and english, then fades out', async () => {
		const { rerender } = render(PlaceBanner, { props: { region: null, duration: 80 } });

		await rerender({ region: 'Jadebank Market', duration: 80 });
		const banner = page.getByTestId('place-banner');
		await expect.element(banner).toBeInTheDocument();
		await expect.element(banner).toHaveTextContent('玉津集');
		await expect.element(banner).toHaveTextContent('Jadebank Market');

		await expect.element(banner).not.toBeInTheDocument();
	});

	it('hides when the region clears and re-announces the next named region', async () => {
		const { rerender } = render(PlaceBanner, {
			props: { region: 'Whispering Bamboo Shrine', duration: 60_000 }
		});
		await expect.element(page.getByTestId('place-banner')).toHaveTextContent('竹语祠');

		await rerender({ region: null, duration: 60_000 });
		await expect.element(page.getByTestId('place-banner')).not.toBeInTheDocument();

		await rerender({ region: 'Cloudrest Monastery', duration: 60_000 });
		await expect.element(page.getByTestId('place-banner')).toHaveTextContent('云栖寺');
	});

	it('stays suppressed while an overlay owns the screen', async () => {
		render(PlaceBanner, {
			props: { region: 'Jadebank Market', duration: 60_000, visible: false }
		});

		expect(page.getByTestId('place-banner').all()).toHaveLength(0);
	});
});
