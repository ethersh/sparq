import { getAuth, saveAuth, clearAuth } from "../config/global.js";
import type { AuthToken } from "../config/schema.js";

export async function isAuthenticated(): Promise<boolean> {
	const auth = await getAuth();
	return auth !== null;
}

export async function storeToken(opts: {
	apiToken: string;
	refreshToken?: string;
	expiresIn?: number;
	scopes?: string;
	email?: string;
	accountId?: string;
	accountName?: string;
}): Promise<void> {
	const expirationTime = opts.expiresIn
		? new Date(Date.now() + opts.expiresIn * 1000).toISOString()
		: undefined;

	await saveAuth({
		api_token: opts.apiToken,
		refresh_token: opts.refreshToken,
		expiration_time: expirationTime,
		scopes: opts.scopes,
		email: opts.email,
		account_id: opts.accountId,
		account_name: opts.accountName,
	});
}

export async function getStoredToken(): Promise<AuthToken | null> {
	return getAuth();
}

export function isTokenExpired(token: AuthToken): boolean {
	if (!token.expiration_time) return false;
	return new Date(token.expiration_time).getTime() < Date.now();
}

export async function logout(): Promise<void> {
	await clearAuth();
}

export { clearAuth };
