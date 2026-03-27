import { execSync } from "node:child_process";
import chalk from "chalk";
import axios from "axios";
import yoctoSpinner from "yocto-spinner";
import { storeToken, getStoredToken } from "./store.js";
import { certExists, readCert, getCertPath, type OriginCert } from "./cert.js";
import { ensureCloudflared } from "../deps/ensure.js";
import { runOAuthFlow, refreshOAuthToken } from "./oauth.js";
import { resetClient } from "../cf/client.js";
import type { AuthToken } from "../config/schema.js";

const CF_API = "https://api.cloudflare.com/client/v4";

/**
 * Auth has two parts:
 *
 * 1. OAuth (wrangler-style) — for user info + zone listing
 *    Stored in ~/.sparq/auth.json
 *
 * 2. cloudflared cert.pem — for tunnel creation + DNS routing
 *    Lives at ~/.cloudflared/cert.pem
 *
 * Both are browser-based, both are one-time.
 */

// ─── OAuth (zones + user info) ───

async function verifyOAuthToken(
	token: string,
): Promise<{ email: string; accountId: string; accountName: string }> {
	const headers = { Authorization: `Bearer ${token}` };

	const userRes = await axios.get(`${CF_API}/user`, { headers });
	const email: string = userRes.data.result.email;

	const accRes = await axios.get(`${CF_API}/accounts`, {
		headers,
		params: { per_page: 1 },
	});
	const accounts = accRes.data.result;
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
