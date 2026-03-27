import { join } from "node:path";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import {
	ProjectConfigSchema,
	TunnelCredentialsSchema,
	type ProjectConfig,
	type TunnelCredentials,
} from "./schema.js";

function sparqDir(cwd?: string): string {
	return join(cwd ?? process.cwd(), ".sparq");
}

function configPath(cwd?: string): string {
	return join(sparqDir(cwd), "config.json");
}

function credentialsPath(cwd?: string): string {
	return join(sparqDir(cwd), "credentials.json");
}

function cloudflaredConfigPath(cwd?: string): string {
	return join(sparqDir(cwd), "cloudflared.yml");
}

function pidPath(cwd?: string): string {
	return join(sparqDir(cwd), "pid");
}

function logPath(cwd?: string): string {
	return join(sparqDir(cwd), "tunnel.log");
}

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

export async function getCredentials(
	cwd?: string,
): Promise<TunnelCredentials | null> {
	try {
		const raw = await readFile(credentialsPath(cwd), "utf-8");
		return TunnelCredentialsSchema.parse(JSON.parse(raw));
	} catch {
		return null;
	}
}

export async function saveCredentials(
	creds: TunnelCredentials,
	cwd?: string,
): Promise<void> {
	await ensureProjectDir(cwd);
	await writeFile(
		credentialsPath(cwd),
		JSON.stringify(creds, null, "\t"),
		"utf-8",
	);
}

export async function savePid(pid: number, cwd?: string): Promise<void> {
	await ensureProjectDir(cwd);
	await writeFile(pidPath(cwd), String(pid), "utf-8");
}

export async function getPid(cwd?: string): Promise<number | null> {
	try {
		const raw = await readFile(pidPath(cwd), "utf-8");
		return parseInt(raw.trim(), 10);
	} catch {
		return null;
	}
}

export async function clearPid(cwd?: string): Promise<void> {
	try {
		await unlink(pidPath(cwd));
	} catch {
		// already gone
	}
}

export function getCloudflaredConfigPath(cwd?: string): string {
	return cloudflaredConfigPath(cwd);
}

export function getCredentialsPath(cwd?: string): string {
	return credentialsPath(cwd);
}

export function getLogPath(cwd?: string): string {
	return logPath(cwd);
}

export function getProjectSparqDir(cwd?: string): string {
	return sparqDir(cwd);
}
