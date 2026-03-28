import { execSync } from "node:child_process";
import { arch, tmpdir } from "node:os";
import path from "node:path";
import chalk from "chalk";
import yoctoSpinner from "yocto-spinner";

const isWindows = process.platform === "win32";

function commandExists(cmd: string): boolean {
	try {
		execSync(isWindows ? `where ${cmd}` : `which ${cmd}`, { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

function detectPlatform(): "macos" | "linux" | "windows" | "unsupported" {
	const platform = process.platform;
	if (platform === "darwin") return "macos";
	if (platform === "linux") return "linux";
	if (platform === "win32") return "windows";
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
			const linuxArch = arch() === "arm64" ? "arm64" : "amd64";
			try {
				execSync(
					`curl -L --output /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${linuxArch}.deb && sudo dpkg -i /tmp/cloudflared.deb`,
					{ stdio: "ignore", timeout: 120000 },
				);
			} catch {
				execSync(
					`curl -L --output /usr/local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${linuxArch} && chmod +x /usr/local/bin/cloudflared`,
					{ stdio: "ignore", timeout: 120000 },
				);
			}
		} else if (platform === "windows") {
			const winArch = arch() === "arm64" ? "arm64" : "amd64";
			const msiPath = path.join(tmpdir(), "cloudflared.msi");
			try {
				// Try winget first
				execSync("winget install --id Cloudflare.cloudflared --accept-source-agreements --accept-package-agreements", {
					stdio: "ignore",
					timeout: 120000,
				});
			} catch {
				// Fall back to downloading the .msi
				execSync(
					`powershell -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-${winArch}.msi' -OutFile '${msiPath}'"`,
					{ stdio: "ignore", timeout: 120000 },
				);
				execSync(`msiexec /i "${msiPath}" /quiet /norestart`, {
					stdio: "ignore",
					timeout: 120000,
				});
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
