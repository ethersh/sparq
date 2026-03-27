import { confirm } from "@inquirer/prompts";
import yoctoSpinner from "yocto-spinner";
import { isConfigured, getProjectConfig, saveProjectConfig } from "../config/project.js";
import { ensureAuth } from "../auth/ensure.js";
import { listZones, extractZoneFromHostname } from "../cf/zones.js";
import { getDnsRecord, deleteDnsRecord } from "../cf/dns.js";
import { generateCloudflaredConfig } from "../tunnel/config-gen.js";
import { isTunnelRunning, stopTunnel, startTunnel } from "../tunnel/daemon.js";
import { registerTunnel } from "../config/global.js";
import {
	printBanner,
	printRoutes,
	printSuccess,
	printWarning,
	printError,
	printDim,
} from "../ui/format.js";

export async function rmCommand(hostname: string): Promise<void> {
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

	const route = config.routes.find((r) => r.hostname === hostname);
	if (!route) {
		printError(`Route "${hostname}" not found.`);
		printDim("Current routes:");
		for (const r of config.routes) {
			printDim(`  ${r.hostname} → localhost:${r.port}`);
		}
		return;
	}

	const shouldDelete = await confirm({
		message: `Remove ${hostname} → localhost:${route.port} and delete DNS record?`,
		default: false,
	});

	if (!shouldDelete) return;

	const auth = await ensureAuth();

	// Delete DNS record
	const zones = await listZones();
	const zone = extractZoneFromHostname(hostname, zones);
	if (zone) {
		const dnsSpinner = yoctoSpinner({
			text: `Deleting DNS record for ${hostname}...`,
		}).start();
		try {
			const record = await getDnsRecord(zone.id, hostname);
			if (record) {
				await deleteDnsRecord(zone.id, record.id);
				dnsSpinner.success(`DNS record deleted: ${hostname}`);
			} else {
				dnsSpinner.success("No DNS record found (already clean)");
			}
		} catch (err: any) {
			dnsSpinner.error(`Failed to delete DNS: ${err.message}`);
		}
	}

	// Update config
	config.routes = config.routes.filter((r) => r.hostname !== hostname);

	if (config.routes.length === 0) {
		printWarning("No routes remaining. Tunnel config kept but won't serve traffic.");
	}

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
		if (config.routes.length > 0) {
			await startTunnel();
			printSuccess("Tunnel restarted");
		} else {
			printSuccess("Tunnel stopped (no routes)");
		}
	}

	console.log();
	if (config.routes.length > 0) {
		printRoutes(config.routes, await isTunnelRunning());
	}
}
