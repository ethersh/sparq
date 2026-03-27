import chalk from "chalk";
import axios from "axios";
import { isAuthenticated, storeToken, getStoredToken } from "./store.js";
import { runOAuthFlow } from "./oauth.js";
import type { AuthToken } from "../config/schema.js";

interface CfUser {
	id: string;
	email: string;
}

interface CfAccount {
	id: string;
	name: string;
}

async function verifyAndEnrich(
	token: string,
): Promise<{ email: string; accountId: string; accountName: string }> {
	const headers = {
		Authorization: `Bearer ${token}`,
		"Content-Type": "application/json",
	};

	// Verify token and get user info
	const userRes = await axios.get(
		"https://api.cloudflare.com/client/v4/user",
		{ headers },
	);
	const user: CfUser = userRes.data.result;

	// Get first account
	const accountsRes = await axios.get(
		"https://api.cloudflare.com/client/v4/accounts",
		{ headers, params: { per_page: 1 } },
	);
	const account: CfAccount = accountsRes.data.result[0];

	return {
		email: user.email,
		accountId: account.id,
		accountName: account.name,
	};
}

export async function ensureAuth(): Promise<AuthToken> {
	const existing = await getStoredToken();
	if (existing?.api_token) {
		// Verify it still works
		try {
			const info = await verifyAndEnrich(existing.api_token);
			// Update stored info if needed
			if (
				!existing.email ||
				!existing.account_id ||
				existing.email !== info.email
			) {
				await storeToken(
					existing.api_token,
					info.email,
					info.accountId,
					info.accountName,
				);
			}
			return {
				api_token: existing.api_token,
				email: info.email,
				account_id: info.accountId,
				account_name: info.accountName,
			};
		} catch {
			console.log(chalk.yellow("  Stored token is invalid, re-authenticating..."));
		}
	}

	console.log();
	console.log(chalk.bold("  Authentication"));

	const token = await runOAuthFlow();

	try {
		const info = await verifyAndEnrich(token);
		await storeToken(token, info.email, info.accountId, info.accountName);
		console.log(chalk.green(`  Authenticated as ${info.email}`));
		return {
			api_token: token,
			email: info.email,
			account_id: info.accountId,
			account_name: info.accountName,
		};
	} catch (err: any) {
		throw new Error(`Failed to verify token: ${err.message}`);
	}
}
