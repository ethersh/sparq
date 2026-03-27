import { homedir } from "node:os";
import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import {
	AuthTokenSchema,
	TunnelRegistrySchema,
	type AuthToken,
	type TunnelRegistry,
	type TunnelRegistryEntry,
} from "./schema.js";

const SPARQ_DIR = join(homedir(), ".sparq");
const AUTH_FILE = join(SPARQ_DIR, "auth.json");
const REGISTRY_FILE = join(SPARQ_DIR, "tunnels.json");

export async function ensureSparqDir(): Promise<void> {
	if (!existsSync(SPARQ_DIR)) {
		await mkdir(SPARQ_DIR, { recursive: true });
	}
}

export async function getAuth(): Promise<AuthToken | null> {
	try {
		const raw = await readFile(AUTH_FILE, "utf-8");
		return AuthTokenSchema.parse(JSON.parse(raw));
	} catch {
		return null;
	}
}

export async function saveAuth(token: AuthToken): Promise<void> {
	await ensureSparqDir();
	await writeFile(AUTH_FILE, JSON.stringify(token, null, "\t"), "utf-8");
}

export async function clearAuth(): Promise<void> {
	try {
		const { unlink } = await import("node:fs/promises");
		await unlink(AUTH_FILE);
	} catch {
		// already gone
	}
}

export async function getRegistry(): Promise<TunnelRegistry> {
	try {
		const raw = await readFile(REGISTRY_FILE, "utf-8");
		return TunnelRegistrySchema.parse(JSON.parse(raw));
	} catch {
		return { tunnels: [] };
	}
}

export async function saveRegistry(registry: TunnelRegistry): Promise<void> {
	await ensureSparqDir();
	await writeFile(REGISTRY_FILE, JSON.stringify(registry, null, "\t"), "utf-8");
}

export async function registerTunnel(
	entry: TunnelRegistryEntry,
): Promise<void> {
	const registry = await getRegistry();
	const idx = registry.tunnels.findIndex((t) => t.path === entry.path);
	if (idx >= 0) {
		registry.tunnels[idx] = entry;
	} else {
		registry.tunnels.push(entry);
	}
	await saveRegistry(registry);
}

export async function unregisterTunnel(path: string): Promise<void> {
	const registry = await getRegistry();
	registry.tunnels = registry.tunnels.filter((t) => t.path !== path);
	await saveRegistry(registry);
}

export function getSparqDir(): string {
	return SPARQ_DIR;
}
