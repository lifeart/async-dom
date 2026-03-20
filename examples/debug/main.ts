import { createAsyncDom } from "../../src/main-thread/index.ts";

const log = document.getElementById("log")!;

function appendLog(text: string, cls = "") {
	const line = document.createElement("span");
	if (cls) line.className = cls;
	line.textContent = text + "\n";
	log.appendChild(line);
	log.scrollTop = log.scrollHeight;
}

// Create async-dom with full debug options enabled.
// logMutations: logs every DOM mutation applied on the main thread
// exposeDevtools: exposes __ASYNC_DOM_DEVTOOLS__ on both main and worker globalThis
const asyncDom = createAsyncDom({
	target: document.getElementById("app")!,
	worker: new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
	debug: {
		logMutations: true,
		logWarnings: true,
		exposeDevtools: true,
		logger: {
			mutation(entry) {
				appendLog(
					`[mut] ${entry.action} ${JSON.stringify(entry.mutation).slice(0, 120)}`,
					"log-mut",
				);
			},
			warning(entry) {
				appendLog(`[warn] ${entry.code}: ${entry.message}`, "log-warn");
			},
		},
	},
});

asyncDom.start();

// Wire up debug panel buttons.
// The __ASYNC_DOM_DEVTOOLS__ object is set by exposeDevtools: true
type DevTools = {
	scheduler: { pending: () => number };
	findRealNode: (nodeId: number) => Node | null;
	apps: () => string[];
};

document.getElementById("btn-stats")!.addEventListener("click", () => {
	const dt = (globalThis as Record<string, unknown>).__ASYNC_DOM_DEVTOOLS__ as DevTools | undefined;
	if (dt) {
		appendLog(`Pending mutations: ${dt.scheduler.pending()}`);
		appendLog(`Active apps: ${JSON.stringify(dt.apps())}`);
	} else {
		appendLog("Devtools not available");
	}
});

document.getElementById("btn-tree")!.addEventListener("click", () => {
	// findRealNode(2) is the <body> equivalent (BODY_NODE_ID = 2)
	const dt = (globalThis as Record<string, unknown>).__ASYNC_DOM_DEVTOOLS__ as DevTools | undefined;
	if (dt) {
		const body = dt.findRealNode(2);
		if (body) {
			appendLog(`Body childNodes: ${(body as Element).children.length}`);
			appendLog((body as Element).innerHTML.slice(0, 300) + "...");
		}
	}
});

document.getElementById("btn-apps")!.addEventListener("click", () => {
	const dt = (globalThis as Record<string, unknown>).__ASYNC_DOM_DEVTOOLS__ as DevTools | undefined;
	if (dt) {
		const apps = dt.apps();
		appendLog(`Registered apps (${apps.length}): ${apps.join(", ")}`);
	}
});

document.getElementById("btn-clear")!.addEventListener("click", () => {
	log.innerHTML = "";
});
