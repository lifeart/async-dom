import { defineConfig } from "vite";

// Usage: npx vite --config examples/vite.config.ts
// Set EXAMPLE env var to choose which example to run:
//   EXAMPLE=counter npx vite --config examples/vite.config.ts
//   EXAMPLE=todo npx vite --config examples/vite.config.ts
//   EXAMPLE=multi-app npx vite --config examples/vite.config.ts
//   EXAMPLE=debug npx vite --config examples/vite.config.ts
const example = process.env.EXAMPLE ?? "counter";

export default defineConfig({
	root: `examples/${example}`,
	server: {
		port: 3000,
		open: true,
		headers: {
			"Cross-Origin-Opener-Policy": "same-origin",
			"Cross-Origin-Embedder-Policy": "require-corp",
		},
	},
	worker: {
		format: "es",
	},
});
