import { test, expect } from "@playwright/test";

test.describe("HTTP Headers and HTML Shell", () => {
	test("serves empty HTML shell before JS runs", async ({ request }) => {
		const response = await request.get("/counter/");
		const html = await response.text();

		// The HTML shell should contain the empty #app div
		expect(html).toContain('<div id="app"></div>');
		// No counter content should be present in the static HTML
		expect(html).not.toContain("+1");
		expect(html).not.toContain("-1");
	});

	test("content appears after JavaScript executes", async ({ page }) => {
		await page.goto("/counter/");
		await page.waitForSelector("#app h1");

		const display = page.locator("#app h1");
		await expect(display).toHaveText("0");

		const buttons = page.locator("#app button");
		await expect(buttons).toHaveCount(2);
	});

	test("COOP and COEP headers are set", async ({ page }) => {
		const response = await page.goto("/counter/");
		expect(response).not.toBeNull();

		const headers = response!.headers();
		expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
		expect(headers["cross-origin-embedder-policy"]).toBe("require-corp");
	});
});
