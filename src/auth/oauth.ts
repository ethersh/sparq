import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { URL, URLSearchParams } from "node:url";
import { input, select } from "@inquirer/prompts";
import open from "open";
import chalk from "chalk";
import axios from "axios";

// Cloudflare OAuth2 — matches wrangler's registered client exactly
const CF_AUTH_URL = "https://dash.cloudflare.com/oauth2/auth";
const CF_TOKEN_URL = "https://dash.cloudflare.com/oauth2/token";
const CF_CLIENT_ID = "54d11594-84e4-41aa-b438-e81b8fa78ee7";

// CRITICAL: This exact redirect_uri is pre-registered with Cloudflare
// for this client_id. Any deviation causes "redirect_uri does not match".
const CALLBACK_PORT = 8976;
const OAUTH_CALLBACK_URL = `http://localhost:${CALLBACK_PORT}/oauth/callback`;

// Scopes matching wrangler + offline_access for refresh tokens
const SCOPES = [
	"account:read",
	"user:read",
	"workers:write",
	"workers_kv:write",
	"workers_routes:write",
	"workers_scripts:write",
	"workers_tail:read",
	"d1:write",
	"pages:write",
	"zone:read",
	"ssl_certs:write",
	"ai:write",
	"queues:write",
	"offline_access",
].join(" ");

// Direct API token creation URL
const CF_TOKEN_PAGE = "https://dash.cloudflare.com/profile/api-tokens";

const PKCE_CHARSET =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

interface OAuthTokens {
	access_token: string;
	refresh_token?: string;
	expires_in?: number;
	token_type: string;
	scope?: string;
}

function generatePKCE(): { verifier: string; challenge: string } {
	// Match wrangler's PKCE implementation exactly:
	// 96 random values mapped to PKCE_CHARSET, then base64url encoded
	const randomValues = new Uint32Array(96);
	crypto.getRandomValues(randomValues);
	const chars = Array.from(randomValues)
		.map((v) => PKCE_CHARSET[v % PKCE_CHARSET.length])
		.join("");
	const verifier = Buffer.from(chars).toString("base64url");
	const challenge = createHash("sha256").update(verifier).digest("base64url");
	return { verifier, challenge };
}

function generateState(): string {
	const randomValues = new Uint32Array(32);
	crypto.getRandomValues(randomValues);
	return Array.from(randomValues)
		.map((v) => PKCE_CHARSET[v % PKCE_CHARSET.length])
		.join("");
}

async function runBrowserOAuth(): Promise<OAuthTokens> {
	const { verifier, challenge } = generatePKCE();
	const state = generateState();

	return new Promise<OAuthTokens>((resolve, reject) => {
		const server = createServer(
			async (req: IncomingMessage, res: ServerResponse) => {
				const url = new URL(req.url ?? "/", "http://localhost");

				if (url.pathname !== "/oauth/callback") {
					res.writeHead(404);
					res.end("Not found");
					return;
				}

				const code = url.searchParams.get("code");
				const returnedState = url.searchParams.get("state");
				const error = url.searchParams.get("error");

				if (error) {
					res.writeHead(302, {
						Location:
							"https://welcome.developers.workers.dev/wrangler-oauth-consent-denied",
					});
					res.end();
					server.close();
					reject(new Error(`Authorization denied: ${error}`));
					return;
				}

				if (!code || returnedState !== state) {
					res.writeHead(400);
					res.end(resultPage(false, "Invalid callback — state mismatch"));
					server.close();
					reject(new Error("Invalid OAuth callback — state mismatch"));
					return;
				}

				try {
					const tokens = await exchangeCode(code, verifier);
					res.writeHead(302, {
						Location:
							"https://welcome.developers.workers.dev/wrangler-oauth-consent-granted",
					});
					res.end();
					server.close();
					resolve(tokens);
				} catch (err) {
					res.writeHead(500);
					res.end(resultPage(false, "Token exchange failed"));
					server.close();
					reject(err);
				}
			},
		);

		server.on("error", (err: NodeJS.ErrnoException) => {
			if (err.code === "EADDRINUSE") {
				reject(
					new Error(
						`Port ${CALLBACK_PORT} is in use. Close any running wrangler login and try again.`,
					),
				);
			} else {
				reject(err);
			}
		});

		// Must listen on localhost:8976 — this is the pre-registered redirect URI
		server.listen(CALLBACK_PORT, "localhost", () => {
			const params = new URLSearchParams({
				response_type: "code",
				client_id: CF_CLIENT_ID,
				redirect_uri: OAUTH_CALLBACK_URL,
				scope: SCOPES,
				state,
				code_challenge: challenge,
				code_challenge_method: "S256",
			});

			const authUrl = `${CF_AUTH_URL}?${params.toString()}`;
			console.log(
				chalk.dim("  Opening browser to sign in with Cloudflare..."),
			);
			console.log(
				chalk.dim("  If it doesn't open, visit:"),
			);
			console.log(chalk.dim(`  ${authUrl}`));
			console.log();
			open(authUrl).catch(() => {});
		});

		// 120-second timeout (same as wrangler)
		setTimeout(() => {
			server.close();
			reject(new Error("Login timed out after 2 minutes"));
		}, 120_000);
	});
}

