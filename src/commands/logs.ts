import { readFile, open } from "node:fs/promises";
import { existsSync, watchFile, unwatchFile, statSync } from "node:fs";
import { spawn } from "node:child_process";
import chalk from "chalk";
import { isConfigured, getProjectConfig, getLogPath } from "../config/project.js";
import { printBanner, printDim, printError } from "../ui/format.js";

export async function logsCommand(opts: { follow: boolean }): Promise<void> {
	if (!isConfigured()) {
		printBanner();
		printDim("No tunnel configured in this directory.");
		return;
	}

	const config = await getProjectConfig();
	if (!config) {
		printBanner();
		printError("Config file is corrupt.");
		return;
	}

	const logFile = getLogPath(config.tunnel_id);

	if (!existsSync(logFile)) {
		printBanner();
		printDim("No logs yet. Run `sparq` to start the tunnel.");
		return;
	}

	if (opts.follow) {
		// Cross-platform tail -f using Node.js fs
		let position = statSync(logFile).size;

		const printNewContent = async () => {
			const fh = await open(logFile, "r");
			const { size } = await fh.stat();
			if (size > position) {
				const buf = Buffer.alloc(size - position);
				await fh.read(buf, 0, buf.length, position);
				process.stdout.write(buf.toString("utf-8"));
				position = size;
			}
			await fh.close();
		};

		watchFile(logFile, { interval: 200 }, () => {
			printNewContent().catch(() => {});
		});

		process.on("SIGINT", () => {
			unwatchFile(logFile);
			process.exit(0);
		});

		// Print any existing tail content first
		await printNewContent();

		// Keep alive
		await new Promise<void>(() => {});
	} else {
		const content = await readFile(logFile, "utf-8");
		const trimmed = content.trim();
		if (!trimmed) {
			printDim("Log file is empty. Tunnel may not have started yet.");
			return;
		}
		const lines = trimmed.split("\n");
		// Show last 50 lines
		const tail = lines.slice(-50);
		for (const line of tail) {
			console.log(line);
		}
		if (lines.length > 50) {
			console.log(
				chalk.dim(`\n  ... showing last 50 of ${lines.length} lines`),
			);
			console.log(chalk.dim("  Run `sparq logs -f` to follow live.\n"));
		}
	}
}
