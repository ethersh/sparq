import { confirm } from "@inquirer/prompts";
import chalk from "chalk";
import yoctoSpinner from "yocto-spinner";
import {
	isConfigured,
	getProjectConfig,
	removeProjectConfig,
	removeTunnelData,
} from "../config/project.js";
import { ensureTunnelAuth } from "../auth/ensure.js";
import { listZones, extractZoneFromHostname } from "../cf/zones.js";
import {
	deleteTunnelWithCert,
	getDnsRecordWithToken,
	deleteDnsRecordWithToken,
} from "../cf/tunnel-routes.js";
import { stopTunnel, isTunnelRunning } from "../tunnel/daemon.js";
import { unregisterTunnel } from "../config/global.js";
import {
	printBanner,
	printError,
	printDim,
	printSuccess,
} from "../ui/format.js";

const BOMB_FRAMES = [
	[
		"         ",
		"    *    ",
		"   /|\\   ",
		"  (_|_)  ",
		"   |#|   ",
		"   |#|   ",
		"  _|#|_  ",
		" |#####| ",
		" |#####| ",
		"  \\###/  ",
		"   \\_/   ",
	],
	[
		"         ",
		"   \\|/   ",
		"  --*--  ",
		"   /|\\   ",
		"   |#|   ",
		"   |#|   ",
		"  _|#|_  ",
		" |#####| ",
		" |#####| ",
		"  \\###/  ",
		"   \\_/   ",
	],
	[
		"  \\   /  ",
		"   \\ /   ",
		"  --*--  ",
		"   / \\   ",
		"  /   \\  ",
		"   |#|   ",
		"  _|#|_  ",
		" |#####| ",
		" |#####| ",
		"  \\###/  ",
		"   \\_/   ",
	],
	[
		"         ",
		"         ",
		"         ",
		"         ",
		"    *    ",
		"   /#\\   ",
		"  /###\\  ",
		" |#####| ",
		" |#####| ",
		"  \\###/  ",
		"   \\_/   ",
	],
	[
		"         ",
		"         ",
		"         ",
		"   . .   ",
		"  .* *.  ",
		"  /# #\\  ",
		" / ### \\ ",
		" |#####| ",
		" |#####| ",
		"  \\###/  ",
		"   \\_/   ",
	],
	[
		"         ",
		"         ",
		"  . * .  ",
		"  *   *  ",
		" .  *  . ",
		" * /#\\ * ",
		"  /###\\  ",
		" |#####| ",
		" |#####| ",
		"  \\###/  ",
		"   \\_/   ",
	],
	[
		"         ",
		"  * . *  ",
		" .     . ",
		" *  .  * ",
		"   * *   ",
		"  .   .  ",
		"  * . *  ",
		"  .###.  ",
		"  |###|  ",
		"   \\#/   ",
		"    v    ",
	],
	[
		" *  .  * ",
		"  .   .  ",
		" .  *  . ",
		"    .    ",
		"  *   *  ",
		"   . .   ",
		"    *    ",
		"   . .   ",
		"    .    ",
		"         ",
		"         ",
	],
	[
		"  .   .  ",
		"    .    ",
		"  .   .  ",
		"         ",
		"   . .   ",
		"    .    ",
		"         ",
		"    .    ",
		"         ",
		"         ",
		"         ",
	],
	[
		"         ",
		"    .    ",
		"         ",
		"         ",
		"    .    ",
		"         ",
		"         ",
		"         ",
		"         ",
		"         ",
		"         ",
	],
	[
		"         ",
		"         ",
		"         ",
		"         ",
		"         ",
		"         ",
		"         ",
		"         ",
		"         ",
		"         ",
		"         ",
	],
];

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function playBombAnimation(): Promise<void> {
	const brand = chalk.hex("#FF8C00");
	const fire = chalk.hex("#FF4500");
	const smoke = chalk.dim;
	const frameHeight = BOMB_FRAMES[0].length;

	// Hide cursor
	process.stdout.write("\x1B[?25l");

	const colorFrame = (frame: string[], index: number): string[] => {
		if (index <= 2) {
			// Fuse burning — bomb is orange, sparks are yellow
			return frame.map((line) =>
				line.includes("*") || line.includes("/") || line.includes("\\") || line.includes("-")
					? (line.includes("#") ? brand(line) : chalk.yellow(line))
					: brand(line),
			);
		}
		if (index <= 3) {
			return frame.map((line) => brand(line));
		}
		if (index <= 6) {
			// Explosion — fire colors
			return frame.map((line) =>
				line.includes("*") || line.includes(".") ? chalk.yellow(line) : fire(line),
			);
		}
		// Smoke fading
		return frame.map((line) => smoke(line));
	};

	for (let i = 0; i < BOMB_FRAMES.length; i++) {
		const colored = colorFrame(BOMB_FRAMES[i], i);
		const output = colored.map((line) => `    ${line}`).join("\n");
		process.stdout.write(output + "\n");

		const delay = i <= 2 ? 300 : i <= 6 ? 150 : 200;
		await sleep(delay);

		// Move cursor up to overwrite
		if (i < BOMB_FRAMES.length - 1) {
			process.stdout.write(`\x1B[${frameHeight}A`);
		}
	}

	// Show cursor
	process.stdout.write("\x1B[?25h");
}

