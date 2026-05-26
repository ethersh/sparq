import { randomBytes } from "node:crypto";
import yoctoSpinner from "yocto-spinner";
import { ensureAuth, ensureTunnelAuth } from "../auth/ensure.js";
import { ensureCloudflared } from "../deps/ensure.js";
import { listZones, extractZoneFromHostname } from "../cf/zones.js";
import {
	routeTunnelDns,
	createTunnelWithCert,
	listTunnelsWithCert,
} from "../cf/tunnel-routes.js";
import { generateCloudflaredConfig } from "../tunnel/config-gen.js";
import { startTunnel, isTunnelRunning, stopTunnel } from "../tunnel/daemon.js";
import { saveProjectConfig, saveCredentials } from "../config/project.js";
import { registerTunnel } from "../config/global.js";
import { printError, printSuccess, printRoutes } from "../ui/format.js";
import type { Route, ProjectConfig, TunnelCredentials } from "../config/schema.js";

export interface HeadlessOptions {
	domain: string;
	route: string[];
	seed?: string;
	json?: boolean;
}

interface ParsedRoute {
	label: string | null;
	port: number;
}

function parseRoutes(raw: string[]): ParsedRoute[] {
	return raw.map((r) => {
		const parts = r.split(":");
		if (parts.length === 2) {
			const port = parseInt(parts[1], 10);
			if (isNaN(port) || port < 1 || port > 65535)
				throw new Error(`Invalid port in route "${r}"`);
			return { label: parts[0], port };
		}
		const port = parseInt(parts[0], 10);
		if (isNaN(port) || port < 1 || port > 65535)
			throw new Error(`Invalid port in route "${r}"`);
		return { label: null, port };
	});
}

function buildHostname(seed: string, label: string | null, domain: string): string {
	if (label) return `${seed}-${label}.${domain}`;
	return `${seed}.${domain}`;
}

export async function headlessUp(opts: HeadlessOptions): Promise<void> {
	const seed = opts.seed ?? randomBytes(2).toString("hex");
	const parsed = parseRoutes(opts.route);

	if (parsed.length === 0) {
		throw new Error("At least one --route is required");
	}

	if (parsed.length > 1 && parsed.some((r) => !r.label)) {
		throw new Error("Multiple routes require labels (e.g. api:3000 web:5173)");
	}

	await ensureCloudflared();
	const auth = await ensureAuth();
	if (!auth.account_id) throw new Error("Could not determine account ID");

	const cert = await ensureTunnelAuth();

	const zones = await listZones();
	const zone = extractZoneFromHostname(opts.domain, zones);
	if (!zone) throw new Error(`Zone not found for domain "${opts.domain}"`);

	const routes: Route[] = parsed.map((r) => ({
		hostname: buildHostname(seed, r.label, opts.domain),
		port: r.port,
		protocol: "http" as const,
	}));

	const tunnelName = `sparq-${seed}`;
	const tunnelSecret = randomBytes(32).toString("base64");

	let tunnel: { id: string; name: string };
	const tunnelSpinner = opts.json ? null : yoctoSpinner({ text: `Creating tunnel "${tunnelName}"...` }).start();

	try {
		tunnel = await createTunnelWithCert(cert.apiToken, cert.accountID, tunnelName, tunnelSecret);
		tunnelSpinner?.success(`Tunnel "${tunnelName}" created`);
	} catch (err: any) {
		if (err.response?.status !== 409) throw err;

		// Seeded tunnel already exists — reuse it
		tunnelSpinner?.success(`Tunnel "${tunnelName}" exists, reusing`);
		const existing = await listTunnelsWithCert(cert.apiToken, cert.accountID, tunnelName);
		const match = existing.find((t) => t.name === tunnelName);
		if (!match) throw new Error(`Tunnel "${tunnelName}" conflict but not found`);
		tunnel = match;
	}

	const credentials: TunnelCredentials = {
		AccountTag: cert.accountID,
		TunnelSecret: tunnelSecret,
		TunnelID: tunnel.id,
	};

	for (const route of routes) {
		const dnsSpinner = opts.json ? null : yoctoSpinner({ text: `DNS: ${route.hostname}...` }).start();
		try {
			await routeTunnelDns(cert.apiToken, zone.id, tunnel.id, route.hostname, true);
			dnsSpinner?.success(`DNS: ${route.hostname} → tunnel`);
		} catch (err: any) {
			dnsSpinner?.error(`DNS failed: ${route.hostname}`);
			throw new Error(err.response?.data?.errors?.[0]?.message ?? err.message);
		}
	}

	const config: ProjectConfig = {
		tunnel_id: tunnel.id,
		tunnel_name: tunnelName,
		account_id: cert.accountID,
		routes,
	};

	await saveProjectConfig(config);
	await saveCredentials(credentials, tunnel.id);
	await registerTunnel({
		path: process.cwd(),
		tunnel_id: tunnel.id,
		tunnel_name: tunnelName,
		routes,
	});
	await generateCloudflaredConfig(config);

	if (await isTunnelRunning(tunnel.id)) {
		await stopTunnel(tunnel.id);
	}

	const pid = await startTunnel(tunnel.id);

	if (opts.json) {
		const output = {
			tunnel_id: tunnel.id,
			tunnel_name: tunnelName,
			seed,
			pid,
			routes: routes.map((r) => ({
				hostname: r.hostname,
				port: r.port,
				url: `https://${r.hostname}`,
			})),
		};
		console.log(JSON.stringify(output));
	} else {
		printSuccess(`Tunnel running (PID: ${pid})`);
		console.log();
		printRoutes(routes, true);
	}
}
