import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
	root: resolve(__dirname, "../../examples"),
	server: {
		port: 3100,
		strictPort: true,
		open: false,
		headers: {
			"Cross-Origin-Opener-Policy": "same-origin",
			"Cross-Origin-Embedder-Policy": "require-corp",
		},
	},
	worker: { format: "es" },
});
