import { isConfigured, getProjectConfig } from "../config/project.js";
import { isTunnelRunning, startTunnel } from "../tunnel/daemon.js";
import { generateCloudflaredConfig } from "../tunnel/config-gen.js";
import { ensureCloudflared } from "../deps/ensure.js";
import { runSetupWizard } from "../ui/setup-wizard.js";
import {
	printBanner,
	printRoutes,
	printError,
	printDim,
	printHint,
} from "../ui/format.js";
import yoctoSpinner from "yocto-spinner";

export async function defaultCommand(): Promise<void> {
	if (!isConfigured()) {
		await runSetupWizard();
		return;
	}

	const config = await getProjectConfig();
	if (!config) {
		printError("Config file is corrupt. Delete .sparq/ and run sparq again.");
		process.exit(1);
	}

	printBanner();

	if (await isTunnelRunning()) {
		printRoutes(config.routes, true);
		printHint("Run `sparq down` to stop.");
		console.log();
		return;
	}

	await ensureCloudflared();
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
	printHint("Run `sparq logs -f` to follow, `sparq down` to stop.");
	console.log();
}