async function runApiTokenFlow(): Promise<OAuthTokens> {
	console.log();
	console.log(
		chalk.dim("  Opening Cloudflare dashboard to create an API token..."),
	);
	console.log();
	console.log(chalk.dim("  Create a token with these permissions:"));
	console.log(
		chalk.dim(`    ${chalk.cyan("Account")} → Cloudflare Tunnel → Edit`),
	);
	console.log(
		chalk.dim(`    ${chalk.cyan("Account")} → Account Settings → Read`),
	);
	console.log(chalk.dim(`    ${chalk.cyan("Zone")}    → Zone → Read`));
	console.log(chalk.dim(`    ${chalk.cyan("Zone")}    → DNS → Edit`));
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

	return { access_token: token.trim(), token_type: "bearer" };
}

export async function runOAuthFlow(): Promise<OAuthTokens> {
	const method = await select({
		message: "How would you like to authenticate?",
		choices: [
			{
				name: "Browser sign-in (recommended)",
				value: "oauth" as const,
				description: "Opens Cloudflare in your browser",
			},
			{
				name: "API token",
				value: "token" as const,
				description: "Paste a Cloudflare API token manually",
			},
		],
	});

	if (method === "oauth") {
		try {
			return await runBrowserOAuth();
		} catch (err: any) {
			console.log(
				chalk.yellow(`\n  Browser auth failed: ${err.message}`),
			);
			console.log(chalk.yellow("  Falling back to API token...\n"));
			return runApiTokenFlow();
		}
	}

	return runApiTokenFlow();
}

async function exchangeCode(
	code: string,
	verifier: string,
): Promise<OAuthTokens> {
	const res = await axios.post<OAuthTokens>(
		CF_TOKEN_URL,
		new URLSearchParams({
			grant_type: "authorization_code",
			code,
			redirect_uri: OAUTH_CALLBACK_URL,
			client_id: CF_CLIENT_ID,
			code_verifier: verifier,
		}).toString(),
		{
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
		},
	);
	return res.data;
}

export async function refreshAccessToken(
	refreshToken: string,
): Promise<OAuthTokens> {
	const res = await axios.post<OAuthTokens>(
		CF_TOKEN_URL,
		new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: refreshToken,
			client_id: CF_CLIENT_ID,
		}).toString(),
		{
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
		},
	);
	return res.data;
}

function resultPage(success: boolean, error?: string): string {
	const title = success ? "sparq — Authenticated" : "sparq — Error";
	const color = success ? "#22c55e" : "#ef4444";
	const icon = success ? "&#x26A1;" : "&#x2717;";
	const message = success
		? "You can close this tab and return to your terminal."
		: error ?? "Something went wrong.";

	return `<!DOCTYPE html>
<html>
<head><title>${title}</title></head>
<body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a0a0a;color:#fafafa">
<div style="text-align:center">
<p style="font-size:3rem;margin:0">${icon}</p>
<h1 style="font-size:1.5rem;margin:0.5rem 0;color:${color}">${success ? "Authenticated" : "Failed"}</h1>
<p style="color:#666;font-size:0.9rem">${message}</p>
</div>
</body>
</html>`;
}
