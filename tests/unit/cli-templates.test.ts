import { describe, expect, it } from "vitest";
import { AVAILABLE_TEMPLATES, getTemplate } from "../../src/cli/templates.ts";

describe("CLI templates", () => {
	it("has vanilla-ts, react-ts, vue-ts templates", () => {
		expect(AVAILABLE_TEMPLATES).toEqual(["vanilla-ts", "react-ts", "vue-ts"]);
	});

	it("throws for unknown template", () => {
		expect(() => getTemplate("unknown", "test")).toThrow("Unknown template: unknown");
	});

	describe("vanilla-ts", () => {
		it("generates correct files", () => {
			const files = getTemplate("vanilla-ts", "my-app");
			const paths = files.map((f) => f.path);
			expect(paths).toContain("package.json");
			expect(paths).toContain("index.html");
			expect(paths).toContain("src/main.ts");
			expect(paths).toContain("src/app.worker.ts");
			expect(paths).toContain("tsconfig.json");
			expect(paths).toContain("vite.config.ts");
		});

		it("uses project name in package.json", () => {
			const files = getTemplate("vanilla-ts", "my-app");
			const pkg = files.find((f) => f.path === "package.json")!;
			const parsed = JSON.parse(pkg.content);
			expect(parsed.name).toBe("my-app");
		});

		it("imports createAsyncDom in main.ts", () => {
			const files = getTemplate("vanilla-ts", "my-app");
			const main = files.find((f) => f.path === "src/main.ts")!;
			expect(main.content).toContain('import { createAsyncDom } from "@lifeart/async-dom"');
		});

		it("imports createWorkerDom in worker", () => {
			const files = getTemplate("vanilla-ts", "my-app");
			const worker = files.find((f) => f.path === "src/app.worker.ts")!;
			expect(worker.content).toContain('import { createWorkerDom } from "@lifeart/async-dom/worker"');
		});

		it("vite config uses asyncDomPlugin", () => {
			const files = getTemplate("vanilla-ts", "my-app");
			const config = files.find((f) => f.path === "vite.config.ts")!;
			expect(config.content).toContain("asyncDomPlugin");
		});
	});

	describe("react-ts", () => {
		it("generates correct files", () => {
			const files = getTemplate("react-ts", "my-app");
			const paths = files.map((f) => f.path);
			expect(paths).toContain("package.json");
			expect(paths).toContain("src/App.tsx");
			expect(paths).toContain("src/main.tsx");
			expect(paths).toContain("src/app.worker.ts");
		});

		it("uses AsyncDom component in App.tsx", () => {
			const files = getTemplate("react-ts", "my-app");
			const app = files.find((f) => f.path === "src/App.tsx")!;
			expect(app.content).toContain('import { AsyncDom } from "@lifeart/async-dom/react"');
			expect(app.content).toContain("<AsyncDom");
		});

		it("has react dependencies", () => {
			const files = getTemplate("react-ts", "my-app");
			const pkg = JSON.parse(files.find((f) => f.path === "package.json")?.content);
			expect(pkg.dependencies.react).toBeDefined();
			expect(pkg.dependencies["react-dom"]).toBeDefined();
		});
	});

	describe("vue-ts", () => {
		it("generates correct files", () => {
			const files = getTemplate("vue-ts", "my-app");
			const paths = files.map((f) => f.path);
			expect(paths).toContain("package.json");
			expect(paths).toContain("src/App.vue");
			expect(paths).toContain("src/main.ts");
		});

		it("uses AsyncDom component in App.vue", () => {
			const files = getTemplate("vue-ts", "my-app");
			const app = files.find((f) => f.path === "src/App.vue")!;
			expect(app.content).toContain('import { AsyncDom } from "@lifeart/async-dom/vue"');
		});

		it("has vue dependency", () => {
			const files = getTemplate("vue-ts", "my-app");
			const pkg = JSON.parse(files.find((f) => f.path === "package.json")?.content);
			expect(pkg.dependencies.vue).toBeDefined();
		});
	});
});
