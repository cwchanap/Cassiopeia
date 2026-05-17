import { expect, test } from '@playwright/test';

test('plays through the Wuxia MVP opening and restart loop', async ({ page }) => {
	await page.goto('/');

	await expect(page.getByTestId('game-shell')).toBeVisible();
	await expect(page.getByTestId('objective-chip')).toContainText('Meet the mentor');
	await expect(page.locator('canvas')).toBeVisible();

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

	for (let i = 0; i < 26; i += 1) {
		await page.keyboard.press('j');
		await page.waitForTimeout(230);
	}

	await expect(page.getByTestId('end-state')).toBeVisible();
	await page.getByTestId('restart-button').click();
	await expect(page.getByTestId('objective-chip')).toContainText('Meet the mentor');
});
