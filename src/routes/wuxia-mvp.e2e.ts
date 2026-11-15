import { expect, test, type Page } from '@playwright/test';
import { computeWuxiaCameraPose, projectWorldToScreen } from '../lib/game/render/camera';
import { DASH_MARKERS, getVillager } from '../lib/game/simulation/villageContent';
import type { Vec2 } from '../lib/game/simulation/types';

const VIEWPORT = { width: 960, height: 640 };

// Keep software WebGL affordable while exercising the full gameplay and persistence flow.
test.use({ viewport: VIEWPORT });

const rewardItemsByName: Record<string, { testId: string; countBeforeReward: number }> = {
	'Lesser Healing Pill': { testId: 'bag-item-lesser_healing_pill', countBeforeReward: 5 },
	'Lesser Qi Pill': { testId: 'bag-item-lesser_qi_pill', countBeforeReward: 1 },
	'Tempered Practice Sword': { testId: 'bag-item-tempered_practice_sword', countBeforeReward: 0 },
	'Reinforced Training Robe': { testId: 'bag-item-reinforced_training_robe', countBeforeReward: 0 },
	'Jade Breathing Charm': { testId: 'bag-item-jade_breathing_charm', countBeforeReward: 0 }
};

async function expectBagItemCount(page: Page, testId: string, count: number): Promise<void> {
	const bagItem = page.getByTestId(testId);

	await expect(bagItem).toBeVisible();
	await expect(bagItem).toContainText(new RegExp(`x${count}(?!\\d)`), { timeout: 15000 });
}

const elder = getVillager('elder_shen');
const lu = getVillager('senior_brother_lu');
const qin = getVillager('auntie_qin');

type CanvasProbe = { samples: number; varied: number; warm: number; colors: number };

function projectAt(point: { x: number; y: number; z: number }, focus: Vec2) {
	const pose = computeWuxiaCameraPose({ mode: 'explore', playerPosition: focus, rival: null });
	return projectWorldToScreen(point, pose, VIEWPORT);
}

async function probeCanvas(page: Page, x: number, y: number, radius: number): Promise<CanvasProbe> {
	return page.evaluate(
		([cx, cy, radius]) => {
			const empty = { samples: 0, varied: 0, warm: 0, colors: 0 };
			const canvas = document.querySelector<HTMLCanvasElement>('canvas.wuxia-canvas');
			if (!canvas || canvas.width < 8 || canvas.clientWidth === 0) return empty;
			const probe = document.createElement('canvas');
			probe.width = canvas.width;
			probe.height = canvas.height;
			const ctx = probe.getContext('2d', { willReadFrequently: true });
			if (!ctx) return empty;
			ctx.drawImage(canvas, 0, 0);
			const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
			const corner = (4 * canvas.width + 4) * 4;
			const br = data[corner];
			const bg = data[corner + 1];
			const bb = data[corner + 2];
			const scale = (canvas.width / canvas.clientWidth + canvas.height / canvas.clientHeight) / 2;
			const px = Math.round((cx * canvas.width) / canvas.clientWidth);
			const py = Math.round((cy * canvas.height) / canvas.clientHeight);
			const pr = Math.max(4, Math.round(radius * scale));
			const buckets = new Set<number>();
			const stats = { samples: 0, varied: 0, warm: 0, colors: 0 };
			for (let sy = Math.max(0, py - pr); sy <= Math.min(canvas.height - 1, py + pr); sy += 2) {
				for (let sx = Math.max(0, px - pr); sx <= Math.min(canvas.width - 1, px + pr); sx += 2) {
					if ((sx - px) * (sx - px) + (sy - py) * (sy - py) > pr * pr) continue;
					const i = (sy * canvas.width + sx) * 4;
					const red = data[i];
					const green = data[i + 1];
					const blue = data[i + 2];
					stats.samples += 1;
					buckets.add((red >> 4) * 256 + (green >> 4) * 16 + (blue >> 4));
					if (Math.abs(red - br) + Math.abs(green - bg) + Math.abs(blue - bb) > 60) {
						stats.varied += 1;
					}
					if (red > 140 && red - blue > 40 && green > blue) stats.warm += 1;
				}
			}
			stats.colors = buckets.size;
			return stats;
		},
		[x, y, radius] as const
	);
}

