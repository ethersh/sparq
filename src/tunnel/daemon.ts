import { execSync, spawn } from "node:child_process";
import { openSync, closeSync } from "node:fs";
import {
	savePid,
	getPid,
	clearPid,
	getCloudflaredConfigPath,
	getLogPath,
} from "../config/project.js";

const isWindows = process.platform === "win32";

export function isProcessRunning(pid: number): boolean {
	try {
		if (isWindows) {
			const result = execSync(`tasklist /FI "PID eq ${pid}" /NH`, { encoding: "utf-8" });
			return result.includes(String(pid));
		}
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

export async function isTunnelRunning(tunnelId: string): Promise<boolean> {
	const pid = await getPid(tunnelId);
	if (!pid) return false;
	if (!isProcessRunning(pid)) {
		await clearPid(tunnelId);
		return false;
	}
	return true;
}

export async function startTunnel(tunnelId: string): Promise<number> {
	const configPath = getCloudflaredConfigPath(tunnelId);
	const logFile = getLogPath(tunnelId);

	// Open log file for writing
	const logFd = openSync(logFile, "a");

	const child = spawn("cloudflared", ["tunnel", "--config", configPath, "run"], {
		detached: true,
		stdio: ["ignore", logFd, logFd],
	});

	child.unref();

	// Close the fd in the parent — child inherits its own copy
	closeSync(logFd);

	if (!child.pid) {
		throw new Error("Failed to start cloudflared process");
	}

	await savePid(child.pid, tunnelId);
	return child.pid;
}

export async function stopTunnel(tunnelId: string): Promise<boolean> {
	const pid = await getPid(tunnelId);
	if (!pid) return false;

	if (!isProcessRunning(pid)) {
		await clearPid(tunnelId);
		return false;
	}

	try {
		if (isWindows) {
			execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
		} else {
			process.kill(pid, "SIGTERM");
			// Give it a moment to shut down gracefully
			await new Promise((resolve) => setTimeout(resolve, 1000));
			if (isProcessRunning(pid)) {
				process.kill(pid, "SIGKILL");
			}
		}
	} catch {
		// Process already gone
	}

	await clearPid(tunnelId);
	return true;
}

export async function getTunnelPid(tunnelId: string): Promise<number | null> {
	const pid = await getPid(tunnelId);
	if (!pid) return null;
	if (!isProcessRunning(pid)) {
		await clearPid(tunnelId);
		return null;
	}
	return pid;
}
