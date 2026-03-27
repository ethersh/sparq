import { input } from "@inquirer/prompts";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import {
	isConfigured,
	ensureProjectDir,
	getProjectSparqDir,
	getProjectConfig,
	saveCredentials,
} from "../config/project.js";
import { ProjectConfigSchema, TunnelCredentialsSchema } from "../config/schema.js";
import { generateCloudflaredConfig } from "../tunnel/config-gen.js";
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

	// Copy config.json to project .sparq/
	await ensureProjectDir();
	const destDir = getProjectSparqDir();
	const configContent = await readFile(join(sourceDir, "config.json"), "utf-8");
	await writeFile(join(destDir, "config.json"), configContent, "utf-8");

	// Read the config to get tunnel_id for credential storage
	const config = await getProjectConfig();
	if (!config) {
		printError("Imported config is invalid.");
		return;
	}

	// Copy credentials to ~/.sparq/tunnels/<tunnel_id>/
	const credsFile = join(sourceDir, "credentials.json");
	if (existsSync(credsFile)) {
		try {
			const credsRaw = await readFile(credsFile, "utf-8");
			const creds = TunnelCredentialsSchema.parse(JSON.parse(credsRaw));
			await saveCredentials(creds, config.tunnel_id);
		} catch {
			printDim("Warning: could not import credentials.json");
		}
	}

	// Regenerate cloudflared.yml with correct paths
	await generateCloudflaredConfig(config);

	printSuccess(`Imported tunnel config from ${source}`);
	printDim("Run `sparq` to start the tunnel.");
	console.log();
}
