import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { computeWuxiaCameraPose } from '$lib/game/render/camera';
import { getVillager, SHRINE_BELL } from '$lib/game/simulation/villageContent';
import WorldAnchors from './WorldAnchors.svelte';

const viewport = { width: 960, height: 640 };
const elder = getVillager('elder_shen');
const wei = getVillager('peddler_wei');

function frameAt(x = 0, z = 0) {
	return {
		pose: computeWuxiaCameraPose({ mode: 'explore', playerPosition: { x, z }, rival: null }),
		viewport
	};
}

describe('WorldAnchors', () => {
	it('hides every tag before the first projection frame', async () => {
		render(WorldAnchors, {
			props: {
				frame: null,
				villagers: [{ id: elder.id, name: elder.name, position: elder.position }],
				target: { id: elder.id, position: elder.position },
				interact: null,
				prompt: null
			}
		});

		expect(page.getByTestId('world-anchor').all()).toHaveLength(0);
	});

	it('labels visible villagers, the quest target and skips off-frustum heads', async () => {
		render(WorldAnchors, {
			props: {
				frame: frameAt(),
				villagers: [
					{ id: elder.id, name: elder.name, position: elder.position },
					{ id: wei.id, name: wei.name, position: wei.position }
				],
				target: { id: elder.id, position: elder.position },
				interact: null,
				prompt: null
			}
		});

		await expect.element(page.getByText(elder.name)).toBeInTheDocument();
		expect(page.getByText(wei.name).all()).toHaveLength(0);
		await expect.element(page.getByTestId('quest-anchor')).toBeInTheDocument();
	});

	it('anchors the E prompt at the interact target position with the prompt text', async () => {
		render(WorldAnchors, {
			props: {
				frame: frameAt(SHRINE_BELL.position.x, SHRINE_BELL.position.z),
				villagers: [],
				target: { id: 'shrine_bell', position: SHRINE_BELL.position },
				interact: {
					id: 'shrine_bell',
					name: 'Shrine Bell',
					position: SHRINE_BELL.position
				},
				prompt: 'Press E to ring the shrine bell'
			}
		});

		await expect
			.element(page.getByTestId('game-prompt'))
			.toHaveTextContent('Press E to ring the shrine bell');
	});
});
