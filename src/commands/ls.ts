import chalk from "chalk";
import { getRegistry } from "../config/global.js";
import { isTunnelRunning } from "../tunnel/daemon.js";
import { printBanner, printBox, printDim } from "../ui/format.js";

export async function lsCommand(): Promise<void> {
	printBanner();

	const registry = await getRegistry();

	if (registry.tunnels.length === 0) {
		printDim("No tunnels registered.");
		printDim("Run `sparq` in a project directory to set one up.");
		console.log();
		return;
	}

	for (const entry of registry.tunnels) {
		const running = await isTunnelRunning(entry.path);
		const status = running
			? `${chalk.green("●")} ${chalk.green("running")}`
			: `${chalk.red("●")} ${chalk.red("stopped")}`;

		const lines = [
			status,
			`${chalk.dim("path")}  ${entry.path}`,
			"",
		];

		for (const route of entry.routes) {
			lines.push(
				`${chalk.cyan(route.hostname)} ${chalk.dim("→")} localhost:${route.port}`,
			);
		}

		printBox(entry.tunnel_name, lines);
		console.log();
	}
}
