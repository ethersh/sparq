import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { URL, URLSearchParams } from "node:url";
import open from "open";
import chalk from "chalk";
import axios from "axios";

const CF_AUTH_URL = "https://dash.cloudflare.com/oauth2/auth";
const CF_TOKEN_URL = "https://dash.cloudflare.com/oauth2/token";
const CF_CLIENT_ID = "54d11594-84e4-41aa-b438-e81b8fa78ee7";
const CALLBACK_PORT = 8976;
const OAUTH_CALLBACK_URL = `http://localhost:${CALLBACK_PORT}/oauth/callback`;

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

const PKCE_CHARSET =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

export interface OAuthTokens {
	access_token: string;
	refresh_token?: string;
	expires_in?: number;
}

function generatePKCE(): { verifier: string; challenge: string } {
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

export async function runOAuthFlow(): Promise<OAuthTokens> {
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
					res.end("Invalid callback");
					server.close();
					reject(new Error("Invalid OAuth callback"));
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
					res.end("Token exchange failed");
					server.close();
					reject(err);
				}
			},
		);

		server.on("error", (err: NodeJS.ErrnoException) => {
			if (err.code === "EADDRINUSE") {
				reject(
					new Error(`Port ${CALLBACK_PORT} is in use. Close any running wrangler login and try again.`),
				);
			} else {
				reject(err);
			}
		});

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
			console.log(chalk.dim("  Opening browser..."));
			console.log(chalk.dim(`  If it doesn't open: ${authUrl}\n`));
			open(authUrl).catch(() => {});
		});

		setTimeout(() => {
			server.close();
			reject(new Error("Login timed out after 2 minutes"));
		}, 120_000);
	});
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
