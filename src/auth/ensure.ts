import { execSync } from "node:child_process";
import chalk from "chalk";
import axios from "axios";
import yoctoSpinner from "yocto-spinner";
import { storeToken, getStoredToken } from "./store.js";
import { certExists, readCert, getCertPath } from "./cert.js";
import { ensureCloudflared } from "../deps/ensure.js";
import type { AuthToken } from "../config/schema.js";

const CF_API = "https://api.cloudflare.com/client/v4";

interface CfUser {
	id: string;
	email: string;
}

interface CfAccount {
	id: string;
	name: string;
}

async function fetchUserInfo(
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
		throw new Error("No Cloudflare accounts found.");
	}

	return {
		email: user.email,
		accountId: accounts[0].id,
		accountName: accounts[0].name,
	};
}

function runCloudflaredLogin(): void {
	console.log(
		chalk.dim("  Opening browser to authenticate with Cloudflare..."),
	);
	console.log(chalk.dim("  Pick any zone — the token works account-wide.\n"));

	try {
		execSync("cloudflared tunnel login", {
			stdio: "inherit",
			timeout: 300_000, // 5 min
		});
	} catch {
		throw new Error(
			"cloudflared login failed. Run `cloudflared tunnel login` manually.",
		);
	}
}

export async function ensureAuth(): Promise<AuthToken> {
	// 1. Check if we already have a working stored token
	const existing = await getStoredToken();
	if (existing?.api_token) {
		try {
			const info = await fetchUserInfo(existing.api_token);
			// Update stored info if changed
			if (!existing.email || existing.email !== info.email) {
				await storeToken({
					apiToken: existing.api_token,
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
			console.log(
				chalk.yellow("  Stored token expired, re-authenticating..."),
			);
		}
	}

	// 2. Check if cert.pem already exists from a previous cloudflared login
	if (certExists()) {
		try {
			const cert = await readCert();
			const info = await fetchUserInfo(cert.apiToken);
			await storeToken({
				apiToken: cert.apiToken,
				email: info.email,
				accountId: info.accountId,
				accountName: info.accountName,
			});
			console.log(chalk.green(`  ✓ Authenticated as ${info.email}`));
			return {
				api_token: cert.apiToken,
				email: info.email,
				account_id: info.accountId,
				account_name: info.accountName,
			};
		} catch {
			console.log(chalk.yellow("  Existing cert.pem is invalid, re-authenticating..."));
		}
	}

	// 3. Need to login — run cloudflared tunnel login
	await ensureCloudflared();
	runCloudflaredLogin();

	// 4. Parse the newly created cert.pem
	if (!certExists()) {
		throw new Error(
			`Login completed but cert.pem not found at ${getCertPath()}`,
		);
	}

	const cert = await readCert();
	const spinner = yoctoSpinner({ text: "Verifying..." }).start();

	try {
		const info = await fetchUserInfo(cert.apiToken);
		await storeToken({
			apiToken: cert.apiToken,
			email: info.email,
			accountId: info.accountId,
			accountName: info.accountName,
		});
		spinner.success(`Authenticated as ${info.email}`);
		return {
			api_token: cert.apiToken,
			email: info.email,
			account_id: info.accountId,
			account_name: info.accountName,
		};
	} catch (err: any) {
		spinner.error("Verification failed");
		throw new Error(`Token from cert.pem failed: ${err.message}`);
	}
}
