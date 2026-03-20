import { createAsyncDom } from "../../src/main-thread/index.ts";

const asyncDom = createAsyncDom({ target: document.body });

// Each app runs in its own worker and renders into its own shadow root.
// Styles from one app cannot leak into the other.
asyncDom.addApp({
	worker: new Worker(new URL("./app1.ts", import.meta.url), { type: "module" }),
	mountPoint: "#app1",
	shadow: true,
});

asyncDom.addApp({
	worker: new Worker(new URL("./app2.ts", import.meta.url), { type: "module" }),
	mountPoint: "#app2",
	shadow: true,
});

asyncDom.start();
