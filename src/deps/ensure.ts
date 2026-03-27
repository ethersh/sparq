import { execSync } from "node:child_process";
import chalk from "chalk";
import yoctoSpinner from "yocto-spinner";

function commandExists(cmd: string): boolean {
	try {
		execSync(`which ${cmd}`, { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

function detectPlatform(): "macos" | "linux" | "unsupported" {
	const platform = process.platform;
	if (platform === "darwin") return "macos";
	if (platform === "linux") return "linux";
	return "unsupported";
}

function hasHomebrew(): boolean {
	return commandExists("brew");
}

async function installCloudflared(): Promise<void> {
	const platform = detectPlatform();
	const spinner = yoctoSpinner({ text: "Installing cloudflared..." }).start();

	try {
		if (platform === "macos" && hasHomebrew()) {
			execSync("brew install cloudflared", { stdio: "ignore", timeout: 120000 });
		} else if (platform === "linux") {
			// Try apt first, then curl
			try {
				execSync(
					"curl -L --output /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb && sudo dpkg -i /tmp/cloudflared.deb",
					{ stdio: "ignore", timeout: 120000 },
				);
			} catch {
				execSync(
					"curl -L --output /usr/local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 && chmod +x /usr/local/bin/cloudflared",
					{ stdio: "ignore", timeout: 120000 },
				);
			}
		} else {
			spinner.error("Unsupported platform");
			throw new Error(
				"Unsupported platform. Install cloudflared manually: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/",
			);
		}
		spinner.success("cloudflared installed");
	} catch (err) {
		spinner.error("Failed to install cloudflared");
		throw err;
	}
}

export async function ensureCloudflared(): Promise<void> {
	if (commandExists("cloudflared")) return;

	console.log(chalk.yellow("  cloudflared is not installed."));
	await installCloudflared();
}
