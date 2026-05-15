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

/**
 * Check if a specific process is running by PID and verify it's cloudflared.
 * On Unix systems, PIDs can be reused after a process dies, so we need to
 * verify the process name to avoid false positives after system restarts.
 */
export function isCloudflaredProcessRunning(pid: number): boolean {
	try {
		if (isWindows) {
			// On Windows, check if cloudflared.exe is running with this PID
			const result = execSync(`tasklist /FI "PID eq ${pid}" /NH`, { encoding: "utf-8" });
			return result.includes("cloudflared") && result.includes(String(pid));
		}
		
		// On Unix systems, use ps to verify it's the cloudflared process
		const result = execSync(`ps -p ${pid} -o comm=`, { encoding: "utf-8" });
		const processName = result.trim();
		return processName.includes("cloudflared") || processName === "node";
	} catch {
		return false;
	}
}

export async function isTunnelRunning(tunnelId: string): Promise<boolean> {
	const pid = await getPid(tunnelId);
	if (!pid) return false;
	
	// Verify the process is actually cloudflared, not a reused PID from another process
	// This is critical for handling system restarts where PIDs can be reused on Unix systems
	if (!isCloudflaredProcessRunning(pid)) {
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
	
	// Use the same check as isTunnelRunning to ensure consistency
	if (!isCloudflaredProcessRunning(pid)) {
		await clearPid(tunnelId);
		return null;
	}
	return pid;
}
