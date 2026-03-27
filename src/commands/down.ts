import { isConfigured, getProjectConfig } from "../config/project.js";
import { stopTunnel, isTunnelRunning } from "../tunnel/daemon.js";
import {
	printBanner,
	printRoutes,
	printSuccess,
	printError,
	printDim,
} from "../ui/format.js";

export async function downCommand(): Promise<void> {
	printBanner();

	if (!isConfigured()) {
		printDim("No tunnel configured in this directory.");
		return;
	}

	if (!(await isTunnelRunning())) {
		printDim("Tunnel is not running.");
		return;
	}

	const config = await getProjectConfig();
	const stopped = await stopTunnel();

	if (stopped) {
		printSuccess("Tunnel stopped");
		if (config) {
			printDim("DNS records preserved. Run `sparq` to start again.");
			console.log();
			printRoutes(config.routes, false);
		}
	} else {
		printError("Failed to stop tunnel");
	}
}
