import { input, confirm } from "@inquirer/prompts";
import chalk from "chalk";
import yoctoSpinner from "yocto-spinner";
import { isConfigured, getProjectConfig, saveProjectConfig } from "../config/project.js";
import { ensureAuth } from "../auth/ensure.js";
import { listZones, extractZoneFromHostname } from "../cf/zones.js";
import { getDnsRecord, createDnsRecord, updateDnsRecord } from "../cf/dns.js";
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
	if (!auth.account_id) {
		printError("Could not determine account ID");
		return;
	}

	const zones = await listZones();

	console.log(chalk.bold("  Add route\n"));

	const portStr = await input({
		message: "Port to forward",
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
			message: "Update port for this route?",
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

	// Create/update DNS
	const zone = extractZoneFromHostname(hostname, zones);
	if (zone) {
		const dnsSpinner = yoctoSpinner({
			text: `Setting up DNS for ${hostname}...`,
		}).start();

		try {
			const existing = await getDnsRecord(zone.id, hostname);
			if (existing) {
				printWarning(`DNS record exists: ${hostname} → ${existing.content}`);
				const overwrite = await confirm({
					message: "Overwrite?",
					default: false,
				});
				if (overwrite) {
					await updateDnsRecord(zone.id, existing.id, hostname, config.tunnel_id);
					dnsSpinner.success(`DNS updated: ${hostname}`);
				} else {
					dnsSpinner.stop();
					return;
				}
			} else {
				await createDnsRecord(zone.id, hostname, config.tunnel_id);
				dnsSpinner.success(`DNS: ${hostname} → tunnel`);
			}
		} catch (err: any) {
			dnsSpinner.error(`Failed: ${err.message}`);
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

	// Restart if running
	if (await isTunnelRunning()) {
		await stopTunnel();
		const pid = await startTunnel();
		printSuccess(`Tunnel restarted (PID: ${pid})`);
	}

	console.log();
	printRoutes(config.routes, await isTunnelRunning());
}
