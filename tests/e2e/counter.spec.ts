import { test, expect } from "@playwright/test";

test.describe("Counter App", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/counter/");
		// Wait for worker to initialize and render the counter UI
		await page.waitForSelector("#app h1");
	});

	test("renders with initial count of 0", async ({ page }) => {
		const display = page.locator("#app h1");
		await expect(display).toHaveText("0");
	});

	test("increments count when +1 is clicked", async ({ page }) => {
		const display = page.locator("#app h1");
		const incBtn = page.locator("#app button", { hasText: "+1" });

		await incBtn.click();
		await expect(display).toHaveText("1");

		await incBtn.click();
		await expect(display).toHaveText("2");
	});

	test("decrements count when -1 is clicked", async ({ page }) => {
		const display = page.locator("#app h1");
		const decBtn = page.locator("#app button", { hasText: "-1" });

		await decBtn.click();
		await expect(display).toHaveText("-1");

		await decBtn.click();
		await expect(display).toHaveText("-2");
	});

	test("increments and decrements together", async ({ page }) => {
		const display = page.locator("#app h1");
		const incBtn = page.locator("#app button", { hasText: "+1" });
		const decBtn = page.locator("#app button", { hasText: "-1" });

		await incBtn.click();
		await incBtn.click();
		await incBtn.click();
		await expect(display).toHaveText("3");

		await decBtn.click();
		await expect(display).toHaveText("2");
	});

	test("page reload resets state to 0", async ({ page }) => {
		const display = page.locator("#app h1");
		const incBtn = page.locator("#app button", { hasText: "+1" });

		await incBtn.click();
		await expect(display).toHaveText("1");

		await page.reload();
		await page.waitForSelector("#app h1");
		await expect(display).toHaveText("0");
	});
});
