import { defineConfig } from '@playwright/test';

export default defineConfig({
	forbidOnly: !!process.env.CI,
	workers: process.env.CI ? 1 : undefined,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
	use: { trace: 'on-first-retry', screenshot: 'only-on-failure' },
	webServer: {
		command: process.env.PLAYWRIGHT_PORT
			? `npm run build && npm run preview -- --port ${process.env.PLAYWRIGHT_PORT}`
			: 'npm run build && npm run preview',
		port: Number(process.env.PLAYWRIGHT_PORT || 4173)
	},
	testMatch: '**/*.e2e.{ts,js}'
});
