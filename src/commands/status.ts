import chalk from "chalk";
import { isConfigured, getProjectConfig } from "../config/project.js";
import { isTunnelRunning, getTunnelPid } from "../tunnel/daemon.js";
import { printBanner, printRoutes, printBox, printDim } from "../ui/format.js";

export async function statusCommand(): Promise<void> {
	printBanner();

	if (!isConfigured()) {
		printDim("No tunnel configured in this directory.");
		printDim("Run `sparq` to set one up.");
		console.log();
		return;
	}

	const config = await getProjectConfig();
	if (!config) {
		printDim("Config file is corrupt.");
		return;
	}

	const running = await isTunnelRunning(config.tunnel_id);
	const pid = await getTunnelPid(config.tunnel_id);

	printRoutes(config.routes, running);

	if (running && pid) {
		printBox("info", [
			`${chalk.dim("tunnel")}  ${config.tunnel_name}`,
			`${chalk.dim("id")}      ${config.tunnel_id}`,
			`${chalk.dim("pid")}     ${pid}`,
		]);
		console.log();
	}
}
