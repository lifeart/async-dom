import { expect, test } from "@playwright/test";

test.describe("Vanilla Grid Demo", () => {
	test("renders grid nodes within 10 seconds", async ({ page }) => {
		await page.goto("/vanilla/");

		// Wait for a significant number of grid nodes to appear.
		// The worker creates 7000 nodes, each with id="node-{i}".
		// We check for a subset to confirm rendering has progressed.
		await page.waitForFunction(
			() => {
				const app = document.getElementById("app");
				if (!app) return false;
				// Check that at least 100 nodes exist (rendering is in progress or complete)
				return app.querySelectorAll('div[id^="node-"]').length >= 100;
			},
			{ timeout: 10_000 },
		);

		const nodeCount = await page.evaluate(() => {
			const app = document.getElementById("app");
			return app?.querySelectorAll('div[id^="node-"]').length ?? 0;
		});

		// Should have rendered a substantial number of grid nodes
		expect(nodeCount).toBeGreaterThanOrEqual(100);
	});

	test("score board is visible", async ({ page }) => {
		await page.goto("/vanilla/");
		const scoreBoard = page.locator("#score-board");
		await expect(scoreBoard).toBeVisible();
		await expect(scoreBoard).toContainText("Score:");
	});

	test("all 7000 nodes render eventually", async ({ page }) => {
		test.setTimeout(60_000);
		await page.goto("/vanilla/");

		// Wait for all 7000 nodes; use a generous timeout since
		// frame-budgeted scheduling may take a while for 7000 nodes
		await page.waitForFunction(
			() => {
				const app = document.getElementById("app");
				if (!app) return false;
				return app.querySelectorAll('div[id^="node-"]').length >= 7000;
			},
			{ timeout: 50_000 },
		);

		const nodeCount = await page.evaluate(() => {
			const app = document.getElementById("app");
			return app?.querySelectorAll('div[id^="node-"]').length ?? 0;
		});

		expect(nodeCount).toBe(7000);
	});
});
