import { expect, test, type Page } from '@playwright/test';

// Keep software WebGL affordable while exercising the full gameplay and persistence flow.
test.use({ viewport: { width: 960, height: 640 } });

const rewardItemsByName: Record<string, { testId: string; countBeforeReward: number }> = {
	'Lesser Healing Pill': { testId: 'bag-item-lesser_healing_pill', countBeforeReward: 3 },
	'Lesser Qi Pill': { testId: 'bag-item-lesser_qi_pill', countBeforeReward: 1 },
	'Tempered Practice Sword': { testId: 'bag-item-tempered_practice_sword', countBeforeReward: 0 },
	'Reinforced Training Robe': { testId: 'bag-item-reinforced_training_robe', countBeforeReward: 0 },
	'Jade Breathing Charm': { testId: 'bag-item-jade_breathing_charm', countBeforeReward: 0 }
};

async function expectBagItemCount(page: Page, testId: string, count: number): Promise<void> {
	const bagItem = page.getByTestId(testId);

	await expect(bagItem).toBeVisible();
	await expect(bagItem.locator('small')).toHaveText(`x${count}`);
}

test('plays through the Wuxia MVP opening, item loop, reward, and restart', async ({ page }) => {
	// Software WebGL can drop below 5 fps; the capped simulation step then advances only a
	// fraction of a game second per wall second, so keep wall-clock limits generous.
	test.setTimeout(180000);
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();

	await expect(page.getByTestId('game-shell')).toBeVisible();
	await expect(page.getByTestId('objective-chip')).toContainText('Meet the mentor');
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

	await page.keyboard.down('w');
	await expect(page.getByTestId('game-prompt')).toHaveText('Press E to begin mentor training', {
		timeout: 20000
	});
	await page.keyboard.up('w');

	await page.keyboard.press('e');
	await expect(page.getByTestId('objective-chip')).toContainText('Practice qinggong dash');

	await page.keyboard.press('Space');
	await expect(page.getByTestId('objective-chip')).toContainText('Defeat the rival disciple');
	await expect(page.getByTestId('status-cluster')).toContainText('Action');

	// The rival can stagger the player before the first burst, consuming that key press.
	await expect(async () => {
		await page.keyboard.press('k');
		await expect(page.getByRole('meter', { name: 'Qi', exact: true })).toHaveAttribute(
			'value',
			/^(?:6[5-9]|[78][0-9]|9[0-9])$/
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
	const duelDeadline = Date.now() + 100000;
	let rivalHealth = 100;
	let lastProgress = Date.now();
	let presses = 0;

	while (!(await page.getByTestId('end-state').isVisible())) {
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
		await page.waitForTimeout(230);
	}

	await expect(page.getByTestId('end-state')).toBeVisible();
	await expect(page.getByTestId('game-prompt')).toContainText('Won:');
	const rewardPrompt = await page.getByTestId('game-prompt').innerText();
	const rewardMatch = rewardPrompt.match(/Won: (?<name>.+?) x(?<count>\d+)/);
	const rewardName = rewardMatch?.groups?.name;
	const rewardCount = Number(rewardMatch?.groups?.count);

	if (!rewardName || !Number.isInteger(rewardCount) || rewardCount <= 0) {
		throw new Error(`Expected victory reward in prompt: ${rewardPrompt}`);
	}

	const rewardItem = rewardItemsByName[rewardName];

	if (!rewardItem) {
		throw new Error(`No bag test id mapping for reward: ${rewardName}`);
	}

	const expectedRewardItemCount = rewardItem.countBeforeReward + rewardCount;

	await page.getByTestId('restart-button').click();
	await expect(page.getByTestId('objective-chip')).toContainText('Meet the mentor');

	await page.getByTestId('bag-toggle').click();
	await expect(page.getByTestId('bag-panel')).toBeVisible();
	await expectBagItemCount(page, rewardItem.testId, expectedRewardItemCount);

	await page.reload();
	await expect(page.getByTestId('game-shell')).toBeVisible();
	await page.getByTestId('bag-toggle').click();
	await expect(page.getByTestId('bag-panel')).toBeVisible();
	await expectBagItemCount(page, rewardItem.testId, expectedRewardItemCount);
});
