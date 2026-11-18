import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
	computeWuxiaCameraPose,
	projectWorldToScreen,
	screenDirectionToWorld
} from '$lib/game/render/camera';
import { DASH_MARKERS, getVillager } from '$lib/game/simulation/villageContent';
import type { Vec2 } from '$lib/game/simulation/types';

const VIEWPORT = { width: 960, height: 640 };

async function attachHudShot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
	const shotPath = testInfo.outputPath(`${name}.png`);
	await page.screenshot({ path: shotPath });
	await testInfo.attach(name, { path: shotPath, contentType: 'image/png' });
}

function waitFrames(page: Page, count: number): Promise<void> {
	return page.evaluate(
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
}

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

type DiscProbe = { samples: number; sig: number; run: number };
type Signature = 'maroon' | 'darkGreen' | 'nearBlack' | 'paleGold' | 'sage';

function projectAt(point: { x: number; y: number; z: number }, focus: Vec2) {
	const pose = computeWuxiaCameraPose({ mode: 'explore', playerPosition: focus, rival: null });
	return projectWorldToScreen(point, pose, VIEWPORT);
}

// Reads back the preserved WebGL canvas through a 2D copy. Each disc is sampled on a
// strided grid; `sig` counts samples matching the named signature and `run` is the
// longest run of consecutive matching samples on one scan line — a real ring band or
// robe is contiguous, while flagstone speckle never forms a run.
async function probeDiscs(
	page: Page,
	discs: { x: number; y: number; r: number; sig?: Signature }[]
): Promise<DiscProbe[]> {
	return page.evaluate((requests) => {
		const signatures: Record<string, (r: number, g: number, b: number) => boolean> = {
			maroon: (r, g, b) => r > g + 12 && r > b + 12 && r < 170 && g < 110,
			darkGreen: (r, g, b) => g > r + 8 && g > b + 8 && g <= 140,
			nearBlack: (r, g, b) => r + g + b < 60,
			paleGold: (r, g, b) => r > 220 && g > 210 && b > 170 && r > b + 15 && r - g < 25,
			sage: (r, g, b) => g > r + 8 && g > b + 10 && g < 215
		};
		const empty = { samples: 0, sig: 0, run: 0 };
		const canvas = document.querySelector<HTMLCanvasElement>('canvas.wuxia-canvas');
		if (!canvas || canvas.width < 8 || canvas.clientWidth === 0) {
			return requests.map(() => empty);
		}
		const probe = document.createElement('canvas');
		probe.width = canvas.width;
		probe.height = canvas.height;
		const ctx = probe.getContext('2d', { willReadFrequently: true });
		if (!ctx) return requests.map(() => empty);
		ctx.drawImage(canvas, 0, 0);
		const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
		const scale = (canvas.width / canvas.clientWidth + canvas.height / canvas.clientHeight) / 2;
		return requests.map(({ x, y, r, sig }) => {
			const px = Math.round((x * canvas.width) / canvas.clientWidth);
			const py = Math.round((y * canvas.height) / canvas.clientHeight);
			const pr = Math.max(3, Math.round(r * scale));
			const match = sig ? signatures[sig] : undefined;
			const stats = { samples: 0, sig: 0, run: 0 };
			for (let sy = Math.max(0, py - pr); sy <= Math.min(canvas.height - 1, py + pr); sy += 2) {
				let streak = 0;
				for (let sx = Math.max(0, px - pr); sx <= Math.min(canvas.width - 1, px + pr); sx += 2) {
					if ((sx - px) * (sx - px) + (sy - py) * (sy - py) > pr * pr) {
						streak = 0;
						continue;
					}
					const i = (sy * canvas.width + sx) * 4;
					const red = data[i];
					const green = data[i + 1];
					const blue = data[i + 2];
					stats.samples += 1;
					if (match?.(red, green, blue)) {
						stats.sig += 1;
						streak += 1;
						if (streak > stats.run) stats.run = streak;
					} else {
						streak = 0;
					}
				}
			}
			return stats;
		});
	}, discs);
}

// The actor's robe/skin signature fills its projected chest disc while the paired disc
// one `dx` shift over sits on plain scenery — hiding the actor collapses the target
// signature to the control's level.
async function expectActorVisible(
	page: Page,
	point: { x: number; y: number },
	signature: Signature,
	{ r = 11, dx = 30 }: { r?: number; dx?: number } = {}
): Promise<void> {
	const [target, control] = await probeDiscs(page, [
		{ x: point.x, y: point.y, r, sig: signature },
		{ x: point.x + dx, y: point.y, r, sig: signature }
	]);
	console.log('actorProbe', signature, JSON.stringify({ point, target, control }));
	expect(target.samples).toBeGreaterThan(0);
	expect(target.sig).toBeGreaterThan(20);
	expect(target.sig).toBeGreaterThan(control.sig * 3 + 10);
}

// The next dash marker is a contiguous pale-gold emissive ring while the two idle
// markers — the same torus in the same corridor — render sage. Counting a contiguous
// gold run separates the emissive band from flagstone speckle, and requiring the idle
// controls to still show sage proves the comparison is between rendered markers, so a
// hidden mesh, a grey highlight, or a wrongly-lit marker all fail.
async function expectActiveMarker(page: Page, focus: Vec2): Promise<void> {
	const points = DASH_MARKERS.map((marker) => projectAt({ ...marker, y: 0.1 }, focus));
	for (const point of points) {
		expect(point.inView).toBe(true);
	}
	const discs = points.map((point) => ({ x: point.x, y: point.y, r: 26 }));
	const [active, ...idle] = await probeDiscs(
		page,
		discs.map((disc) => ({ ...disc, sig: 'paleGold' as const }))
	);
	const [, ...idleSage] = await probeDiscs(
		page,
		discs.map((disc) => ({ ...disc, sig: 'sage' as const }))
	);
	console.log('markerProbes', JSON.stringify({ points, active, idle, idleSage }));
	expect(active.samples).toBeGreaterThan(0);
	expect(active.sig).toBeGreaterThanOrEqual(25);
	expect(active.run).toBeGreaterThanOrEqual(5);
	for (const idleProbe of idle) {
		expect(active.sig).toBeGreaterThan(idleProbe.sig);
		expect(active.run).toBeGreaterThan(idleProbe.run);
	}
	for (const sageProbe of idleSage) {
		expect(sageProbe.sig).toBeGreaterThanOrEqual(12);
	}
}

test('plays through the first day quest, duel, reward, and free roam', async ({
	page
}, testInfo) => {
	// Software WebGL can drop below 5 fps; the capped simulation step then advances only a
	// fraction of a game second per wall second, so keep wall-clock limits generous.
	test.setTimeout(900000);
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();

	await expect(page.getByTestId('game-shell')).toBeVisible();
	await expect(page.getByTestId('objective-chip')).toContainText('拜师 Pay Respects');
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
	const elderPoint = projectAt({ ...elder.position, y: 1.15 }, spawnFocus);
	const luPoint = projectAt({ ...lu.position, y: 1.15 }, spawnFocus);
	expect(elderPoint.inView).toBe(true);
	expect(luPoint.inView).toBe(true);
	await expectActorVisible(page, elderPoint, 'darkGreen');
	await expectActorVisible(page, luPoint, 'maroon');
	await expect(page.getByTestId('mini-map')).toBeVisible();
	await expect(page.getByTestId('map-target')).toBeVisible();
	await expect(page.getByTestId('world-anchors')).toBeVisible();
	const qinName = page.getByTestId('world-anchor').filter({ hasText: 'Auntie Qin' });
	await expect(qinName).toBeVisible();
	await expect(async () => {
		const nameBox = (await qinName.boundingBox())!;
		const mapBox = (await page.getByTestId('mini-map').boundingBox())!;
		const overlapX = nameBox.x < mapBox.x + mapBox.width && mapBox.x < nameBox.x + nameBox.width;
		const overlapY = nameBox.y < mapBox.y + mapBox.height && mapBox.y < nameBox.y + nameBox.height;
		expect(overlapX && overlapY).toBe(false);
	}).toPass({ timeout: 15000 });
	await expect(page.locator('.control-hint')).toBeVisible();
	await expect(page.locator('.pause-hint')).toBeVisible();
	expect(await page.locator('[data-testid="game-prompt"]').count()).toBeLessThanOrEqual(1);
	await attachHudShot(page, testInfo, 'hud-1-explore');

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
			let moveKeys = keys;
			const transform = await page
				.getByTestId('map-target')
				.getAttribute('transform')
				.catch(() => null);
			const match = transform && /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(transform);
			if (match) {
				const right = Number(match[1]);
				const down = Number(match[2]);
				moveKeys = [
					Math.abs(down) > 4 ? (down > 0 ? 's' : 'w') : null,
					Math.abs(right) > 4 ? (right > 0 ? 'd' : 'a') : null
				].filter((key): key is string => key !== null);
				if (moveKeys.length === 0) {
					moveKeys = keys;
				}
			}
			for (const key of moveKeys) {
				await page.keyboard.down(key);
			}
			try {
				for (let frame = 0; frame < 6; frame++) {
					await renderedFrames(1);
					if ((await prompt.allInnerTexts().catch(() => []))[0] === text) {
						return;
					}
				}
			} finally {
				for (const key of moveKeys) {
					await page.keyboard.up(key);
				}
			}
			expect(await prompt.allInnerTexts().catch(() => [])).toEqual([text]);
		}).toPass({ timeout: 120000 });
	};

	await walkFramesToPrompt(['w'], 'Press E to speak with Elder Shen');

	await expect(async () => {
		const boxes = await page.evaluate(() => {
			const name = document.querySelector('[data-villager-id="elder_shen"]');
			const marker = document.querySelector('[data-testid="quest-anchor"]');
			const interaction = document.querySelector('[data-testid="game-prompt"]');
			if (!name || !marker || !interaction) throw new Error('Missing Elder Shen labels');
			const nameBox = name.getBoundingClientRect();
			return {
				nameLeft: nameBox.left,
				nameBottom: nameBox.bottom,
				markerRight: marker.getBoundingClientRect().right,
				promptTop: interaction.getBoundingClientRect().top
			};
		});
		expect(boxes.markerRight).toBeLessThanOrEqual(boxes.nameLeft + 1);
		expect(boxes.promptTop).toBeGreaterThanOrEqual(boxes.nameBottom - 1);
	}).toPass({ timeout: 15000 });

	await page.keyboard.press('e');
	await expect(prompt).toBeInViewport();
	await expect(prompt).toContainText('Elder Shen:');
	await expect(page.getByTestId('dialogue-scroll')).toBeVisible();
	await expect(page.locator('.dialogue-scroll .speaker-title')).toHaveText('沈长老');
	await expect(page.getByTestId('dialogue-quest-context')).toContainText('拜师 Pay Respects');
	await expect(page.getByTestId('dialogue-quest-context')).toContainText('Step 1 of 5');
	await expect(page.getByTestId('objective-chip')).toHaveCount(0);
	await expect(page.getByTestId('mini-map')).toHaveCount(0);
	await expect(page.getByTestId('status-cluster')).toHaveCount(0);
	await expect(page.locator('.control-hint')).toBeHidden();
	await expect(page.locator('.pause-hint')).toBeHidden();
	expect(await page.locator('[data-testid="game-prompt"]').count()).toBe(1);
	await attachHudShot(page, testInfo, 'hud-2-dialogue');
	await expect(page.getByTestId('bag-toggle')).toBeHidden();
	await page.keyboard.press('i');
	await expect(page.getByTestId('bag-panel')).toBeHidden();
	await expect(prompt).toContainText('So you are the new initiate');
	await page.keyboard.press('e');
	await expect(prompt).toContainText('From today you train beneath this roof');
	await page.keyboard.press('e');
	await expect(prompt).toContainText('gate markers on the north road');
	await page.keyboard.press('e');
	const objectiveChip = page.getByTestId('objective-chip');
	await expect(objectiveChip).toContainText('Dash through the three gate markers in order');
	await expect(objectiveChip).toContainText('0/3');
	await expect(page.getByTestId('bag-toggle')).toBeEnabled();

	await page.reload();
	await expect(page.getByTestId('game-shell')).toBeVisible();
	await expect(objectiveChip).toContainText('Dash through the three gate markers in order');
	await expect(objectiveChip).toContainText('0/3');
	await expect(page.getByTestId('quick-slot-3')).toContainText('Qi Pill');
	await expect(prompt).toHaveCount(0);

	// After the reload the player is at the authored spawn, so the camera focus is the
	// exact spawn point — the marker projections are deterministic.
	await renderedFrames(6);
	await expectActiveMarker(page, { x: 0, z: 0 });

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
	await expect(objectiveChip).toContainText('assign a pill to a quick slot');
	await expect(prompt).toHaveCount(0);

	await walkFramesToPrompt(['w', 'd'], 'Press E to speak with Auntie Qin');

	await renderedFrames(8);
	// The walk stops within interact range of Qin; the camera focus only needs to be
	// near the stop point — her dark robe fills the disc regardless of the exact stop.
	const qinPoint = projectAt({ ...qin.position, y: 0.45 }, { x: 0.6, z: -8.7 });
	expect(qinPoint.inView).toBe(true);
	await expectActorVisible(page, qinPoint, 'nearBlack', { r: 20, dx: 46 });

	await page.keyboard.press('e');
	await expect(prompt).toContainText('Auntie Qin:');
	await expect(prompt).toContainText('He sends every first-day disciple to me');
	await page.keyboard.press('e');
	await expect(prompt).toContainText('Two Lesser Healing Pills');
	await page.keyboard.press('e');
	await expect(prompt).toContainText('set it on a quick slot');
	await page.keyboard.press('e');
	await expect(prompt).toHaveText('Press E to speak with Auntie Qin', { timeout: 30000 });
	await expect(objectiveChip).toContainText('Fetch medicine from Auntie Qin');
	await expect(page.getByTestId('item-feedback')).toHaveText('Received Lesser Healing Pill x2');

	await page.keyboard.press('i');
	await expect(page.getByTestId('bag-panel')).toBeVisible();
	await expect(page.getByTestId('bag-close')).toBeFocused();
	await expectBagItemCount(page, 'bag-item-lesser_healing_pill', 5);
	await page.getByTestId('bag-assign-lesser_healing_pill-slot-1').click();
	await expect(page.getByTestId('item-feedback')).toHaveText(
		'Assigned Lesser Healing Pill to slot 1'
	);
	await page.keyboard.press('b');
	await expect(page.getByTestId('bag-panel')).toBeHidden();
	expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY');
	await page.getByTestId('bag-toggle').click();
	await expect(page.getByTestId('bag-panel')).toBeVisible();
	await page.getByTestId('bag-close').click();
	await expect(page.getByTestId('bag-panel')).toBeHidden();
	await expect(page.getByTestId('bag-toggle')).toBeFocused();
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
	await expect(prompt).toHaveCount(0);

	await walkFramesToPrompt(['s', 'd'], 'Press E to speak with Senior Brother Lu');
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
	await expect(prompt).toHaveCount(0);
	await expect(page.getByRole('meter', { name: 'Rival health' })).toBeVisible();
	await expect(page.locator('.rival-status .rival-seal')).toHaveText('敌');
	await expect(page.getByTestId('mini-map')).toHaveCount(0);
	await expect(objectiveChip).toContainText('win the spar');
	const duelObjective = objectiveChip.getByRole('button', { name: /Spar with the rival/ });
	await duelObjective.focus();
	await expect(page.getByRole('tooltip')).toHaveText(
		'Speak with Senior Brother Lu and win the spar'
	);
	await page.getByTestId('scene-host').focus();
	await expect(page.getByRole('tooltip')).toHaveCount(0);
	const expectDuelChromeSeparated = async (topRow: boolean) => {
		const boxes = await Promise.all(
			['status-cluster', 'rival-status', 'objective-chip'].map(async (sel) => {
				const locator =
					sel === 'rival-status' ? page.locator('.rival-status') : page.getByTestId(sel);
				return { sel, box: await locator.boundingBox() };
			})
		);
		const rivalBox = boxes.find((b) => b.sel === 'rival-status')!.box;
		expect(rivalBox, 'rival-status must have a bounding box').not.toBeNull();
		expect(rivalBox!.width, 'rival meter must stay readable').toBeGreaterThanOrEqual(200);
		if (topRow) {
			const vitalsBox = boxes.find((b) => b.sel === 'status-cluster')!.box;
			expect(rivalBox!.y, 'rival-status must share the top chrome row with vitals').toBeLessThan(
				vitalsBox!.y + vitalsBox!.height
			);
		}
		for (const a of boxes) {
			for (const b of boxes) {
				if (a === b) continue;
				expect(a.box, `${a.sel} must have a bounding box`).not.toBeNull();
				expect(b.box, `${b.sel} must have a bounding box`).not.toBeNull();
				const overlapX = a.box!.x < b.box!.x + b.box!.width && b.box!.x < a.box!.x + a.box!.width;
				const overlapY = a.box!.y < b.box!.y + b.box!.height && b.box!.y < a.box!.y + a.box!.height;
				expect(overlapX && overlapY, `${a.sel} must not overlap ${b.sel}`).toBe(false);
			}
		}
	};
	for (const width of [320, 390, 720, 721, 800, 937, 938, 960, 1100, 1180]) {
		await page.setViewportSize({ width, height: width === 1180 ? 720 : 640 });
		await expectDuelChromeSeparated(width >= 938);
		await expect(async () => {
			const fits = await duelObjective.evaluate(
				(element) => element.scrollWidth <= element.clientWidth
			);
			expect(fits, `duel title must not truncate at ${width}px`).toBe(true);
		}).toPass({ timeout: 15000 });
	}
	await page.setViewportSize({ width: 960, height: 640 });
	await attachHudShot(page, testInfo, 'hud-3-duel');
	await expect(page.locator('.technique', { hasText: 'Strike' }).locator('small')).toHaveText(
		/Ready|Striking|Recovering|Staggered/
	);
	await expect(page.locator('.technique', { hasText: 'Qi burst' }).locator('small')).toHaveText(
		/Ready|[\d.]+s/
	);

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
	// The read must not linger on a removed meter: a long attach wait after the
	// killing blow outlives the 0.65 s damage record and flakes the assertion below.
	const readRivalHealth = async () => {
		if (!(await rivalMeter.isVisible().catch(() => false))) {
			return null;
		}
		const value = await rivalMeter.getAttribute('value', { timeout: 250 }).catch(() => null);
		return value === null ? null : Number(value);
	};
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
	await expect(page.getByTestId('damage-number').first()).toBeVisible();
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
	// The maroon signature matches the loaded GLB robe — the procedural fallback is
	// teal-grey, so the probe must wait for assets to be ready like the opening probe.
	await expect(page.locator('canvas')).not.toHaveAttribute('data-assets', 'loading', {
		timeout: 30000
	});
	await expect(page.locator('canvas')).toHaveAttribute('data-assets', 'ready');
	await renderedFrames(3);
	await expectActorVisible(page, luPoint, 'maroon');
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
	await attachHudShot(page, testInfo, 'hud-1180x720-sanity');

	for (const width of [320, 390]) {
		await page.setViewportSize({ width, height: 640 });
		const chrome = [
			page.getByTestId('status-cluster'),
			page.getByTestId('mini-map'),
			page.getByTestId('objective-chip'),
			page.locator('.bottom-hud')
		];
		const boxes = await Promise.all(
			chrome.map(async (locator) => {
				await expect(locator).toBeInViewport();
				return (await locator.boundingBox())!;
			})
		);
		for (let i = 0; i < boxes.length; i++) {
			for (let j = i + 1; j < boxes.length; j++) {
				const a = boxes[i];
				const b = boxes[j];
				const overlapX = a.x < b.x + b.width && b.x < a.x + a.width;
				const overlapY = a.y < b.y + b.height && b.y < a.y + a.height;
				expect(overlapX && overlapY, `HUD panels must not overlap at ${width}px`).toBe(false);
			}
		}
	}
});

