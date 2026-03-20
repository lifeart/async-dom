import { defineConfig } from "tsdown";

export default defineConfig({
	entry: {
		index: "src/index.ts",
		worker: "src/worker-thread/index.ts",
		transport: "src/transport/index.ts",
		"vite-plugin": "src/vite-plugin/index.ts",
		react: "src/react/index.ts",
		vue: "src/vue/index.ts",
		svelte: "src/svelte/index.ts",
		cli: "src/cli/index.ts",
		server: "src/server/index.ts",
	},
	format: ["esm", "cjs"],
	dts: true,
	clean: true,
	sourcemap: true,
	treeshake: true,
	target: "es2022",
	outDir: "dist",
	hash: false,
	external: ["react", "react-dom", "vue", "svelte", "vite"],
});
