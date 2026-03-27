import { input, confirm } from "@inquirer/prompts";
import { randomBytes } from "node:crypto";
import chalk from "chalk";
import yoctoSpinner from "yocto-spinner";
import { ensureAuth, ensureTunnelAuth } from "../auth/ensure.js";
import { ensureCloudflared } from "../deps/ensure.js";
import { listZones, extractZoneFromHostname } from "../cf/zones.js";
import {
	routeTunnelDns,
	createTunnelWithCert,
} from "../cf/tunnel-routes.js";
import { generateCloudflaredConfig } from "../tunnel/config-gen.js";
import { startTunnel } from "../tunnel/daemon.js";
import { saveProjectConfig, saveCredentials } from "../config/project.js";
import { registerTunnel } from "../config/global.js";
import { promptDomainWithAutocomplete } from "./domain-input.js";
import {
	printBanner,
	printBox,
	printRoutes,
	printSuccess,
	printWarning,
	printError,
	printDim,
} from "./format.js";
import type { Route, ProjectConfig, TunnelCredentials } from "../config/schema.js";
import { basename } from "node:path";

export async function runSetupWizard(): Promise<void> {
	printBanner();

	printBox(
		"setup",
		[
			"No tunnel configured for this directory.",
			"",
			chalk.dim("Let's get you connected in under a minute."),
		],
		chalk.cyan,
	);

	// Step 1: Ensure cloudflared
	console.log();
	await ensureCloudflared();

	// Step 2: OAuth login (for zones + user info)
	const auth = await ensureAuth();
	if (!auth.account_id) {
		printError("Could not determine account ID");
		process.exit(1);
	}

	// Step 3: cloudflared cert.pem (for tunnel creation + DNS routing)
	const cert = await ensureTunnelAuth();

	// Step 4: Fetch zones (using OAuth token)
	console.log();
	const zonesSpinner = yoctoSpinner({
		text: "Fetching your domains...",
	}).start();
	let zones;
	try {
		zones = await listZones();
		zonesSpinner.success(
			`Found ${zones.length} zone${zones.length === 1 ? "" : "s"}`,
		);
	} catch (err: any) {
		zonesSpinner.error("Failed to fetch zones");
		printError(err.message);
		process.exit(1);
	}

	if (zones.length === 0) {
		printError("No active zones found in your Cloudflare account.");
		printDim("Add a domain to Cloudflare first, then try again.");
		process.exit(1);
	}

	// Step 5: Collect routes
	const routes: Route[] = [];
	let addMore = true;

	while (addMore) {
		console.log();

		const portStr = await input({
			message: "What port is your app running on?",
			validate: (val) => {
				const n = parseInt(val, 10);
				if (isNaN(n) || n < 1 || n > 65535)
					return "Enter a valid port (1-65535)";
				return true;
			},
		});
		const port = parseInt(portStr, 10);

		const hostname = await promptDomainWithAutocomplete(zones);

		routes.push({ hostname, port, protocol: "http" });
		printSuccess(`${hostname} → localhost:${port}`);

		addMore = await confirm({
			message: "Forward another port?",
			default: false,
		});
	}

	if (routes.length === 0) {
		printError("No routes configured. Exiting.");
		process.exit(1);
	}

	// Step 6: Create tunnel (using cert.pem token)
	console.log();
	const dirName = basename(process.cwd())
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	const tunnelName = `sparq-${dirName || "tunnel"}`;
	const tunnelSecret = randomBytes(32).toString("base64");

	const tunnelSpinner = yoctoSpinner({
		text: `Creating tunnel "${tunnelName}"...`,
	}).start();

	let tunnel;
	try {
		tunnel = await createTunnelWithCert(
			cert.apiToken,
			cert.accountID,
			tunnelName,
			tunnelSecret,
		);
		tunnelSpinner.success(`Tunnel "${tunnelName}" created`);
	} catch (err: any) {
		tunnelSpinner.error("Failed to create tunnel");
		printError(err.message);
		process.exit(1);
	}

	const credentials: TunnelCredentials = {
		AccountTag: cert.accountID,
		TunnelSecret: tunnelSecret,
		TunnelID: tunnel.id,
	};

	// Step 7: Route DNS (using cert.pem token + tunnel-specific endpoint)
	for (const route of routes) {
		const zone = extractZoneFromHostname(route.hostname, zones);
		if (!zone) {
			printWarning(`No zone found for ${route.hostname}, skipping DNS`);
			continue;
		}

		const dnsSpinner = yoctoSpinner({
			text: `DNS: ${route.hostname}...`,
		}).start();

		try {
			await routeTunnelDns(
				cert.apiToken,
				zone.id,
				tunnel.id,
				route.hostname,
				true, // overwrite if exists
			);
			dnsSpinner.success(`DNS: ${route.hostname} → tunnel`);
		} catch (err: any) {
			dnsSpinner.error(`DNS failed: ${route.hostname}`);
			printError(err.response?.data?.errors?.[0]?.message ?? err.message);
		}
	}

	// Step 8: Save config
	const config: ProjectConfig = {
		tunnel_id: tunnel.id,
		tunnel_name: tunnelName,
		account_id: cert.accountID,
		routes,
	};

	await saveProjectConfig(config);
	await saveCredentials(credentials);
	await registerTunnel({
		path: process.cwd(),
		tunnel_id: tunnel.id,
		tunnel_name: tunnelName,
		routes,
	});

	// Step 9: Start tunnel
	await generateCloudflaredConfig(config);

	const pidSpinner = yoctoSpinner({ text: "Starting tunnel..." }).start();
	try {
		const pid = await startTunnel();
		pidSpinner.success(`Tunnel running (PID: ${pid})`);
	} catch (err: any) {
		pidSpinner.error("Failed to start tunnel");
		printError(err.message);
		process.exit(1);
	}

	console.log();
	printRoutes(routes, true);
	printDim("Run `sparq status` to check, `sparq down` to stop.");
	console.log();
}
