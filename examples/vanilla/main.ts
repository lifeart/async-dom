import { createAsyncDom } from "../../src/main-thread/index.ts";

const app = document.getElementById("app")!;

const worker = new Worker(new URL("./worker.ts", import.meta.url), {
	type: "module",
});

// Enable devtools panel when ?debug is in the URL
const debugEnabled =
	new URLSearchParams(window.location.search).has("debug");

const asyncDom = createAsyncDom({
	target: app,
	worker,
	scheduler: {
		frameBudgetMs: 16,
		enableViewportCulling: true,
		enablePrioritySkipping: true,
	},
	debug: debugEnabled
		? { exposeDevtools: true, logWarnings: true }
		: undefined,
});

asyncDom.start();
