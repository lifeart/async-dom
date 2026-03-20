import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
//#region src/cli/templates.ts
/**
* Returns the list of files for a given project template.
*
* @param template - Template name (one of {@link AVAILABLE_TEMPLATES}).
* @param name - Project name, used in package.json and HTML title.
* @returns Array of files to write to disk.
* @throws If the template name is not recognized.
*/
function getTemplate(template, name) {
	switch (template) {
		case "vanilla-ts": return vanillaTs(name);
		case "react-ts": return reactTs(name);
		case "vue-ts": return vueTs(name);
		default: throw new Error(`Unknown template: ${template}. Available: vanilla-ts, react-ts, vue-ts`);
	}
}
/** The list of available project templates for `async-dom init`. */
const AVAILABLE_TEMPLATES = [
	"vanilla-ts",
	"react-ts",
	"vue-ts"
];
function escapeHtml(str) {
	return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function vanillaTs(name) {
	return [
		{
			path: "package.json",
			content: JSON.stringify({
				name,
				private: true,
				version: "0.0.0",
				type: "module",
				scripts: {
					dev: "vite",
					build: "tsc && vite build",
					preview: "vite preview"
				},
				devDependencies: {
					typescript: "^5.8.0",
					vite: "^6.0.0",
					"async-dom": "latest"
				}
			}, null, 2)
		},
		{
			path: "index.html",
			content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(name)}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"><\/script>
  </body>
</html>
`
		},
		{
			path: "src/main.ts",
			content: `import { createAsyncDom } from "async-dom";

const worker = new Worker(new URL("./app.worker.ts", import.meta.url), {
  type: "module",
});

const instance = createAsyncDom({
  target: document.getElementById("app")!,
  worker,
});

instance.start();
`
		},
		{
			path: "src/app.worker.ts",
			content: `import { createWorkerDom } from "async-dom/worker";

const { document } = createWorkerDom();

const heading = document.createElement("h1");
heading.textContent = "Hello from async-dom!";
document.body.appendChild(heading);

const counter = document.createElement("button");
counter.textContent = "Count: 0";
let count = 0;
counter.addEventListener("click", () => {
  count++;
  counter.textContent = \`Count: \${count}\`;
});
document.body.appendChild(counter);
`
		},
		{
			path: "src/vite-env.d.ts",
			content: `/// <reference types="vite/client" />
`
		},
		{
			path: "tsconfig.json",
			content: JSON.stringify({
				compilerOptions: {
					target: "ES2022",
					module: "ESNext",
					moduleResolution: "bundler",
					strict: true,
					esModuleInterop: true,
					skipLibCheck: true,
					forceConsistentCasingInFileNames: true,
					isolatedModules: true,
					noEmit: true,
					lib: [
						"ES2022",
						"DOM",
						"DOM.Iterable"
					]
				},
				include: ["src"]
			}, null, 2)
		},
		{
			path: "vite.config.ts",
			content: `import { defineConfig } from "vite";
import { asyncDomPlugin } from "async-dom/vite-plugin";

export default defineConfig({
  plugins: [asyncDomPlugin()],
});
`
		}
	];
}
function reactTs(name) {
	return [
		{
			path: "package.json",
			content: JSON.stringify({
				name,
				private: true,
				version: "0.0.0",
				type: "module",
				scripts: {
					dev: "vite",
					build: "tsc && vite build",
					preview: "vite preview"
				},
				dependencies: {
					react: "^19.0.0",
					"react-dom": "^19.0.0"
				},
				devDependencies: {
					"@types/react": "^19.0.0",
					"@types/react-dom": "^19.0.0",
					"@vitejs/plugin-react": "^4.0.0",
					typescript: "^5.8.0",
					vite: "^6.0.0",
					"async-dom": "latest"
				}
			}, null, 2)
		},
		{
			path: "index.html",
			content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(name)}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"><\/script>
  </body>
</html>
`
		},
		{
			path: "src/main.tsx",
			content: `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`
		},
		{
			path: "src/App.tsx",
			content: `import { AsyncDom } from "async-dom/react";

export function App() {
  return (
    <AsyncDom
      worker="./app.worker.ts"
      fallback={<p>Loading...</p>}
      onReady={(instance) => console.log("async-dom ready", instance)}
    />
  );
}
`
		},
		{
			path: "src/app.worker.ts",
			content: `import { createWorkerDom } from "async-dom/worker";

const { document } = createWorkerDom();

const heading = document.createElement("h1");
heading.textContent = "Hello from async-dom + React!";
document.body.appendChild(heading);
`
		},
		{
			path: "src/vite-env.d.ts",
			content: `/// <reference types="vite/client" />
`
		},
		{
			path: "tsconfig.json",
			content: JSON.stringify({
				compilerOptions: {
					target: "ES2022",
					module: "ESNext",
					moduleResolution: "bundler",
					strict: true,
					esModuleInterop: true,
					skipLibCheck: true,
					forceConsistentCasingInFileNames: true,
					isolatedModules: true,
					noEmit: true,
					jsx: "react-jsx",
					lib: [
						"ES2022",
						"DOM",
						"DOM.Iterable"
					]
				},
				include: ["src"]
			}, null, 2)
		},
		{
			path: "vite.config.ts",
			content: `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { asyncDomPlugin } from "async-dom/vite-plugin";

export default defineConfig({
  plugins: [react(), asyncDomPlugin()],
});
`
		}
	];
}
function vueTs(name) {
	return [
		{
			path: "package.json",
			content: JSON.stringify({
				name,
				private: true,
				version: "0.0.0",
				type: "module",
				scripts: {
					dev: "vite",
					build: "vue-tsc && vite build",
					preview: "vite preview"
				},
				dependencies: { vue: "^3.5.0" },
				devDependencies: {
					"@vitejs/plugin-vue": "^5.0.0",
					typescript: "^5.8.0",
					"vue-tsc": "^2.0.0",
					vite: "^6.0.0",
					"async-dom": "latest"
				}
			}, null, 2)
		},
		{
			path: "index.html",
			content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(name)}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"><\/script>
  </body>
</html>
`
		},
		{
			path: "src/main.ts",
			content: `import { createApp } from "vue";
import App from "./App.vue";

createApp(App).mount("#app");
`
		},
		{
			path: "src/App.vue",
			content: `<script setup lang="ts">
import { AsyncDom } from "async-dom/vue";

function onReady(instance: any) {
  console.log("async-dom ready", instance);
}
<\/script>

<template>
  <AsyncDom worker="./app.worker.ts" @ready="onReady">
    <template #fallback>
      <p>Loading...</p>
    </template>
  </AsyncDom>
</template>
`
		},
		{
			path: "src/app.worker.ts",
			content: `import { createWorkerDom } from "async-dom/worker";

const { document } = createWorkerDom();

const heading = document.createElement("h1");
heading.textContent = "Hello from async-dom + Vue!";
document.body.appendChild(heading);
`
		},
		{
			path: "src/vite-env.d.ts",
			content: `/// <reference types="vite/client" />
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
`
		},
		{
			path: "tsconfig.json",
			content: JSON.stringify({
				compilerOptions: {
					target: "ES2022",
					module: "ESNext",
					moduleResolution: "bundler",
					strict: true,
					esModuleInterop: true,
					skipLibCheck: true,
					forceConsistentCasingInFileNames: true,
					isolatedModules: true,
					noEmit: true,
					lib: [
						"ES2022",
						"DOM",
						"DOM.Iterable"
					]
				},
				include: ["src"]
			}, null, 2)
		},
		{
			path: "vite.config.ts",
			content: `import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { asyncDomPlugin } from "async-dom/vite-plugin";

export default defineConfig({
  plugins: [vue(), asyncDomPlugin()],
});
`
		}
	];
}
//#endregion
//#region src/cli/index.ts
function ask(question) {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});
	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			rl.close();
			resolve(answer.trim());
		});
	});
}
async function init(args) {
	let name;
	let template = "";
	for (let i = 0; i < args.length; i++) if (args[i] === "--template" && args[i + 1]) {
		template = args[i + 1];
		i++;
	} else if (!args[i].startsWith("-") && !name) name = args[i];
	if (!name) {
		name = await ask("Project name: ");
		if (!name) {
			console.error("Project name is required.");
			process.exit(1);
		}
	}
	if (!template) {
		console.log("\nAvailable templates:");
		for (const t of AVAILABLE_TEMPLATES) console.log(`  - ${t}`);
		template = await ask("\nTemplate (default: vanilla-ts): ");
		if (!template) template = "vanilla-ts";
	}
	if (!AVAILABLE_TEMPLATES.includes(template)) {
		console.error(`Unknown template: ${template}. Available: ${AVAILABLE_TEMPLATES.join(", ")}`);
		process.exit(1);
	}
	const targetDir = path.resolve(process.cwd(), name);
	if (fs.existsSync(targetDir)) {
		if (fs.readdirSync(targetDir).length > 0) {
			console.error(`Directory "${name}" already exists and is not empty.`);
			process.exit(1);
		}
	}
	console.log(`\nScaffolding project in ${targetDir}...`);
	const files = getTemplate(template, name);
	for (const file of files) {
		const filePath = path.join(targetDir, file.path);
		const dir = path.dirname(filePath);
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(filePath, file.content);
		console.log(`  created ${file.path}`);
	}
	console.log(`\nDone! Now run:\n`);
	console.log(`  cd ${name}`);
	console.log("  npm install");
	console.log("  npm run dev");
	console.log("");
}
function printHelp() {
	console.log(`
async-dom - Asynchronous DOM rendering CLI

Usage:
  async-dom init [name] [--template <template>]

Commands:
  init    Scaffold a new async-dom project

Templates:
  ${AVAILABLE_TEMPLATES.join(", ")}

Examples:
  npx async-dom init my-app
  npx async-dom init my-app --template react-ts
`);
}
async function main() {
	const args = process.argv.slice(2);
	const command = args[0];
	switch (command) {
		case "init":
			await init(args.slice(1));
			break;
		case "--help":
		case "-h":
		case void 0:
			printHelp();
			break;
		default:
			console.error(`Unknown command: ${command}`);
			printHelp();
			process.exit(1);
	}
}
main().catch((err) => {
	console.error(err);
	process.exit(1);
});
//#endregion
export {};

//# sourceMappingURL=cli.js.map