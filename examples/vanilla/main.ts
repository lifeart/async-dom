import { createAsyncDom } from "../../src/main-thread/index.ts";

const app = document.getElementById("app")!;

const worker = new Worker(new URL("./worker.ts", import.meta.url), {
	type: "module",
});

const asyncDom = createAsyncDom({
	target: app,
	worker,
	scheduler: {
		frameBudgetMs: 16,
		enableViewportCulling: true,
		enablePrioritySkipping: true,
	},
});

asyncDom.start();
