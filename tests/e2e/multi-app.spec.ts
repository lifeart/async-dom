import { test, expect } from "@playwright/test";

test.describe("Multi-App with Shadow DOM", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/multi-app/");
	});

	test("renders both app containers", async ({ page }) => {
		const app1 = page.locator("#app1");
		const app2 = page.locator("#app2");

		await expect(app1).toBeVisible();
		await expect(app2).toBeVisible();
	});

	test("app1 renders Color Picker inside shadow DOM", async ({ page }) => {
		// Shadow DOM content is not directly accessible via regular selectors.
		// Use page.evaluate to reach inside the shadow root.
		const title = await page.waitForFunction(() => {
			const app1 = document.querySelector("#app1");
			if (!app1) return null;
			const shadow = app1.shadowRoot;
			if (!shadow) return null;
			const h2 = shadow.querySelector("h2");
			return h2?.textContent ?? null;
		});

		expect(await title.jsonValue()).toBe("Color Picker");
	});

	test("app2 renders Stopwatch inside shadow DOM", async ({ page }) => {
		const title = await page.waitForFunction(() => {
			const app2 = document.querySelector("#app2");
			if (!app2) return null;
			const shadow = app2.shadowRoot;
			if (!shadow) return null;
			const h2 = shadow.querySelector("h2");
			return h2?.textContent ?? null;
		});

		expect(await title.jsonValue()).toBe("Stopwatch");
	});

	test("app1 has color picker buttons", async ({ page }) => {
		const buttonCount = await page.waitForFunction(() => {
			const app1 = document.querySelector("#app1");
			if (!app1) return null;
			const shadow = app1.shadowRoot;
			if (!shadow) return null;
			const buttons = shadow.querySelectorAll(".controls button");
			return buttons.length > 0 ? buttons.length : null;
		});

		// 5 color buttons: Red, Blue, Green, Purple, Orange
		expect(await buttonCount.jsonValue()).toBe(5);
	});

	test("app2 has start and reset buttons", async ({ page }) => {
		const buttonTexts = await page.waitForFunction(() => {
			const app2 = document.querySelector("#app2");
			if (!app2) return null;
			const shadow = app2.shadowRoot;
			if (!shadow) return null;
			const buttons = shadow.querySelectorAll(".controls button");
			if (buttons.length < 2) return null;
			return Array.from(buttons).map((b) => b.textContent);
		});

		const texts = await buttonTexts.jsonValue();
		expect(texts).toContain("Start");
		expect(texts).toContain("Reset");
	});

	test("apps are style-isolated via shadow DOM", async ({ page }) => {
		// Verify both shadow roots exist (style isolation)
		const bothHaveShadowRoots = await page.waitForFunction(() => {
			const app1 = document.querySelector("#app1");
			const app2 = document.querySelector("#app2");
			return app1?.shadowRoot !== null && app2?.shadowRoot !== null;
		});

		expect(await bothHaveShadowRoots.jsonValue()).toBe(true);
	});
});
