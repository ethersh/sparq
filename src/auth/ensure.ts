import { execSync } from "node:child_process";
import chalk from "../ui/color.js";
import yoctoSpinner from "../ui/spinner.js";
import { storeToken, getStoredToken } from "./store.js";
import { certExists, readCert, getCertPath, type OriginCert } from "./cert.js";
import { ensureCloudflared } from "../deps/ensure.js";
import { runOAuthFlow, refreshOAuthToken } from "./oauth.js";
import { resetClient } from "../cf/client.js";
import type { AuthToken } from "../config/schema.js";

const CF_API = "https://api.cloudflare.com/client/v4";

// ─── Env-based headless auth ───

function getEnvAuth(): AuthToken | null {
	const token = process.env.CLOUDFLARE_API_TOKEN ?? process.env.CF_API_TOKEN;
	const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? process.env.CF_ACCOUNT_ID;
	if (!token || !accountId) return null;
	return { api_token: token, account_id: accountId };
}

function getEnvCert(): OriginCert | null {
	const token = process.env.CLOUDFLARE_TUNNEL_TOKEN ?? process.env.CF_TUNNEL_TOKEN;
	const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? process.env.CF_ACCOUNT_ID;
	if (!token || !accountId) return null;
	return { zoneID: "", accountID: accountId, apiToken: token };
}

// ─── OAuth (zones + user info) ───

async function verifyOAuthToken(
	token: string,
): Promise<{ email: string; accountId: string; accountName: string }> {
	const headers = { Authorization: `Bearer ${token}` };

	const userRes = await fetch(`${CF_API}/user`, { headers });
	if (!userRes.ok) throw new Error(`Failed to verify token: ${userRes.status}`);
	const userData: any = await userRes.json();
	const email: string = userData.result.email;

	const accUrl = new URL(`${CF_API}/accounts`);
	accUrl.searchParams.set("per_page", "1");
	const accRes = await fetch(accUrl, { headers });
	if (!accRes.ok) throw new Error(`Failed to fetch accounts: ${accRes.status}`);
	const accData: any = await accRes.json();
	const accounts = accData.result;
	if (!accounts?.length) {
		throw new Error("No Cloudflare accounts found.");
	}

	return {
		email,
		accountId: accounts[0].id,
		accountName: accounts[0].name,
	};
}

export async function ensureAuth(): Promise<AuthToken> {
	// Env vars take priority — no browser needed
	const envAuth = getEnvAuth();
	if (envAuth) return envAuth;

	// Check stored OAuth token
	const existing = await getStoredToken();
	if (existing?.api_token) {
		try {
			const info = await verifyOAuthToken(existing.api_token);
			if (!existing.email || existing.email !== info.email) {
				await storeToken({
					apiToken: existing.api_token,
					refreshToken: existing.refresh_token,
					email: info.email,
					accountId: info.accountId,
					accountName: info.accountName,
				});
			}
			return {
				api_token: existing.api_token,
				email: info.email,
				account_id: info.accountId,
				account_name: info.accountName,
			};
		} catch {
			// Token expired — try refresh before falling back to full re-auth
			if (existing.refresh_token) {
				try {
					console.log(
						chalk.dim("  Refreshing token...\n"),
					);
					const tokens = await refreshOAuthToken(existing.refresh_token);
					const info = await verifyOAuthToken(tokens.access_token);
					await storeToken({
						apiToken: tokens.access_token,
						refreshToken: tokens.refresh_token ?? existing.refresh_token,
						expiresIn: tokens.expires_in,
						email: info.email,
						accountId: info.accountId,
						accountName: info.accountName,
					});
					resetClient();
					return {
						api_token: tokens.access_token,
						email: info.email,
						account_id: info.accountId,
						account_name: info.accountName,
					};
				} catch {
					console.log(
						chalk.yellow("  Refresh failed, re-authenticating...\n"),
					);
				}
			} else {
				console.log(
					chalk.yellow("  Stored token expired, re-authenticating...\n"),
				);
			}
		}
	}

	// Run OAuth login
	console.log(chalk.bold("\n  Sign in with Cloudflare\n"));

	const tokens = await runOAuthFlow();

	const spinner = yoctoSpinner({ text: "Verifying..." }).start();
	try {
		const info = await verifyOAuthToken(tokens.access_token);
		await storeToken({
			apiToken: tokens.access_token,
			refreshToken: tokens.refresh_token,
			expiresIn: tokens.expires_in,
			email: info.email,
			accountId: info.accountId,
			accountName: info.accountName,
		});
		resetClient();
		spinner.success(`Signed in as ${info.email}`);
		return {
			api_token: tokens.access_token,
			email: info.email,
			account_id: info.accountId,
			account_name: info.accountName,
		};
	} catch (err: any) {
		spinner.error("Verification failed");
		throw new Error(`OAuth token failed: ${err.message}`);
	}
}

// ─── cloudflared cert.pem (tunnels + DNS routing) ───

export async function ensureTunnelAuth(): Promise<OriginCert> {
	// Env vars take priority — no browser or cert.pem needed
	const envCert = getEnvCert();
	if (envCert) return envCert;

	// Check for existing cert.pem
	if (certExists()) {
		try {
			return await readCert();
		} catch {
			console.log(
				chalk.yellow("  Existing cert.pem is corrupt, re-authenticating...\n"),
			);
		}
	}

	// Need to run cloudflared tunnel login
	await ensureCloudflared();

	console.log(chalk.bold("\n  Authorize tunnel access\n"));
	console.log(
		chalk.dim("  Opening browser — pick any zone, the tunnel token is account-wide.\n"),
	);

	try {
		execSync("cloudflared tunnel login", {
			stdio: "inherit",
			timeout: 300_000,
		});
	} catch {
		throw new Error(
			"cloudflared login failed. Run `cloudflared tunnel login` manually.",
		);
	}

	if (!certExists()) {
		throw new Error(`cert.pem not found at ${getCertPath()}`);
	}

	return readCert();
}
