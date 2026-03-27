import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import chalk from "chalk";
import {
	savePid,
	getPid,
	clearPid,
	getCloudflaredConfigPath,
	getLogPath,
} from "../config/project.js";

export function isProcessRunning(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

export async function isTunnelRunning(cwd?: string): Promise<boolean> {
	const pid = await getPid(cwd);
	if (!pid) return false;
	if (!isProcessRunning(pid)) {
		await clearPid(cwd);
		return false;
	}
	return true;
}

export async function startTunnel(cwd?: string): Promise<number> {
	const configPath = getCloudflaredConfigPath(cwd);
	const logFile = getLogPath(cwd);

	// Open log file for writing
	const logFd = openSync(logFile, "a");

	const child = spawn("cloudflared", ["tunnel", "--config", configPath, "run"], {
		detached: true,
		stdio: ["ignore", logFd, logFd],
		cwd: cwd ?? process.cwd(),
	});

	child.unref();

	if (!child.pid) {
		throw new Error("Failed to start cloudflared process");
	}

	await savePid(child.pid, cwd);
	return child.pid;
}

export async function stopTunnel(cwd?: string): Promise<boolean> {
	const pid = await getPid(cwd);
	if (!pid) return false;

	if (!isProcessRunning(pid)) {
		await clearPid(cwd);
		return false;
	}

	try {
		process.kill(pid, "SIGTERM");
		// Give it a moment to shut down gracefully
		await new Promise((resolve) => setTimeout(resolve, 1000));
		if (isProcessRunning(pid)) {
			process.kill(pid, "SIGKILL");
		}
	} catch {
		// Process already gone
	}

	await clearPid(cwd);
	return true;
}

export async function getTunnelPid(cwd?: string): Promise<number | null> {
	const pid = await getPid(cwd);
	if (!pid) return null;
	if (!isProcessRunning(pid)) {
		await clearPid(cwd);
		return null;
	}
	return pid;
}