type BannerProbe = {
	visible: boolean;
	opacity: number;
	hanzi: string | null;
	name: string | null;
} | null;

function probePlaceBanner(page: Page): Promise<BannerProbe> {
	return page.evaluate(() => {
		const el = document.querySelector<HTMLElement>('[data-testid="place-banner"]');
		if (!el) return null;
		const style = getComputedStyle(el);
		return {
			visible: style.display !== 'none' && style.visibility !== 'hidden',
			opacity: Number(style.opacity),
			hanzi: el.querySelector('.place-hanzi')?.textContent ?? null,
			name: el.querySelector('.place-name')?.textContent ?? null
		};
	});
}

test('place banner probe resolves without waiting when the banner is absent', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByTestId('game-shell')).toBeVisible();
	const result = await Promise.race([
		probePlaceBanner(page),
		page.waitForTimeout(2000).then(() => 'still-waiting' as const)
	]);
	expect(result).toBeNull();
});

test('announces the Jadebank Market arrival banner via the z = 0 bridge route', async ({
	page
}, testInfo) => {
	test.setTimeout(900000);
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();
	await expect(page.getByTestId('game-shell')).toBeVisible();
	await expect(page.getByTestId('mini-map')).toBeVisible();

	const readPlayerPosition = async (): Promise<Vec2 | null> => {
		const rim = page.getByTestId('map-rim-target');
		const rimMetres = page.getByTestId('map-rim-metres');
		if ((await rim.count()) === 0 || (await rimMetres.count()) === 0) {
			return null;
		}
		const transform = await rim.getAttribute('transform').catch(() => null);
		const metresText = await rimMetres.textContent().catch(() => null);
		const match = transform && /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(transform);
		const metres = metresText && Number(/([\d.]+)m/.exec(metresText)?.[1]);
		if (!match || !metres) {
			return null;
		}
		const magnitude = Math.hypot(Number(match[1]), Number(match[2]));
		if (magnitude === 0) {
			return null;
		}
		const delta = screenDirectionToWorld(
			(Number(match[1]) / magnitude) * metres,
			(Number(match[2]) / magnitude) * metres
		);
		return { x: elder.position.x - delta.x, z: elder.position.z - delta.z };
	};

	const walkBatchesUntil = async (
		keys: string[],
		done: () => Promise<boolean>,
		description: string,
		perFrame = false
	) => {
		const deadline = Date.now() + 300000;
		while (Date.now() < deadline) {
			for (const key of keys) {
				await page.keyboard.down(key);
			}
			let finished = false;
			try {
				for (let frame = 0; frame < 3 && !finished; frame++) {
					await waitFrames(page, 1);
					if (perFrame || frame === 2) {
						finished = await done();
					}
				}
			} finally {
				for (const key of keys) {
					await page.keyboard.up(key);
				}
			}
			if (finished || (await done())) {
				return;
			}
			await waitFrames(page, 1);
		}
		throw new Error(`Timed out while walking: ${description}`);
	};

	const arrival: { hanzi: string | null; name: string | null; opacity: number; shot: string } = {
		hanzi: null,
		name: null,
		opacity: 0,
		shot: testInfo.outputPath('hud-4-arrival.png')
	};

	await walkBatchesUntil(
		['s', 'd'],
		async () => ((await readPlayerPosition())?.x ?? 0) >= 22,
		'crossing the z = 0 bridge east to x >= 21'
	);
	await walkBatchesUntil(
		['s', 'a'],
		async () => {
			const info = await probePlaceBanner(page);
			if (info?.visible && info.opacity >= 0.8) {
				arrival.hanzi = info.hanzi;
				arrival.name = info.name;
				arrival.opacity = info.opacity;
				await page.screenshot({ path: arrival.shot });
				const afterShot = await probePlaceBanner(page);
				if (!afterShot?.visible || afterShot.opacity < 0.8) {
					throw new Error('Jadebank Market banner expired while capturing the screenshot');
				}
				return true;
			}
			if (info?.visible) {
				return false;
			}
			return ((await readPlayerPosition())?.z ?? 0) >= 28;
		},
		'heading south along x ~= 24 into Jadebank Market at z >= 27',
		true
	);

	if (arrival.opacity < 0.8) {
		throw new Error(
			`Reached z >= 28 without an opaque Jadebank Market place banner (opacity ${arrival.opacity})`
		);
	}
	await testInfo.attach('hud-4-arrival', { path: arrival.shot, contentType: 'image/png' });
	expect(arrival.hanzi).toBe('玉岸集');
	expect(arrival.name).toBe('Jadebank Market');
	expect(arrival.opacity).toBeGreaterThanOrEqual(0.8);
	await expect(page.getByTestId('mini-map')).toBeVisible();
	await expect(page.getByTestId('map-rim-target')).toBeVisible();
	const metres = (await page.getByTestId('map-rim-metres').textContent()) ?? '';
	expect(Number(/([\d.]+)m/.exec(metres)?.[1])).toBeGreaterThan(20);
	await expect(page.getByRole('img', { name: /quest target \d+ metres away/ })).toBeVisible();
	await page.setViewportSize({ width: 390, height: 640 });
	await expect(async () => {
		const effectiveFontSize = await page.getByTestId('map-rim-metres').evaluate((element) => {
			const text = element as SVGGraphicsElement;
			return parseFloat(getComputedStyle(text).fontSize) * (text.getScreenCTM()?.a ?? 0);
		});
		expect(effectiveFontSize).toBeGreaterThanOrEqual(10);
	}).toPass({ timeout: 15000 });
});
