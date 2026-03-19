import { defineConfig } from "tsdown";

export default defineConfig({
	entry: {
		index: "src/index.ts",
		worker: "src/worker-thread/index.ts",
		transport: "src/transport/index.ts",
	},
	format: ["esm", "cjs"],
	dts: true,
	clean: true,
	sourcemap: true,
	treeshake: true,
	target: "es2022",
	outDir: "dist",
	hash: false,
});
