import chalk from "chalk";
import { getRegistry } from "../config/global.js";
import { isTunnelRunning } from "../tunnel/daemon.js";
import { printBanner, printDim } from "../ui/format.js";

export async function lsCommand(): Promise<void> {
	printBanner();

	const registry = await getRegistry();

	if (registry.tunnels.length === 0) {
		printDim("No tunnels registered.");
		printDim("Run `sparq` in a project directory to set one up.");
		return;
	}

	for (const entry of registry.tunnels) {
		const running = await isTunnelRunning(entry.path);
		const status = running
			? chalk.green("● running")
			: chalk.red("● stopped");

		console.log(`  ${status}  ${chalk.bold(entry.tunnel_name)}`);
		console.log(chalk.dim(`         ${entry.path}`));

		for (const route of entry.routes) {
			console.log(
				`         ${chalk.cyan(route.hostname)} ${chalk.dim("→")} localhost:${route.port}`,
			);
		}
		console.log();
	}
}
