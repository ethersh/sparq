import { isConfigured, getProjectConfig } from "../config/project.js";
import { isTunnelRunning, getTunnelPid } from "../tunnel/daemon.js";
import {
	printBanner,
	printRoutes,
	printDim,
} from "../ui/format.js";
import chalk from "chalk";

export async function statusCommand(): Promise<void> {
	printBanner();

	if (!isConfigured()) {
		printDim("No tunnel configured in this directory.");
		printDim("Run `sparq` to set one up.");
		return;
	}

	const config = await getProjectConfig();
	if (!config) {
		printDim("Config file is corrupt.");
		return;
	}

	const running = await isTunnelRunning();
	const pid = await getTunnelPid();

	printRoutes(config.routes, running);

	if (running && pid) {
		console.log(chalk.dim(`  PID: ${pid}`));
		console.log(chalk.dim(`  Tunnel: ${config.tunnel_name} (${config.tunnel_id})`));
	}
	console.log();
}
