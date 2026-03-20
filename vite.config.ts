import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
	root: "examples",
	base: process.env.GITHUB_ACTIONS ? "/async-dom/" : "/",
	build: {
		outDir: "../demo-dist",
		emptyOutDir: true,
		rollupOptions: {
			input: {
				main: resolve(__dirname, "examples/index.html"),
				vanilla: resolve(__dirname, "examples/vanilla/index.html"),
				counter: resolve(__dirname, "examples/counter/index.html"),
				todo: resolve(__dirname, "examples/todo/index.html"),
				"multi-app": resolve(__dirname, "examples/multi-app/index.html"),
				debug: resolve(__dirname, "examples/debug/index.html"),
			},
		},
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
