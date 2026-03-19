import { defineConfig } from "vite";

export default defineConfig({
	root: "examples/vanilla",
	base: process.env.GITHUB_ACTIONS ? "/async-dom/" : "/",
	build: {
		outDir: "../../demo-dist",
		emptyOutDir: true,
	},
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