test('plays through the first day quest, duel, reward, and free roam', async ({
	page
}, testInfo) => {
	// Software WebGL can drop below 5 fps; the capped simulation step then advances only a
	// fraction of a game second per wall second, so keep wall-clock limits generous.
	test.setTimeout(420000);
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();

	await expect(page.getByTestId('game-shell')).toBeVisible();
	await expect(page.getByTestId('objective-chip')).toContainText(
		'Pay respects to Elder Shen in the courtyard'
	);
	await expect(page.locator('canvas')).toBeVisible();
	// A slow GLB load on a loaded host can exceed the 5 s assertion default; wait out
	// 'loading' with a real budget, then require 'ready' so 'fallback' still fails.
	await expect(page.locator('canvas')).not.toHaveAttribute('data-assets', 'loading', {
		timeout: 30000
	});
	await expect(page.locator('canvas')).toHaveAttribute('data-assets', 'ready');
	await expect(page.getByTestId('status-cluster')).toContainText('110/110');
	await expect(page.getByRole('meter', { name: 'Health', exact: true })).toHaveAttribute(
		'value',
		'110'
	);
	await expect(page.getByTestId('quick-slot-1')).toContainText('Heal Pill');
	await expect(page.getByTestId('quick-slot-2')).toContainText('x2');

	const spawnFocus = { x: 0, z: 0 };
	const elderPoint = projectAt({ ...elder.position, y: 1 }, spawnFocus);
	const luPoint = projectAt({ ...lu.position, y: 1 }, spawnFocus);
	expect(elderPoint.inView).toBe(true);
	expect(luPoint.inView).toBe(true);
	const elderProbe = await probeCanvas(page, elderPoint.x, elderPoint.y, 45);
	const luProbe = await probeCanvas(page, luPoint.x, luPoint.y, 35);
	expect(elderProbe.colors).toBeGreaterThanOrEqual(10);
	expect(luProbe.colors).toBeGreaterThanOrEqual(10);
	await testInfo.attach('first-day-opening-960x640.png', {
		body: await page.screenshot(),
		contentType: 'image/png'
	});

	await page.getByTestId('bag-toggle').click();
	await expect(page.getByTestId('bag-panel')).toBeVisible();
	await expect(page.getByTestId('bag-close')).toBeFocused();
	await page.keyboard.press('Shift+Tab');
	await expect(page.getByTestId('bag-panel').locator(':focus')).toHaveCount(1);
	await expect(page.getByTestId('bag-item-training_sword')).toContainText('Equipped');
	await page.getByTestId('bag-assign-lesser_qi_pill-slot-3').click();
	await expect(page.getByTestId('item-feedback')).toHaveText('Assigned Lesser Qi Pill to slot 3');
	await expect(page.getByTestId('bag-assign-lesser_qi_pill-slot-3')).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page.getByTestId('bag-close').click();
	await expect(page.getByTestId('bag-panel')).toBeHidden();
	await expect(page.getByTestId('bag-toggle')).toBeFocused();
	await expect(page.getByTestId('quick-slot-3')).toContainText('Qi Pill');

	const prompt = page.getByTestId('game-prompt');
	const renderedFrames = (count: number) =>
		page.evaluate(
			(ticks) =>
				new Promise<void>((resolve) => {
					let remaining = ticks;
					const tick = () => {
						remaining -= 1;
						if (remaining <= 0) {
							resolve();
						} else {
							requestAnimationFrame(tick);
						}
					};
					requestAnimationFrame(tick);
				}),
			count
		);
	const walkFramesToPrompt = async (keys: string[], text: string) => {
		await expect(async () => {
			for (const key of keys) {
				await page.keyboard.down(key);
			}
			await renderedFrames(3);
			for (const key of keys) {
				await page.keyboard.up(key);
			}
			await renderedFrames(1);
			expect(await prompt.innerText().catch(() => '')).toBe(text);
		}).toPass({ timeout: 120000 });
	};

	await walkFramesToPrompt(['w'], 'Press E to speak with Elder Shen');

	await page.keyboard.press('e');
	await expect(prompt).toBeInViewport();
	await expect(prompt).toContainText('Elder Shen:');
	await expect(page.getByTestId('bag-toggle')).toBeDisabled();
	await page.keyboard.press('i');
	await expect(page.getByTestId('bag-panel')).toBeHidden();
	await expect(prompt).toContainText('So you are the new initiate');
	await page.keyboard.press('e');
	await expect(prompt).toContainText('From today you train beneath this roof');
	await page.keyboard.press('e');
	await expect(prompt).toContainText('Senior Brother Lu waits by the duel ring');
	await page.keyboard.press('e');
	const objectiveChip = page.getByTestId('objective-chip');
	await expect(objectiveChip).toContainText('Dash through the three gate markers in order');
	await expect(objectiveChip).toContainText('0/3');
	await expect(page.getByTestId('bag-toggle')).toBeEnabled();

	const markerPoint = projectAt({ ...DASH_MARKERS[0], y: 0.1 }, elder.position);
	const markerProbe = await probeCanvas(page, markerPoint.x, markerPoint.y, 95);
	expect(markerProbe.warm).toBeGreaterThan(3);

	await page.reload();
	await expect(page.getByTestId('game-shell')).toBeVisible();
	await expect(objectiveChip).toContainText('Dash through the three gate markers in order');
	await expect(objectiveChip).toContainText('0/3');
	await expect(page.getByTestId('quick-slot-3')).toContainText('Qi Pill');
	await expect(prompt).toHaveText('Press E to speak with Senior Brother Lu');

	const qinggongReady = page.locator('.technique', { hasText: 'Qinggong' }).locator('small');
	let markerTaps = 0;
	const dashThroughNextMarker = async (expected: RegExp) => {
		await expect(async () => {
			const [first, second] = markerTaps++ % 2 ? ['w', 'd'] : ['d', 'w'];
			await page.keyboard.down(first);
			await page.keyboard.down(second);
			await renderedFrames(2);
			await page.keyboard.press('Space');
			await renderedFrames(3);
			await page.keyboard.up(first);
			await page.keyboard.up(second);
			await expect(qinggongReady).toHaveText('Ready', { timeout: 90000 });
			expect(await objectiveChip.innerText()).toMatch(expected);
		}).toPass({ timeout: 150000 });
	};
	await dashThroughNextMarker(/1\/3/);
	await dashThroughNextMarker(/2\/3/);
	await dashThroughNextMarker(/Fetch medicine from Auntie Qin/);

	await page.reload();
	await expect(page.getByTestId('game-shell')).toBeVisible();
	await expect(objectiveChip).toContainText('Fetch medicine from Auntie Qin');
	await expect(prompt).toHaveText('Press E to speak with Senior Brother Lu');

	await walkFramesToPrompt(['w', 'd'], 'Press E to speak with Auntie Qin');

	await renderedFrames(8);
	const qinPoint = projectAt({ ...qin.position, y: 1 }, qin.position);
	const qinProbe = await probeCanvas(page, qinPoint.x, qinPoint.y, 95);
	expect(qinProbe.colors).toBeGreaterThanOrEqual(10);

	await page.keyboard.press('e');
	await expect(prompt).toContainText('Auntie Qin:');
	await expect(prompt).toContainText('He sends every first-day disciple to me');
	await page.keyboard.press('e');
	await expect(prompt).toContainText('Two Lesser Healing Pills');
	await page.keyboard.press('e');
	await expect(prompt).toContainText('set it on a quick slot');
	await page.keyboard.press('e');
	await expect(prompt).toHaveText('Press E to speak with Auntie Qin');
	await expect(objectiveChip).toContainText('Fetch medicine from Auntie Qin');
	await expect(page.getByTestId('item-feedback')).toHaveText('Received Lesser Healing Pill x2');

	await page.getByTestId('bag-toggle').click();
	await expect(page.getByTestId('bag-panel')).toBeVisible();
	await expectBagItemCount(page, 'bag-item-lesser_healing_pill', 5);
	await page.getByTestId('bag-assign-lesser_healing_pill-slot-1').click();
	await expect(page.getByTestId('item-feedback')).toHaveText(
		'Assigned Lesser Healing Pill to slot 1'
	);
	await page.getByTestId('bag-close').click();
	await expect(page.getByTestId('bag-panel')).toBeHidden();
	await expect(objectiveChip).toContainText('Whispering Bamboo Shrine');

	await page.evaluate(() => {
		localStorage.setItem(
			'cassiopeia.gameProgress.v2',
			JSON.stringify({
				items: {
					version: 1,
					inventory: {
						lesser_healing_pill: 5,
						lesser_qi_pill: 2,
						training_sword: 1,
						linen_training_robe: 1
					},
					equipment: {
						weapon: 'training_sword',
						robe: 'linen_training_robe',
						accessory: null
					},
					quickSlots: {
						1: 'lesser_healing_pill',
						2: 'lesser_qi_pill',
						3: 'lesser_qi_pill'
					},
					rewardSeed: 7,
					lastReward: null
				},
				quest: { stepIndex: 4, stepProgress: 0 }
			})
		);
	});
	await page.reload();
	await expect(page.getByTestId('game-shell')).toBeVisible();
	await expect(objectiveChip).toContainText('Speak with Senior Brother Lu and win the spar');
	await expect(prompt).toHaveText('Press E to speak with Senior Brother Lu');

	await page.keyboard.press('e');
	await expect(prompt).toContainText('Senior Brother Lu:');
	await expect(prompt).toContainText('Elder Shen sent you?');

	await page.keyboard.press('Escape');
	await expect(page.getByTestId('pause-panel')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('pause-panel')).toBeHidden();
	await expect(prompt).toContainText('Senior Brother Lu:');

	await page.keyboard.press('e');
	await expect(prompt).toContainText('Enough talk');
	await page.keyboard.press('e');
	await expect(prompt).toHaveText('J: strike  K: qi burst  Space: dash');
	await expect(page.getByRole('meter', { name: 'Rival health' })).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(page.getByTestId('pause-panel')).toBeVisible();
	await expect(page.getByRole('meter', { name: 'Rival health' })).toBeVisible();
	const pauseBox = (await page.getByTestId('pause-panel').boundingBox())!;
	expect(
		await page.evaluate(
			({ x, y }) =>
				document.elementFromPoint(x, y)?.closest('[data-testid]')?.getAttribute('data-testid') ??
				null,
			{ x: pauseBox.x + pauseBox.width / 2, y: pauseBox.y + pauseBox.height / 2 }
		)
	).toBe('pause-panel');
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('pause-panel')).toBeHidden();

	// The rival can stagger the player before the first burst, consuming that key press.
	await expect(async () => {
		await page.keyboard.press('k');
		await expect(page.getByRole('meter', { name: 'Qi', exact: true })).toHaveAttribute(
			'value',
			/^(?:6[5-9]|[78][0-9]|9[0-9])$/,
			{ timeout: 1000 }
		);
		await expect(page.getByTestId('status-cluster')).toContainText(
			/(?:6[5-9]|[78][0-9]|9[0-9])\/100/,
			{ timeout: 1000 }
		);
	}).toPass({ timeout: 15000 });
	await page.keyboard.press('3');
	await expect(page.getByTestId('item-feedback')).toHaveText('Used Lesser Qi Pill');
	await expect(page.getByTestId('quick-slot-3')).toContainText('x1');

	// Each rendered frame advances at most 50 ms of game time, so under software WebGL
	// the duel can lag wall time several-fold. Keep attacking while the rival's health
	// keeps dropping; only a sustained stall or the overall deadline fails the journey.
	const rivalMeter = page.getByRole('meter', { name: 'Rival health' });
	// The meter only exists during the duel; once it is gone the end state is showing.
	const readRivalHealth = () =>
		rivalMeter
			.getAttribute('value', { timeout: 2000 })
			.then((value) => Number(value))
			.catch(() => null);
	const duelDeadline = Date.now() + 150000;
	let rivalHealth = 100;
	let lastProgress = Date.now();
	let presses = 0;

	while (await rivalMeter.isVisible().catch(() => false)) {
		if (Date.now() > duelDeadline) {
			throw new Error(`Duel timed out with the rival at ${rivalHealth}/100 health`);
		}
		// Every fourth press spends regenerated qi on a burst instead of a light strike.
		await page.keyboard.press(presses % 4 === 3 ? 'k' : 'j');
		presses += 1;
		const health = await readRivalHealth();
		if (health !== null && health < rivalHealth) {
			rivalHealth = health;
			lastProgress = Date.now();
		} else if (Date.now() - lastProgress > 30000) {
			throw new Error(`Duel stalled with the rival at ${rivalHealth}/100 health`);
		}
		await page.waitForTimeout(150);
	}

	await expect(page.getByTestId('objective-chip')).toContainText('free roam');
	await expect(page.getByTestId('item-feedback')).toContainText('Won:');
	const rewardPrompt = await page.getByTestId('item-feedback').innerText();
	const rewardMatch = rewardPrompt.match(/Won: (?<name>.+?) x(?<count>\d+)/);
	const rewardName = rewardMatch?.groups?.name;
	const rewardCount = Number(rewardMatch?.groups?.count);

	if (!rewardName || !Number.isInteger(rewardCount) || rewardCount <= 0) {
		throw new Error(`Expected victory reward in feedback: ${rewardPrompt}`);
	}

	const rewardItem = rewardItemsByName[rewardName];

	if (!rewardItem) {
		throw new Error(`No bag test id mapping for reward: ${rewardName}`);
	}

	const expectedRewardItemCount = rewardItem.countBeforeReward + rewardCount;

	await page.getByTestId('bag-toggle').click();
	await expect(page.getByTestId('bag-panel')).toBeVisible();
	await expectBagItemCount(page, rewardItem.testId, expectedRewardItemCount);
	await page.getByTestId('bag-close').click();

	await page.reload();
	await expect(page.getByTestId('game-shell')).toBeVisible();
	await expect(page.getByTestId('objective-chip')).toContainText('free roam');
	await renderedFrames(3);
	const luPostProbe = await probeCanvas(page, luPoint.x, luPoint.y, 45);
	expect(luPostProbe.colors).toBeGreaterThanOrEqual(10);
	await page.getByTestId('bag-toggle').click();
	await expect(page.getByTestId('bag-panel')).toBeVisible();
	await expectBagItemCount(page, rewardItem.testId, expectedRewardItemCount);
	await page.getByTestId('bag-close').click();

	await page.evaluate(() => {
		localStorage.setItem('cassiopeia.gameProgress.v2', '{');
		localStorage.setItem(
			'cassiopeia.itemProgress.v1',
			JSON.stringify({
				version: 1,
				inventory: { lesser_qi_pill: 9 },
				equipment: { weapon: null, robe: null, accessory: null },
				quickSlots: { 1: null, 2: 'lesser_qi_pill', 3: null },
				rewardSeed: 4,
				lastReward: null
			})
		);
	});
	await page.reload();
	await expect(page.getByTestId('game-shell')).toBeVisible();
	await expect(page.getByTestId('objective-chip')).toContainText(
		'Pay respects to Elder Shen in the courtyard'
	);
	await page.getByTestId('bag-toggle').click();
	await expect(page.getByTestId('bag-panel')).toBeVisible();
	await expectBagItemCount(page, 'bag-item-lesser_qi_pill', 2);
	await page.getByTestId('bag-close').click();

	await page.setViewportSize({ width: 1180, height: 720 });
	await expect(page.getByTestId('objective-chip')).toBeInViewport();
	await expect(page.getByTestId('status-cluster')).toBeInViewport();
	await expect(async () => {
		expect(await page.locator('canvas.wuxia-canvas').evaluate((el) => el.clientWidth)).toBe(1180);
	}).toPass({ timeout: 15000 });
});
