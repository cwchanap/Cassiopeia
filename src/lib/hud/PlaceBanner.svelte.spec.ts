import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PlaceBanner from './PlaceBanner.svelte';

const LONG = 60_000;
const SHORT = 150;

describe('PlaceBanner', () => {
	it('stays hidden at spawn and on unnamed travel areas', async () => {
		render(PlaceBanner, { props: { region: null } });

		expect(page.getByTestId('place-banner').all()).toHaveLength(0);
	});

	it('announces a named arrival in hanzi and english, then fades out', async () => {
		const { rerender } = render(PlaceBanner, { props: { region: null, duration: SHORT } });

		await rerender({ region: 'Jadebank Market', duration: SHORT });
		const banner = page.getByTestId('place-banner');
		await expect.element(banner).toBeInTheDocument();
		await expect.element(banner).toHaveTextContent('玉津集');
		await expect.element(banner).toHaveTextContent('Jadebank Market');

		await expect.element(banner).not.toBeInTheDocument();
	});

	it('hides when the region clears and re-announces the next named region', async () => {
		const { rerender } = render(PlaceBanner, {
			props: { region: 'Whispering Bamboo Shrine', duration: LONG }
		});
		await expect.element(page.getByTestId('place-banner')).toHaveTextContent('竹语祠');

		await rerender({ region: null, duration: LONG });
		await expect.element(page.getByTestId('place-banner')).not.toBeInTheDocument();

		await rerender({ region: 'Cloudrest Monastery', duration: LONG });
		await expect.element(page.getByTestId('place-banner')).toHaveTextContent('云栖寺');
	});

	it('re-announces the same region when it is entered again after expiry', async () => {
		const { rerender } = render(PlaceBanner, { props: { region: null, duration: SHORT } });
		const banner = page.getByTestId('place-banner');

		await rerender({ region: 'Jadebank Market', duration: SHORT });
		await expect.element(banner).toBeInTheDocument();
		await expect.element(banner).not.toBeInTheDocument();

		await rerender({ region: null, duration: SHORT });
		await rerender({ region: 'Jadebank Market', duration: SHORT });
		await expect.element(banner).toBeInTheDocument();
		await expect.element(banner).toHaveTextContent('玉津集');
	});

	it('re-announces a region after visiting another (A to B to A)', async () => {
		const { rerender } = render(PlaceBanner, {
			props: { region: 'Whispering Bamboo Shrine', duration: SHORT }
		});
		const banner = page.getByTestId('place-banner');
		await expect.element(banner).toBeInTheDocument();
		await expect.element(banner).not.toBeInTheDocument();

		await rerender({ region: 'Cloudrest Monastery', duration: SHORT });
		await expect.element(banner).toBeInTheDocument();
		await expect.element(banner).not.toBeInTheDocument();

		await rerender({ region: 'Whispering Bamboo Shrine', duration: SHORT });
		await expect.element(banner).toBeInTheDocument();
		await expect.element(banner).toHaveTextContent('竹语祠');
	});

	it('hides under an overlay without losing the remaining display time', async () => {
		const { rerender } = render(PlaceBanner, {
			props: { region: 'Jadebank Market', duration: LONG, visible: true }
		});
		const banner = page.getByTestId('place-banner');
		await expect.element(banner).toBeVisible();

		await rerender({ region: 'Jadebank Market', duration: LONG, visible: false });
		await expect.element(banner).not.toBeVisible();

		await rerender({ region: 'Jadebank Market', duration: LONG, visible: true });
		await expect.element(banner).toBeVisible();
	});

	it('does not replay an arrival that expired while an overlay was up', async () => {
		const { rerender } = render(PlaceBanner, {
			props: { region: 'Jadebank Market', duration: SHORT, visible: true }
		});
		const banner = page.getByTestId('place-banner');
		await expect.element(banner).toBeVisible();

		await rerender({ region: 'Jadebank Market', duration: SHORT, visible: false });
		await expect.element(banner).not.toBeVisible();
		await new Promise((resolve) => setTimeout(resolve, SHORT + 500));

		await rerender({ region: 'Jadebank Market', duration: SHORT, visible: true });
		await expect.element(banner).not.toBeInTheDocument();
	});

	it('clears its timer on unmount without leaking errors', async () => {
		const { unmount } = render(PlaceBanner, {
			props: { region: 'Jadebank Market', duration: SHORT }
		});
		await expect.element(page.getByTestId('place-banner')).toBeInTheDocument();

		unmount();
		await new Promise((resolve) => setTimeout(resolve, SHORT + 500));
		expect(page.getByTestId('place-banner').all()).toHaveLength(0);
	});
});
