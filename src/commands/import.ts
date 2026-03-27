import { input } from "@inquirer/prompts";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import {
	isConfigured,
	ensureProjectDir,
	getProjectSparqDir,
} from "../config/project.js";
import {
	printBanner,
	printSuccess,
	printError,
	printDim,
} from "../ui/format.js";

export async function importCommand(sourcePath?: string): Promise<void> {
	printBanner();

	if (isConfigured()) {
		printError("This directory already has a tunnel configured.");
		printDim("Run `sparq down` and remove .sparq/ first if you want to re-import.");
		return;
	}

	const source = sourcePath
		? resolve(sourcePath)
		: await input({
				message: "Path to directory with sparq config",
				validate: (val) => {
					const p = resolve(val);
					if (!existsSync(join(p, ".sparq", "config.json"))) {
						return "No .sparq/config.json found at that path";
					}
					return true;
				},
			});

	const sourceDir = join(resolve(source), ".sparq");

	if (!existsSync(join(sourceDir, "config.json"))) {
		printError(`No sparq config found at ${source}`);
		return;
	}

	await ensureProjectDir();
	const destDir = getProjectSparqDir();

	// Copy config, credentials, and cloudflared config
	const filesToCopy = ["config.json", "credentials.json", "cloudflared.yml"];

	for (const file of filesToCopy) {
		const srcFile = join(sourceDir, file);
		if (existsSync(srcFile)) {
			const content = await readFile(srcFile, "utf-8");
			await writeFile(join(destDir, file), content, "utf-8");
		}
	}

	printSuccess(`Imported tunnel config from ${source}`);
	printDim("Run `sparq` to start the tunnel.");
	console.log();
}
