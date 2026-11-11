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
	test.setTimeout(120000);
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();

	await expect(page.getByTestId('game-shell')).toBeVisible();
	await expect(page.getByTestId('objective-chip')).toContainText('Meet the mentor');
	await expect(page.locator('canvas')).toBeVisible();
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

	await page.keyboard.press('k');
	await expect(page.getByTestId('status-cluster')).toContainText(
		/(?:6[5-9]|[78][0-9]|9[0-9])\/100/
	);
	await page.keyboard.press('3');
	await expect(page.getByTestId('item-feedback')).toHaveText('Used Lesser Qi Pill');
	await expect(page.getByTestId('quick-slot-3')).toContainText('x1');

	await expect
		.poll(
			async () => {
				if (await page.getByTestId('end-state').isVisible()) return true;
				await page.keyboard.press('j');
				return false;
			},
			{ timeout: 60000, intervals: [230] }
		)
		.toBe(true);

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
