import { getAuth, saveAuth, clearAuth } from "../config/global.js";
import type { AuthToken } from "../config/schema.js";

export async function storeToken(opts: {
	apiToken: string;
	email?: string;
	accountId?: string;
	accountName?: string;
}): Promise<void> {
	await saveAuth({
		api_token: opts.apiToken,
		email: opts.email,
		account_id: opts.accountId,
		account_name: opts.accountName,
	});
}

export async function getStoredToken(): Promise<AuthToken | null> {
	return getAuth();
}

export async function logout(): Promise<void> {
	await clearAuth();
}

export { clearAuth };
