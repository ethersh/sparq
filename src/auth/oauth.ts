import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { URL, URLSearchParams } from "node:url";
import open from "open";
import chalk from "chalk";
import axios from "axios";

// Cloudflare OAuth2 endpoints and public client
const CF_AUTH_URL = "https://dash.cloudflare.com/oauth2/auth";
const CF_TOKEN_URL = "https://dash.cloudflare.com/oauth2/token";
const CF_CLIENT_ID = "54d11594-84e4-41aa-b438-e81b8fa78ee7";
const CF_CALLBACK_PATH = "/oauth/callback";

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
	const challenge = createHash("sha256")
		.update(verifier)
		.digest("base64url");
	return { verifier, challenge };
}

export async function runOAuthFlow(): Promise<string> {
	const { verifier, challenge } = generatePKCE();
	const state = randomBytes(16).toString("hex");

	return new Promise<string>((resolve, reject) => {
		const server = createServer(
			async (req: IncomingMessage, res: ServerResponse) => {
				const url = new URL(req.url ?? "/", `http://localhost`);

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
					res.end(errorPage(error));
					server.close();
					reject(new Error(`OAuth error: ${error}`));
					return;
				}

				if (!code || returnedState !== state) {
					res.writeHead(400);
					res.end(errorPage("Invalid callback"));
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
					res.end(successPage());
					server.close();
					resolve(tokens.access_token);
				} catch (err) {
					res.writeHead(500);
					res.end(errorPage("Token exchange failed"));
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
				chalk.dim("  Opening browser to authenticate with Cloudflare..."),
			);
			console.log(chalk.dim(`  If it doesn't open, visit: ${authUrl}`));
			open(authUrl).catch(() => {
				// Failed to open browser, user can copy URL
			});
		});

		// Timeout after 5 minutes
		setTimeout(() => {
			server.close();
			reject(new Error("OAuth login timed out after 5 minutes"));
		}, 5 * 60 * 1000);
	});
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

function successPage(): string {
	return `<!DOCTYPE html>
<html>
<head><title>sparq</title></head>
<body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a0a0a;color:#fafafa">
<div style="text-align:center">
<h1 style="font-size:2rem;margin-bottom:0.5rem">Authenticated</h1>
<p style="color:#888">You can close this tab and return to your terminal.</p>
</div>
</body>
</html>`;
}

function errorPage(error: string): string {
	return `<!DOCTYPE html>
<html>
<head><title>sparq - Error</title></head>
<body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a0a0a;color:#fafafa">
<div style="text-align:center">
<h1 style="font-size:2rem;margin-bottom:0.5rem;color:#ef4444">Authentication Failed</h1>
<p style="color:#888">${error}</p>
</div>
</body>
</html>`;
}
