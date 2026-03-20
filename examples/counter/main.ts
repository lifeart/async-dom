import { createAsyncDom } from "../../src/main-thread/index.ts";

const asyncDom = createAsyncDom({
	target: document.getElementById("app")!,
	worker: new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
});
asyncDom.start();
