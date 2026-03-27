import { getAuth, saveAuth, clearAuth } from "../config/global.js";
import type { AuthToken } from "../config/schema.js";

export async function isAuthenticated(): Promise<boolean> {
	const auth = await getAuth();
	return auth !== null;
}

export async function storeToken(
	apiToken: string,
	email?: string,
	accountId?: string,
	accountName?: string,
): Promise<void> {
	await saveAuth({
		api_token: apiToken,
		email,
		account_id: accountId,
		account_name: accountName,
	});
}

export async function getStoredToken(): Promise<AuthToken | null> {
	return getAuth();
}

export async function logout(): Promise<void> {
	await clearAuth();
}

export { clearAuth };
