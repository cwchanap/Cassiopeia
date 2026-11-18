import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import {
	computeWuxiaCameraPose,
	followCameraPose,
	projectWorldToScreen
} from '$lib/game/render/camera';
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

	it('keeps an interaction prompt available when there is no unobstructed position', async () => {
		const host = document.createElement('div');
		host.style.cssText = 'position:relative;width:960px;height:640px';
		const obstacle = document.createElement('div');
		obstacle.dataset.testid = 'mini-map';
		obstacle.style.cssText = 'position:absolute;inset:0';
		host.appendChild(obstacle);
		document.body.appendChild(host);

		const { unmount } = await render(WorldAnchors, {
			target: host,
			props: {
				frame: frameAt(),
				villagers: [],
				target: null,
				interact: { id: elder.id, name: elder.name, position: elder.position },
				prompt: 'Press E to speak with Elder Shen'
			}
		});
		try {
			const prompt = host.querySelector<HTMLElement>('[data-testid="game-prompt"]')!;
			expect(prompt).not.toBeNull();
			expect(getComputedStyle(prompt).visibility).toBe('visible');
			expect(prompt.textContent).toBe('Press E to speak with Elder Shen');
		} finally {
			await unmount();
			host.remove();
		}
	});

	it('anchors the E prompt at the projected interact position through follow lag and resize', async () => {
		const bell = SHRINE_BELL.position;
		const villagerPosition = { x: bell.x + 3, z: bell.z + 1 };
		const targetPosition = { x: bell.x - 3.5, z: bell.z - 2 };
		const desiredPose = computeWuxiaCameraPose({
			mode: 'explore',
			playerPosition: bell,
			rival: null
		});
		const trailingPose = computeWuxiaCameraPose({
			mode: 'explore',
			playerPosition: { x: bell.x + 6, z: bell.z + 4 },
			rival: null
		});
		const laggedPose = followCameraPose(trailingPose, desiredPose, 0.4);

		const { container, rerender } = render(WorldAnchors, {
			props: {
				frame: { pose: laggedPose, viewport },
				villagers: [{ id: elder.id, name: elder.name, position: villagerPosition }],
				target: { id: 'gate_markers', position: targetPosition },
				interact: { id: 'shrine_bell', name: 'Shrine Bell', position: bell },
				prompt: 'Press E to ring the shrine bell'
			}
		});

		const prompt = container.querySelector<HTMLElement>('[data-testid="game-prompt"]')!;
		const nameTag = container.querySelector<HTMLElement>('[data-testid="world-anchor"]')!;
		const questTag = container.querySelector<HTMLElement>('[data-testid="quest-anchor"]')!;
		expect(prompt).not.toBeNull();
		expect(nameTag).not.toBeNull();
		expect(questTag).not.toBeNull();
		expect(prompt.textContent).toBe('Press E to ring the shrine bell');

		function expectedTop(point: { x: number; z: number }, height: number) {
			return projectWorldToScreen({ x: point.x, y: height, z: point.z }, laggedPose, viewport);
		}

		const bellScreen = expectedTop(bell, 1.6);
		expect(bellScreen.inView).toBe(true);
		expect(parseFloat(prompt.style.left)).toBeCloseTo(bellScreen.x, 1);
		expect(parseFloat(prompt.style.top)).toBeCloseTo(bellScreen.y, 1);
		expect(
			Math.abs(parseFloat(prompt.style.left) - expectedTop(villagerPosition, 1.95).x)
		).toBeGreaterThan(20);
		expect(
			Math.abs(parseFloat(prompt.style.left) - expectedTop(targetPosition, 1.7).x)
		).toBeGreaterThan(20);

		const resized = { width: 480, height: 800 };
		const laggedAgain = followCameraPose(laggedPose, desiredPose, 0.6);
		await rerender({
			frame: { pose: laggedAgain, viewport: resized },
			villagers: [{ id: elder.id, name: elder.name, position: villagerPosition }],
			target: { id: 'gate_markers', position: targetPosition },
			interact: { id: 'shrine_bell', name: 'Shrine Bell', position: bell },
			prompt: 'Press E to ring the shrine bell'
		});

		const resizedPrompt = container.querySelector<HTMLElement>('[data-testid="game-prompt"]')!;
		const resizedScreen = projectWorldToScreen(
			{ x: bell.x, y: 1.6, z: bell.z },
			laggedAgain,
			resized
		);
		expect(resizedScreen.inView).toBe(true);
		expect(parseFloat(resizedPrompt.style.left)).toBeCloseTo(resizedScreen.x, 1);
		expect(parseFloat(resizedPrompt.style.top)).toBeCloseTo(resizedScreen.y, 1);
	});
});
