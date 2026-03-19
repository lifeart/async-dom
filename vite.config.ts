import { defineConfig } from "vite";

export default defineConfig({
	root: "examples/vanilla",
	server: {
		port: 3000,
		open: true,
	},
	worker: {
		format: "es",
	},
});
