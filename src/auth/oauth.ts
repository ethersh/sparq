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

// Cloudflare OAuth2 endpoints — uses wrangler's public client
const CF_AUTH_URL = "https://dash.cloudflare.com/oauth2/auth";
const CF_TOKEN_URL = "https://dash.cloudflare.com/oauth2/token";
const CF_CLIENT_ID = "54d11594-84e4-41aa-b438-e81b8fa78ee7";
const CF_CALLBACK_PATH = "/oauth/callback";

// Direct API token creation URL
const CF_TOKEN_PAGE = "https://dash.cloudflare.com/profile/api-tokens";

interface OAuthTokens {
	access_token: string;
	refresh_token?: string;
	expires_in?: number;
	token_type: string;
}

function generatePKCE(): { verifier: string; challenge: string } {
	const verifier = randomBytes(32)
		.toString("base64url")
		.replace(/[^a-zA-Z0-9-._~]/g, "")
		.slice(0, 128);
	const challenge = createHash("sha256").update(verifier).digest("base64url");
	return { verifier, challenge };
}

async function runBrowserOAuth(): Promise<string> {
	const { verifier, challenge } = generatePKCE();
	const state = randomBytes(16).toString("hex");

	return new Promise<string>((resolve, reject) => {
		const server = createServer(
			async (req: IncomingMessage, res: ServerResponse) => {
				const url = new URL(req.url ?? "/", "http://localhost");

				if (url.pathname !== CF_CALLBACK_PATH) {
					res.writeHead(404);
					res.end("Not found");
					return;
				}

				const code = url.searchParams.get("code");
				const returnedState = url.searchParams.get("state");
				const error = url.searchParams.get("error");

				if (error) {
					res.writeHead(400);
					res.end(resultPage(false, error));
					server.close();
					reject(new Error(`OAuth error: ${error}`));
					return;
				}

				if (!code || returnedState !== state) {
					res.writeHead(400);
					res.end(resultPage(false, "Invalid callback"));
					server.close();
					reject(new Error("Invalid OAuth callback"));
					return;
				}

				try {
					const tokens = await exchangeCode(
						code,
						`http://localhost:${(server.address() as any).port}${CF_CALLBACK_PATH}`,
						verifier,
					);
					res.writeHead(200, { "Content-Type": "text/html" });
					res.end(resultPage(true));
					server.close();
					resolve(tokens.access_token);
				} catch (err) {
					res.writeHead(500);
					res.end(resultPage(false, "Token exchange failed"));
					server.close();
					reject(err);
				}
			},
		);

		server.listen(0, "127.0.0.1", () => {
			const port = (server.address() as any).port;
			const redirectUri = `http://localhost:${port}${CF_CALLBACK_PATH}`;

			const params = new URLSearchParams({
				response_type: "code",
				client_id: CF_CLIENT_ID,
				redirect_uri: redirectUri,
				scope: "account:read user:read workers:write zone:read dns:edit",
				state,
				code_challenge: challenge,
				code_challenge_method: "S256",
			});

			const authUrl = `${CF_AUTH_URL}?${params.toString()}`;
			console.log(
				chalk.dim("  Opening browser to sign in with Cloudflare..."),
			);
			console.log(chalk.dim(`  If it doesn't open, visit:`));
			console.log(chalk.dim(`  ${authUrl}`));
			console.log();
			open(authUrl).catch(() => {});
		});

		setTimeout(() => {
			server.close();
			reject(new Error("Login timed out after 5 minutes"));
		}, 5 * 60 * 1000);
	});
}

async function runApiTokenFlow(): Promise<string> {
	console.log();
	console.log(chalk.dim("  Opening Cloudflare dashboard to create an API token..."));
	console.log();
	console.log(chalk.dim("  Create a token with these permissions:"));
	console.log(chalk.dim(`    ${chalk.cyan("Account")} → Cloudflare Tunnel → Edit`));
	console.log(chalk.dim(`    ${chalk.cyan("Account")} → Account Settings → Read`));
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

	return token.trim();
}

export async function runOAuthFlow(): Promise<string> {
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
				description: "Paste a Cloudflare API token",
			},
		],
	});

	if (method === "oauth") {
		try {
			return await runBrowserOAuth();
		} catch (err: any) {
			console.log(
				chalk.yellow(
					`\n  Browser auth failed: ${err.message}`,
				),
			);
			console.log(chalk.yellow("  Falling back to API token...\n"));
			return runApiTokenFlow();
		}
	}

	return runApiTokenFlow();
}

async function exchangeCode(
	code: string,
	redirectUri: string,
	verifier: string,
): Promise<OAuthTokens> {
	const res = await axios.post<OAuthTokens>(
		CF_TOKEN_URL,
		new URLSearchParams({
			grant_type: "authorization_code",
			code,
			redirect_uri: redirectUri,
			client_id: CF_CLIENT_ID,
			code_verifier: verifier,
		}).toString(),
		{
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
		},
	);
	return res.data;
}

function resultPage(success: boolean, error?: string): string {
	const title = success ? "Authenticated" : "Authentication Failed";
	const color = success ? "#22c55e" : "#ef4444";
	const message = success
		? "You can close this tab and return to your terminal."
		: error ?? "Something went wrong.";

	return `<!DOCTYPE html>
<html>
<head><title>sparq</title></head>
<body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a0a0a;color:#fafafa">
<div style="text-align:center">
<h1 style="font-size:2rem;margin-bottom:0.5rem;color:${color}">${title}</h1>
<p style="color:#888">${message}</p>
</div>
</body>
</html>`;
}
