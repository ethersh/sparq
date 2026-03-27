import chalk from "chalk";
import { isConfigured, getProjectConfig } from "../config/project.js";
import { isTunnelRunning, startTunnel } from "../tunnel/daemon.js";
import { generateCloudflaredConfig } from "../tunnel/config-gen.js";
import { runSetupWizard } from "../ui/setup-wizard.js";
import {
	printBanner,
	printRoutes,
	printSuccess,
	printError,
} from "../ui/format.js";
import yoctoSpinner from "yocto-spinner";

export async function defaultCommand(): Promise<void> {
	// Not configured → run setup wizard
	if (!isConfigured()) {
		await runSetupWizard();
		return;
	}

	// Already configured → start tunnel
	const config = await getProjectConfig();
	if (!config) {
		printError("Config file is corrupt. Delete .sparq/ and run sparq again.");
		process.exit(1);
	}

	printBanner();

	// Check if already running
	if (await isTunnelRunning()) {
		printRoutes(config.routes, true);
		console.log(chalk.dim("  Tunnel is already running."));
		console.log(chalk.dim("  Run `sparq down` to stop.\n"));
		return;
	}

	// Generate config and start
	await generateCloudflaredConfig(config);

	const spinner = yoctoSpinner({ text: "Starting tunnel..." }).start();
	try {
		const pid = await startTunnel();
		spinner.success(`Tunnel running (PID: ${pid})`);
	} catch (err: any) {
		spinner.error("Failed to start tunnel");
		printError(err.message);
		process.exit(1);
	}

	console.log();
	printRoutes(config.routes, true);
}
