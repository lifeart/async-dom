import { expect, test } from "@playwright/test";

test.describe("Todo App", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/todo/");
		// Wait for worker to initialize and render the seeded todos
		await page.waitForSelector("#app ul li");
	});

	test("renders with seeded todos", async ({ page }) => {
		const items = page.locator("#app ul li");
		await expect(items).toHaveCount(2);

		await expect(items.nth(0).locator("span")).toHaveText("Try async-dom");
		await expect(items.nth(1).locator("span")).toHaveText("Build something cool");
	});

	test("shows correct remaining count", async ({ page }) => {
		const count = page.locator("#app .count");
		await expect(count).toHaveText("2 items remaining");
	});

	test("adds a todo by clicking Add button", async ({ page }) => {
		const input = page.locator('#app input[type="text"]');
		const addBtn = page.locator("#app button", { hasText: "Add" });

		// Type the text and press Tab to ensure the worker receives the final
		// input value. With async-dom, keydown events carry target.value at the
		// time of keydown (before the char is inserted), so the last character's
		// value is only captured when the next event fires on the input.
		await input.click();
		await input.pressSequentially("New todo item", { delay: 20 });
		// Press Tab to trigger another keydown that carries the complete value
		await input.press("Tab");
		await addBtn.click();

		const items = page.locator("#app ul li");
		await expect(items).toHaveCount(3);
		await expect(items.nth(2).locator("span")).toHaveText("New todo item");

		// Count should update
		const count = page.locator("#app .count");
		await expect(count).toHaveText("3 items remaining");
	});

	test("adds a todo by pressing Enter", async ({ page }) => {
		const input = page.locator('#app input[type="text"]');

		await input.click();
		await input.pressSequentially("Enter todo");
		await input.press("Enter");

		const items = page.locator("#app ul li");
		await expect(items).toHaveCount(3);
		await expect(items.nth(2).locator("span")).toHaveText("Enter todo");
	});

	test("clears input after adding", async ({ page }) => {
		const input = page.locator('#app input[type="text"]');
		const addBtn = page.locator("#app button", { hasText: "Add" });

		await input.click();
		await input.pressSequentially("Cleared after add", { delay: 20 });
		await input.press("Tab");
		await addBtn.click();

		await expect(input).toHaveValue("");
	});

	test("toggles todo done state via checkbox", async ({ page }) => {
		const firstItem = page.locator("#app ul li").first();
		const checkbox = firstItem.locator('input[type="checkbox"]');

		await checkbox.click();

		// The li should have the "done" class
		await expect(firstItem).toHaveClass(/done/);

		// Remaining count should decrease
		const count = page.locator("#app .count");
		await expect(count).toHaveText("1 item remaining");

		// Toggle back
		await checkbox.click();
		await expect(firstItem).not.toHaveClass(/done/);
		await expect(count).toHaveText("2 items remaining");
	});

	test("removes a todo", async ({ page }) => {
		const items = page.locator("#app ul li");
		// Click the remove button (x) on the first item
		const removeBtn = items.first().locator("button");
		await removeBtn.click();

		await expect(items).toHaveCount(1);
		await expect(items.first().locator("span")).toHaveText("Build something cool");

		const count = page.locator("#app .count");
		await expect(count).toHaveText("1 item remaining");
	});
});
