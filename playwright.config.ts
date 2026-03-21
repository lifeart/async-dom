import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/e2e",
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1,
	reporter: process.env.CI ? "github" : "html",
	timeout: 30_000,
	expect: { timeout: 10_000 },
	use: {
		baseURL: "http://localhost:3100",
		trace: "on-first-retry",
	},
	projects: [
		{ name: "chromium", use: { ...devices["Desktop Chrome"] } },
	],
	webServer: {
		command: "npx vite --config tests/e2e/vite.config.ts",
		port: 3100,
		reuseExistingServer: !process.env.CI,
		timeout: 30_000,
	},
});
