import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CLOUDFLARED_DIR = join(homedir(), ".cloudflared");
const CERT_PATH = join(CLOUDFLARED_DIR, "cert.pem");

export interface OriginCert {
	zoneID: string;
	accountID: string;
	apiToken: string;
	endpoint?: string;
}

/**
 * Parse a cloudflared cert.pem file and extract the ARGO TUNNEL TOKEN block.
 * The cert.pem contains PEM blocks; we only care about the one labeled
 * "ARGO TUNNEL TOKEN" which is base64-encoded JSON with apiToken, accountID, zoneID.
 */
export function parseCertPem(pemContent: string): OriginCert {
	const beginMarker = "-----BEGIN ARGO TUNNEL TOKEN-----";
	const endMarker = "-----END ARGO TUNNEL TOKEN-----";

	const beginIdx = pemContent.indexOf(beginMarker);
	const endIdx = pemContent.indexOf(endMarker);

	if (beginIdx < 0 || endIdx < 0) {
		throw new Error(
			"Invalid cert.pem — missing ARGO TUNNEL TOKEN block",
		);
	}

	const base64Body = pemContent
		.slice(beginIdx + beginMarker.length, endIdx)
		.replace(/\s/g, "");

	const json = Buffer.from(base64Body, "base64").toString("utf-8");
	const parsed = JSON.parse(json);

	if (!parsed.apiToken || !parsed.accountID) {
		throw new Error("Invalid cert.pem — missing apiToken or accountID");
	}

	return {
		zoneID: parsed.zoneID ?? "",
		accountID: parsed.accountID,
		apiToken: parsed.apiToken,
		endpoint: parsed.endpoint,
	};
}

export function getCertPath(): string {
	return CERT_PATH;
}

export function certExists(): boolean {
	return existsSync(CERT_PATH);
}

export async function readCert(): Promise<OriginCert> {
	const content = await readFile(CERT_PATH, "utf-8");
	return parseCertPem(content);
}
