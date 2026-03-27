import { join } from "node:path";
import { homedir } from "node:os";
import { readFile, writeFile, mkdir, unlink, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import {
	ProjectConfigSchema,
	TunnelCredentialsSchema,
	type ProjectConfig,
	type TunnelCredentials,
} from "./schema.js";

// Project-local directory — only non-sensitive config (routes, tunnel name)
function sparqDir(cwd?: string): string {
	return join(cwd ?? process.cwd(), ".sparq");
}

function configPath(cwd?: string): string {
	return join(sparqDir(cwd), "config.json");
}

// Sensitive/runtime files live in ~/.sparq/tunnels/<tunnel_id>/
function tunnelDataDir(tunnelId: string): string {
	return join(homedir(), ".sparq", "tunnels", tunnelId);
}

async function ensureTunnelDataDir(tunnelId: string): Promise<void> {
	const dir = tunnelDataDir(tunnelId);
	if (!existsSync(dir)) {
		await mkdir(dir, { recursive: true });
	}
}

function credentialsPath(tunnelId: string): string {
	return join(tunnelDataDir(tunnelId), "credentials.json");
}

function cloudflaredConfigPath(tunnelId: string): string {
	return join(tunnelDataDir(tunnelId), "cloudflared.yml");
}

function pidPath(tunnelId: string): string {
	return join(tunnelDataDir(tunnelId), "pid");
}

function logPath(tunnelId: string): string {
	return join(tunnelDataDir(tunnelId), "tunnel.log");
}

// --- Project config (non-sensitive, lives in project .sparq/) ---

export function isConfigured(cwd?: string): boolean {
	return existsSync(configPath(cwd));
}

export async function ensureProjectDir(cwd?: string): Promise<void> {
	const dir = sparqDir(cwd);
	if (!existsSync(dir)) {
		await mkdir(dir, { recursive: true });
	}
}

export async function getProjectConfig(
	cwd?: string,
): Promise<ProjectConfig | null> {
	try {
		const raw = await readFile(configPath(cwd), "utf-8");
		return ProjectConfigSchema.parse(JSON.parse(raw));
	} catch {
		return null;
	}
}

export async function saveProjectConfig(
	config: ProjectConfig,
	cwd?: string,
): Promise<void> {
	await ensureProjectDir(cwd);
	await writeFile(configPath(cwd), JSON.stringify(config, null, "\t"), "utf-8");
}

// --- Credentials (sensitive, lives in ~/.sparq/tunnels/<id>/) ---

export async function getCredentials(
	tunnelId: string,
): Promise<TunnelCredentials | null> {
	try {
		const raw = await readFile(credentialsPath(tunnelId), "utf-8");
		return TunnelCredentialsSchema.parse(JSON.parse(raw));
	} catch {
		return null;
	}
}

export async function saveCredentials(
	creds: TunnelCredentials,
	tunnelId: string,
): Promise<void> {
	await ensureTunnelDataDir(tunnelId);
	await writeFile(
		credentialsPath(tunnelId),
		JSON.stringify(creds, null, "\t"),
		"utf-8",
	);
}

// --- PID (runtime, lives in ~/.sparq/tunnels/<id>/) ---

export async function savePid(pid: number, tunnelId: string): Promise<void> {
	await ensureTunnelDataDir(tunnelId);
	await writeFile(pidPath(tunnelId), String(pid), "utf-8");
}

export async function getPid(tunnelId: string): Promise<number | null> {
	try {
		const raw = await readFile(pidPath(tunnelId), "utf-8");
		return parseInt(raw.trim(), 10);
	} catch {
		return null;
	}
}

export async function clearPid(tunnelId: string): Promise<void> {
	try {
		await unlink(pidPath(tunnelId));
	} catch {
		// already gone
	}
}

// --- Path getters ---

export function getCloudflaredConfigPath(tunnelId: string): string {
	return cloudflaredConfigPath(tunnelId);
}

export function getCredentialsPath(tunnelId: string): string {
	return credentialsPath(tunnelId);
}

export function getLogPath(tunnelId: string): string {
	return logPath(tunnelId);
}

export function getProjectSparqDir(cwd?: string): string {
	return sparqDir(cwd);
}

// --- Cleanup ---

export async function removeProjectConfig(cwd?: string): Promise<void> {
	const dir = sparqDir(cwd);
	if (existsSync(dir)) {
		await rm(dir, { recursive: true, force: true });
	}
}

export async function removeTunnelData(tunnelId: string): Promise<void> {
	const dir = tunnelDataDir(tunnelId);
	if (existsSync(dir)) {
		await rm(dir, { recursive: true, force: true });
	}
}
