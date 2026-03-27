import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import chalk from "chalk";
import { isConfigured, getLogPath } from "../config/project.js";
import { printBanner, printDim } from "../ui/format.js";

export async function logsCommand(opts: { follow: boolean }): Promise<void> {
	if (!isConfigured()) {
		printBanner();
		printDim("No tunnel configured in this directory.");
		return;
	}

	const logFile = getLogPath();

	if (!existsSync(logFile)) {
		printBanner();
		printDim("No logs yet. Run `sparq` to start the tunnel.");
		return;
	}

	if (opts.follow) {
		// Tail -f style
		const child = spawn("tail", ["-f", logFile], {
			stdio: "inherit",
		});

		process.on("SIGINT", () => {
			child.kill();
			process.exit(0);
		});

		await new Promise<void>((resolve) => {
			child.on("close", () => resolve());
		});
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