export async function destroyCommand(): Promise<void> {
	printBanner();

	if (!isConfigured()) {
		printDim("No tunnel configured in this directory.");
		return;
	}

	const config = await getProjectConfig();
	if (!config) {
		printError("Config file is corrupt. Removing local config.");
		await removeProjectConfig();
		return;
	}

	console.log();
	console.log(
		chalk.red("  This will permanently destroy the tunnel and all DNS records."),
	);
	console.log(
		chalk.dim(`  Tunnel: ${config.tunnel_name} (${config.tunnel_id})`),
	);
	for (const r of config.routes) {
		console.log(chalk.dim(`  Route:  ${r.hostname} → localhost:${r.port}`));
	}
	console.log();

	const confirmed = await confirm({
		message: "Are you sure? This cannot be undone.",
		default: false,
	});

	if (!confirmed) {
		printDim("Cancelled.");
		return;
	}

	const cert = await ensureTunnelAuth();

	// 1. Stop tunnel if running
	if (await isTunnelRunning(config.tunnel_id)) {
		const stopSpinner = yoctoSpinner({ text: "Stopping tunnel..." }).start();
		await stopTunnel(config.tunnel_id);
		stopSpinner.success("Tunnel stopped");
	}

	// 2. Delete DNS records
	let zones;
	try {
		const { listZones: lz } = await import("../cf/zones.js");
		zones = await lz();
	} catch {
		zones = [];
	}

	for (const route of config.routes) {
		const zone = extractZoneFromHostname(route.hostname, zones);
		if (!zone) continue;

		const dnsSpinner = yoctoSpinner({
			text: `Deleting DNS: ${route.hostname}...`,
		}).start();
		try {
			const record = await getDnsRecordWithToken(
				cert.apiToken,
				zone.id,
				route.hostname,
			);
			if (record) {
				await deleteDnsRecordWithToken(cert.apiToken, zone.id, record.id);
				dnsSpinner.success(`DNS deleted: ${route.hostname}`);
			} else {
				dnsSpinner.success(`DNS already clean: ${route.hostname}`);
			}
		} catch (err: any) {
			dnsSpinner.error(`DNS failed: ${route.hostname}`);
		}
	}

	// 3. Delete tunnel from Cloudflare
	const tunnelSpinner = yoctoSpinner({
		text: `Deleting tunnel "${config.tunnel_name}"...`,
	}).start();
	try {
		await deleteTunnelWithCert(
			cert.apiToken,
			config.account_id,
			config.tunnel_id,
		);
		tunnelSpinner.success(`Tunnel "${config.tunnel_name}" deleted`);
	} catch (err: any) {
		tunnelSpinner.error(`Failed to delete tunnel: ${err.message}`);
	}

	// 4. Remove local data
	await removeTunnelData(config.tunnel_id);
	await removeProjectConfig();
	await unregisterTunnel(process.cwd());

	// 5. Boom
	console.log();
	await playBombAnimation();
	console.log(
		`    ${chalk.hex("#FF8C00").bold("DESTROYED")} ${chalk.dim("— tunnel obliterated")}`,
	);
	console.log();
}
