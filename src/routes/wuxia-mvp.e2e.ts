import { expect, test } from '@playwright/test';

test('plays through the Wuxia MVP opening, item loop, reward, and restart', async ({ page }) => {
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();

	await expect(page.getByTestId('game-shell')).toBeVisible();
	await expect(page.getByTestId('objective-chip')).toContainText('Meet the mentor');
	await expect(page.locator('canvas')).toBeVisible();
	await expect(page.getByTestId('status-cluster')).toContainText('110/110');
	await expect(page.getByTestId('quick-slot-1')).toContainText('Heal Pill');

	await page.getByTestId('bag-toggle').click();
	await expect(page.getByTestId('bag-panel')).toBeVisible();
	await expect(page.getByTestId('bag-item-training_sword')).toContainText('Equipped');
	await page.getByTestId('bag-close').click();
	await expect(page.getByTestId('bag-panel')).toBeHidden();

	await page.keyboard.down('a');
	await page.keyboard.down('w');
	await page.waitForTimeout(1300);
	await page.keyboard.up('w');
	await page.keyboard.up('a');

	await page.keyboard.press('e');
	await expect(page.getByTestId('objective-chip')).toContainText('Practice qinggong dash');

	await page.keyboard.press('Space');
	await expect(page.getByTestId('objective-chip')).toContainText('Defeat the rival disciple');
	await expect(page.getByTestId('status-cluster')).toContainText('Action');

	await page.keyboard.press('k');
	await page.waitForTimeout(320);
	await page.keyboard.press('2');
	await expect(page.getByTestId('item-feedback')).toContainText(/Used Lesser Qi Pill|Qi is full/);

	for (let i = 0; i < 24; i += 1) {
		await page.keyboard.press('j');
		await page.waitForTimeout(230);
	}

	await expect(page.getByTestId('end-state')).toBeVisible();
	await expect(page.getByTestId('game-prompt')).toContainText('Won:');

	await page.getByTestId('restart-button').click();
	await expect(page.getByTestId('objective-chip')).toContainText('Meet the mentor');

	await page.getByTestId('bag-toggle').click();
	await expect(page.getByTestId('bag-panel')).toBeVisible();
	await expect(page.getByTestId('bag-item-training_sword')).toBeVisible();
});
