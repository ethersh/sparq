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

	const config = await getProjectConfig();
	if (!config) {
		printError("Config file is corrupt.");
		return;
	}

	if (!(await isTunnelRunning(config.tunnel_id))) {
		printDim("Tunnel is not running.");
		return;
	}

	const stopped = await stopTunnel(config.tunnel_id);

	if (stopped) {
		printSuccess("Tunnel stopped");
		printDim("DNS records preserved. Run `sparq` to start again.");
		console.log();
		printRoutes(config.routes, false);
	} else {
		printError("Failed to stop tunnel");
	}
}
