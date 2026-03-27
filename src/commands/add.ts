import { input, confirm } from "@inquirer/prompts";
import chalk from "chalk";
import yoctoSpinner from "yocto-spinner";
import { isConfigured, getProjectConfig, saveProjectConfig } from "../config/project.js";
import { ensureAuth, ensureTunnelAuth } from "../auth/ensure.js";
import { listZones, extractZoneFromHostname } from "../cf/zones.js";
import { routeTunnelDns } from "../cf/tunnel-routes.js";
import { generateCloudflaredConfig } from "../tunnel/config-gen.js";
import { isTunnelRunning, stopTunnel, startTunnel } from "../tunnel/daemon.js";
import { registerTunnel } from "../config/global.js";
import { promptDomainWithAutocomplete } from "../ui/domain-input.js";
import {
	printBanner,
	printRoutes,
	printSuccess,
	printWarning,
	printError,
	printDim,
} from "../ui/format.js";

export async function addCommand(): Promise<void> {
	printBanner();

	if (!isConfigured()) {
		printDim("No tunnel configured. Run `sparq` first to set up.");
		return;
	}

	const config = await getProjectConfig();
	if (!config) {
		printError("Config file is corrupt.");
		return;
	}

	const auth = await ensureAuth();
	const cert = await ensureTunnelAuth();
	const zones = await listZones();

	console.log();

	const portStr = await input({
		message: "What port is your app running on?",
		validate: (val) => {
			const n = parseInt(val, 10);
			if (isNaN(n) || n < 1 || n > 65535) return "Enter a valid port (1-65535)";
			return true;
		},
	});
	const port = parseInt(portStr, 10);

	const hostname = await promptDomainWithAutocomplete(zones);

	// Check for duplicate
	if (config.routes.some((r) => r.hostname === hostname)) {
		printWarning("This hostname is already configured.");
		const update = await confirm({
			message: "Update port?",
			default: false,
		});
		if (update) {
			config.routes = config.routes.map((r) =>
				r.hostname === hostname ? { ...r, port } : r,
			);
		} else {
			return;
		}
	} else {
		config.routes.push({ hostname, port, protocol: "http" });
	}

	// Route DNS via tunnel-specific endpoint
	const zone = extractZoneFromHostname(hostname, zones);
	if (zone) {
		const dnsSpinner = yoctoSpinner({
			text: `DNS: ${hostname}...`,
		}).start();

		try {
			await routeTunnelDns(
				cert.apiToken,
				zone.id,
				config.tunnel_id,
				hostname,
				true,
			);
			dnsSpinner.success(`DNS: ${hostname} → tunnel`);
		} catch (err: any) {
			dnsSpinner.error(`DNS failed: ${hostname}`);
			printError(err.response?.data?.errors?.[0]?.message ?? err.message);
			return;
		}
	}

	// Save and restart
	await saveProjectConfig(config);
	await registerTunnel({
		path: process.cwd(),
		tunnel_id: config.tunnel_id,
		tunnel_name: config.tunnel_name,
		routes: config.routes,
	});
	await generateCloudflaredConfig(config);

	if (await isTunnelRunning(config.tunnel_id)) {
		await stopTunnel(config.tunnel_id);
		const pid = await startTunnel(config.tunnel_id);
		printSuccess(`Tunnel restarted (PID: ${pid})`);
	}

	console.log();
	printRoutes(config.routes, await isTunnelRunning(config.tunnel_id));
}
