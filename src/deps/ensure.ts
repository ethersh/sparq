import { execSync } from "node:child_process";
import { arch, tmpdir } from "node:os";
import path from "node:path";
import chalk from "../ui/color.js";
import yoctoSpinner from "../ui/spinner.js";

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
		if (platform === "macos") {
			if (hasHomebrew()) {
				execSync("brew install cloudflared", { stdio: "ignore", timeout: 120000 });
			} else {
				const macArch = arch() === "arm64" ? "arm64" : "amd64";
				execSync(
					`curl -L --output /tmp/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-${macArch} && chmod +x /tmp/cloudflared && sudo mv /tmp/cloudflared /usr/local/bin/cloudflared`,
					{ stdio: "inherit", timeout: 120000 },
				);
			}
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
			const msiUrl = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-${winArch}.msi`;
			const msiPath = path.join(tmpdir(), "cloudflared.msi");
			const errors: string[] = [];

			// Try winget first
			try {
				execSync("winget install --id Cloudflare.cloudflared --accept-source-agreements --accept-package-agreements", {
					stdio: "ignore",
					timeout: 120000,
				});
			} catch {
				errors.push("winget not available");
				// Try PowerShell download + MSI install
				try {
					execSync(
						`powershell -Command "Invoke-WebRequest -Uri '${msiUrl}' -OutFile '${msiPath}'"`,
						{ stdio: "ignore", timeout: 120000 },
					);
					execSync(`msiexec /i "${msiPath}" /quiet /norestart`, {
						stdio: "ignore",
						timeout: 120000,
					});
				} catch {
					errors.push("MSI install failed");
					// Try downloading the exe directly
					try {
						const exeUrl = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-${winArch}.exe`;
						const exePath = path.join(tmpdir(), "cloudflared.exe");
						execSync(
							`powershell -Command "Invoke-WebRequest -Uri '${exeUrl}' -OutFile '${exePath}'"`,
							{ stdio: "ignore", timeout: 120000 },
						);
						// Copy to a directory likely in PATH
						const destDir = path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Local"), "cloudflared");
						execSync(`mkdir "${destDir}" 2>nul & copy "${exePath}" "${destDir}\\cloudflared.exe"`, {
							stdio: "ignore",
							shell: "cmd.exe",
						});
						// Add to PATH for this session
						process.env.PATH = `${destDir};${process.env.PATH}`;
						console.log(chalk.yellow(`  Installed to ${destDir}\\cloudflared.exe`));
						console.log(chalk.yellow(`  Add ${destDir} to your system PATH for future sessions.`));
					} catch {
						errors.push("direct exe download failed");
						throw new Error(
							`Failed to install cloudflared on Windows (tried: ${errors.join(", ")}). Install manually: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/`,
						);
					}
				}
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
