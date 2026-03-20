import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { AVAILABLE_TEMPLATES, getTemplate } from "./templates.ts";

function ask(question: string): Promise<string> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			rl.close();
			resolve(answer.trim());
		});
	});
}

async function init(args: string[]): Promise<void> {
	let name: string | undefined;
	let template = "";

	// Parse flags
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--template" && args[i + 1]) {
			template = args[i + 1];
			i++;
		} else if (!args[i].startsWith("-") && !name) {
			name = args[i];
		}
	}

	// Interactive prompts for missing values
	if (!name) {
		name = await ask("Project name: ");
		if (!name) {
			console.error("Project name is required.");
			process.exit(1);
		}
	}

	if (!template) {
		console.log("\nAvailable templates:");
		for (const t of AVAILABLE_TEMPLATES) {
			console.log(`  - ${t}`);
		}
		template = await ask("\nTemplate (default: vanilla-ts): ");
		if (!template) template = "vanilla-ts";
	}

	// Validate template
	if (!AVAILABLE_TEMPLATES.includes(template as (typeof AVAILABLE_TEMPLATES)[number])) {
		console.error(`Unknown template: ${template}. Available: ${AVAILABLE_TEMPLATES.join(", ")}`);
		process.exit(1);
	}

	const targetDir = path.resolve(process.cwd(), name);

	if (fs.existsSync(targetDir)) {
		const contents = fs.readdirSync(targetDir);
		if (contents.length > 0) {
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

function printHelp(): void {
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

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const command = args[0];

	switch (command) {
		case "init":
			await init(args.slice(1));
			break;
		case "--help":
		case "-h":
		case undefined:
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
