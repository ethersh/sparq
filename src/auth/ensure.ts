import chalk from "chalk";
import axios from "axios";
import { input } from "@inquirer/prompts";
import open from "open";
import { storeToken, getStoredToken, isTokenExpired } from "./store.js";
import { runOAuthFlow, refreshAccessToken } from "./oauth.js";
import type { AuthToken } from "../config/schema.js";

const CF_API = "https://api.cloudflare.com/client/v4";
const CF_TOKEN_PAGE = "https://dash.cloudflare.com/profile/api-tokens";

interface CfUser {
	id: string;
	email: string;
}

interface CfAccount {
	id: string;
	name: string;
}

async function verifyToken(
	token: string,
): Promise<{ email: string; accountId: string; accountName: string }> {
	const headers = { Authorization: `Bearer ${token}` };

	const userRes = await axios.get(`${CF_API}/user`, { headers });
	const user: CfUser = userRes.data.result;

	const accountsRes = await axios.get(`${CF_API}/accounts`, {
		headers,
		params: { per_page: 1 },
	});
	const accounts: CfAccount[] = accountsRes.data.result;
	if (!accounts || accounts.length === 0) {
		throw new Error(
			"No Cloudflare accounts found. Ensure your token has Account permissions.",
		);
	}
	const account = accounts[0];

	return {
		email: user.email,
		accountId: account.id,
		accountName: account.name,
	};
}

async function canManageTunnels(
	token: string,
	accountId: string,
): Promise<boolean> {
	try {
		const headers = { Authorization: `Bearer ${token}` };
		await axios.get(`${CF_API}/accounts/${accountId}/cfd_tunnel`, {
			headers,
			params: { per_page: 1, is_deleted: false },
		});
		return true;
	} catch {
		return false;
	}
}

async function promptForApiToken(
	email: string,
): Promise<string> {
	console.log();
	console.log(
		chalk.yellow(
			"  The browser login doesn't include tunnel & DNS permissions.",
		),
	);
	console.log(
		chalk.yellow("  You need an API token for that.\n"),
	);
	console.log(chalk.dim("  Opening Cloudflare dashboard...\n"));
	console.log(chalk.dim("  Create a Custom Token with these permissions:"));
	console.log(
		`    ${chalk.cyan("Account")} ${chalk.dim("→")} Cloudflare Tunnel ${chalk.dim("→")} Edit`,
	);
	console.log(
		`    ${chalk.cyan("Account")} ${chalk.dim("→")} Account Settings ${chalk.dim("→")} Read`,
	);
	console.log(
		`    ${chalk.cyan("Zone")}    ${chalk.dim("→")} Zone ${chalk.dim("→")} Read`,
	);
	console.log(
		`    ${chalk.cyan("Zone")}    ${chalk.dim("→")} DNS ${chalk.dim("→")} Edit`,
	);
	console.log();

	await open(CF_TOKEN_PAGE).catch(() => {
		console.log(chalk.dim(`  Open manually: ${CF_TOKEN_PAGE}`));
	});

	const token = await input({
		message: "Paste your API token",
		validate: (val) => {
			if (!val.trim()) return "Token is required";
			return true;
		},
	});

	return token.trim();
}

export async function ensureAuth(): Promise<AuthToken> {
	const existing = await getStoredToken();

	if (existing?.api_token) {
		// Try refresh if expired and we have a refresh token
		if (isTokenExpired(existing) && existing.refresh_token) {
			try {
				const refreshed = await refreshAccessToken(existing.refresh_token);
				const info = await verifyToken(refreshed.access_token);
				await storeToken({
					apiToken: refreshed.access_token,
					refreshToken: refreshed.refresh_token ?? existing.refresh_token,
					expiresIn: refreshed.expires_in,
					scopes: refreshed.scope ?? existing.scopes,
					email: info.email,
					accountId: info.accountId,
					accountName: info.accountName,
				});
				return {
					api_token: refreshed.access_token,
					refresh_token: refreshed.refresh_token ?? existing.refresh_token,
					email: info.email,
					account_id: info.accountId,
					account_name: info.accountName,
				};
			} catch {
				console.log(
					chalk.yellow("  Token refresh failed, re-authenticating..."),
				);
			}
		} else {
			// Verify the token still works
			try {
				const info = await verifyToken(existing.api_token);
				if (
					!existing.email ||
					!existing.account_id ||
					existing.email !== info.email
				) {
					await storeToken({
						apiToken: existing.api_token,
						refreshToken: existing.refresh_token,
						scopes: existing.scopes,
						email: info.email,
						accountId: info.accountId,
						accountName: info.accountName,
					});
				}
				return {
					api_token: existing.api_token,
					refresh_token: existing.refresh_token,
					email: info.email,
					account_id: info.accountId,
					account_name: info.accountName,
				};
			} catch {
				console.log(
					chalk.yellow("  Stored token is invalid, re-authenticating..."),
				);
			}
		}
	}

	console.log();
	console.log(chalk.bold("  Authentication"));

	const tokens = await runOAuthFlow();
	let accessToken = tokens.access_token;
	let refreshToken = tokens.refresh_token;

	// Verify the token
	let info;
	try {
		info = await verifyToken(accessToken);
		console.log(chalk.green(`  ✓ Signed in as ${info.email}`));
	} catch (err: any) {
		throw new Error(`Failed to verify token: ${err.message}`);
	}

	// Check if this token can actually manage tunnels
	const hasTunnelPerms = await canManageTunnels(accessToken, info.accountId);

	if (!hasTunnelPerms) {
		// OAuth token lacks tunnel permissions — get an API token
		const apiToken = await promptForApiToken(info.email);

		// Verify the API token
		try {
			const apiInfo = await verifyToken(apiToken);
			const canTunnel = await canManageTunnels(apiToken, apiInfo.accountId);
			if (!canTunnel) {
				throw new Error(
					"API token doesn't have Cloudflare Tunnel permissions. Check your token scopes.",
				);
			}
			info = apiInfo;
			accessToken = apiToken;
			refreshToken = undefined;
		} catch (err: any) {
			throw new Error(`API token verification failed: ${err.message}`);
		}

		console.log(chalk.green(`  ✓ API token verified`));
	}

	await storeToken({
		apiToken: accessToken,
		refreshToken,
		expiresIn: tokens.expires_in,
		scopes: tokens.scope,
		email: info.email,
		accountId: info.accountId,
		accountName: info.accountName,
	});

	return {
		api_token: accessToken,
		refresh_token: refreshToken,
		email: info.email,
		account_id: info.accountId,
		account_name: info.accountName,
	};
}
