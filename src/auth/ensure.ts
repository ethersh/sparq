import chalk from "chalk";
import axios from "axios";
import { input } from "@inquirer/prompts";
import open from "open";
import yoctoSpinner from "yocto-spinner";
import { storeToken, getStoredToken } from "./store.js";
import { certExists, readCert } from "./cert.js";
import { ensureCloudflared } from "../deps/ensure.js";
import type { AuthToken } from "../config/schema.js";

const CF_API = "https://api.cloudflare.com/client/v4";
const CF_TOKEN_PAGE = "https://dash.cloudflare.com/profile/api-tokens";

/**
 * Verify a token by trying to list zones and tunnels.
 * We don't use /user because cert.pem tokens lack that scope.
 * Instead we verify against the endpoints we actually need.
 */
async function verifyToken(token: string): Promise<{
	email?: string;
	accountId: string;
	accountName?: string;
}> {
	const headers = { Authorization: `Bearer ${token}` };

	// Try /user for email (optional — cert.pem tokens will 403 here)
	let email: string | undefined;
	try {
		const userRes = await axios.get(`${CF_API}/user`, { headers });
		email = userRes.data.result?.email;
	} catch {
		// cert.pem tokens don't have /user access — that's fine
	}

	// Try /accounts to get account info
	let accountId: string | undefined;
	let accountName: string | undefined;
	try {
		const accRes = await axios.get(`${CF_API}/accounts`, {
			headers,
			params: { per_page: 1 },
		});
		const accounts = accRes.data.result;
		if (accounts?.length > 0) {
			accountId = accounts[0].id;
			accountName = accounts[0].name;
		}
	} catch {
		// cert.pem tokens might not have /accounts access either
	}

	// Try /zones — most tokens can at least do this
	if (!accountId) {
		try {
			const zonesRes = await axios.get(`${CF_API}/zones`, {
				headers,
				params: { per_page: 1, status: "active" },
			});
			const zones = zonesRes.data.result;
			if (zones?.length > 0) {
				accountId = zones[0].account?.id;
				accountName = zones[0].account?.name;
			}
		} catch {
			// Can't even list zones
		}
	}

	if (!accountId) {
		throw new Error("Token cannot access any Cloudflare resources.");
	}

	// Verify tunnel access — this is what we actually need
	try {
		await axios.get(`${CF_API}/accounts/${accountId}/cfd_tunnel`, {
			headers,
			params: { per_page: 1, is_deleted: false },
		});
	} catch {
		throw new Error(
			"Token cannot manage tunnels. Ensure it has 'Cloudflare Tunnel: Edit' permission.",
		);
	}

	return { email, accountId, accountName };
}

async function promptForApiToken(): Promise<string> {
	console.log(
		chalk.dim("  Opening Cloudflare dashboard to create an API token...\n"),
	);
	console.log(chalk.dim("  Create a Custom Token with these permissions:\n"));
	console.log(
		`    ${chalk.cyan("Account")} ${chalk.dim("→")} Cloudflare Tunnel ${chalk.dim("→")} Edit`,
	);
	console.log(
		`    ${chalk.cyan("Zone")}    ${chalk.dim("→")} Zone ${chalk.dim("→")} Read`,
	);
	console.log(
		`    ${chalk.cyan("Zone")}    ${chalk.dim("→")} DNS ${chalk.dim("→")} Edit`,
	);
	console.log();

	await open(CF_TOKEN_PAGE).catch(() => {
		console.log(chalk.dim(`  Open manually: ${CF_TOKEN_PAGE}\n`));
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
	// 1. Check stored token
	const existing = await getStoredToken();
	if (existing?.api_token) {
		try {
			const info = await verifyToken(existing.api_token);
			return {
				api_token: existing.api_token,
				email: info.email ?? existing.email,
				account_id: info.accountId,
				account_name: info.accountName ?? existing.account_name,
			};
		} catch {
			console.log(
				chalk.yellow("  Stored token is invalid, re-authenticating...\n"),
			);
		}
	}

	// 2. Try cert.pem from cloudflared
	if (certExists()) {
		const spinner = yoctoSpinner({ text: "Checking cloudflared credentials..." }).start();
		try {
			const cert = await readCert();
			const info = await verifyToken(cert.apiToken);
			await storeToken({
				apiToken: cert.apiToken,
				email: info.email,
				accountId: info.accountId,
				accountName: info.accountName,
			});
			spinner.success(
				`Authenticated${info.email ? ` as ${info.email}` : ""} via cloudflared`,
			);
			return {
				api_token: cert.apiToken,
				email: info.email,
				account_id: info.accountId,
				account_name: info.accountName,
			};
		} catch {
			spinner.warning(
				"cloudflared cert.pem lacks full permissions, need an API token",
			);
		}
	}

	// 3. Prompt for API token
	const apiToken = await promptForApiToken();

	const spinner = yoctoSpinner({ text: "Verifying token..." }).start();
	try {
		const info = await verifyToken(apiToken);
		await storeToken({
			apiToken,
			email: info.email,
			accountId: info.accountId,
			accountName: info.accountName,
		});
		spinner.success(
			`Authenticated${info.email ? ` as ${info.email}` : ""}`,
		);
		return {
			api_token: apiToken,
			email: info.email,
			account_id: info.accountId,
			account_name: info.accountName,
		};
	} catch (err: any) {
		spinner.error("Token verification failed");
		throw new Error(err.message);
	}
}
