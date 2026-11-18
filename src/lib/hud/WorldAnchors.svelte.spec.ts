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
const lu = getVillager('senior_brother_lu');
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

	it('moves a villager label clear of the action bar', async () => {
		const host = document.createElement('div');
		host.style.cssText = 'position:relative;width:960px;height:640px';
		const frame = frameAt(-5, -5);
		const head = projectWorldToScreen(
			{ x: lu.position.x, y: 1.95, z: lu.position.z },
			frame.pose,
			viewport
		);
		const actionBar = document.createElement('div');
		actionBar.className = 'action-bar';
		actionBar.style.cssText = 'position:absolute;left:210px;top:522px;width:540px;height:104px';
		host.appendChild(actionBar);
		document.body.appendChild(host);
		const { unmount } = await render(WorldAnchors, {
			target: host,
			props: {
				frame,
				villagers: [{ id: lu.id, name: lu.name, position: lu.position }],
				target: null,
				interact: null,
				prompt: null
			}
		});
		try {
			const name = host.querySelector('[data-testid="world-anchor"]');
			if (!name) throw new Error('Missing Senior Brother Lu label');
			expect(head.inView).toBe(true);
			expect(head.y).toBeGreaterThan(522);
			expect(name.getBoundingClientRect().bottom).toBeLessThanOrEqual(
				actionBar.getBoundingClientRect().top
			);
		} finally {
			await unmount();
			host.remove();
		}
	});

	it('places a villager quest marker beside the name and its interaction prompt below it', async () => {
		const host = document.createElement('div');
		host.style.cssText = 'position:relative;width:960px;height:640px';
		document.body.appendChild(host);
		const frame = frameAt(-3.2, -2.5);
		const { unmount } = await render(WorldAnchors, {
			target: host,
			props: {
				frame,
				villagers: [{ id: elder.id, name: elder.name, position: elder.position }],
				target: { id: elder.id, position: elder.position },
				interact: { id: elder.id, name: elder.name, position: elder.position },
				prompt: 'Press E to speak with Elder Shen'
			}
		});
		try {
			const name = host.querySelector('[data-testid="world-anchor"]');
			const marker = host.querySelector('[data-testid="quest-anchor"]');
			const prompt = host.querySelector('[data-testid="game-prompt"]');
			if (!name || !marker || !prompt) throw new Error('Missing villager labels');
			expect(marker.getBoundingClientRect().right).toBeLessThanOrEqual(
				name.getBoundingClientRect().left
			);
			expect(prompt.getBoundingClientRect().top).toBeGreaterThanOrEqual(
				name.getBoundingClientRect().bottom
			);
			const head = projectWorldToScreen(
				{ x: elder.position.x, y: 1.95, z: elder.position.z },
				frame.pose,
				viewport
			);
			expect(prompt.getBoundingClientRect().bottom).toBeLessThanOrEqual(
				host.getBoundingClientRect().top + head.y + 1
			);
		} finally {
			await unmount();
			host.remove();
		}
	});

	it('keeps the villager labels clear of narrow-screen HUD panels', async () => {
		const host = document.createElement('div');
		host.style.cssText = 'position:relative;width:320px;height:640px';
		for (const [name, style] of [
			['status-cluster', 'left:10px;top:12px;width:194px;height:64px'],
			['mini-map', 'left:214px;top:10px;width:96px;height:96px'],
			['objective-chip', 'left:15px;top:130px;width:230px;height:140px'],
			['action-bar', 'left:10px;top:520px;width:300px;height:108px']
		]) {
			const panel = document.createElement('div');
			if (name === 'action-bar') panel.className = name;
			else panel.dataset.testid = name;
			panel.style.cssText = `position:absolute;${style}`;
			host.appendChild(panel);
		}
		document.body.appendChild(host);
		const { unmount } = await render(WorldAnchors, {
			target: host,
			props: {
				frame: { ...frameAt(-3.2, -2.5), viewport: { width: 320, height: 640 } },
				villagers: [{ id: elder.id, name: elder.name, position: elder.position }],
				target: { id: elder.id, position: elder.position },
				interact: { id: elder.id, name: elder.name, position: elder.position },
				prompt: 'Press E to speak with Elder Shen'
			}
		});
		try {
			const hostBox = host.getBoundingClientRect();
			const labels = [
				...host.querySelectorAll(
					'[data-testid="world-anchor"], [data-testid="quest-anchor"], [data-testid="game-prompt"]'
				)
			];
			expect(labels).toHaveLength(3);
			const boxes = [
				...labels,
				...host.querySelectorAll(':scope > div:not([data-testid="world-anchors"])')
			].map((element) => element.getBoundingClientRect());
			for (const label of boxes.slice(0, labels.length)) {
				expect(label.left).toBeGreaterThanOrEqual(hostBox.left - 1);
				expect(label.right).toBeLessThanOrEqual(hostBox.right + 1);
				expect(label.top).toBeGreaterThanOrEqual(hostBox.top - 1);
				expect(label.bottom).toBeLessThanOrEqual(hostBox.bottom + 1);
			}
			for (let i = 0; i < labels.length; i++) {
				for (let j = i + 1; j < boxes.length; j++) {
					const a = boxes[i];
					const b = boxes[j];
					expect(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top).toBe(
						false
					);
				}
			}
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
