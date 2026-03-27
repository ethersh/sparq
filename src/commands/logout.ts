import { logout } from "../auth/store.js";
import { resetClient } from "../cf/client.js";
import { printBanner, printSuccess } from "../ui/format.js";

export async function logoutCommand(): Promise<void> {
	printBanner();
	await logout();
	resetClient();
	printSuccess("Logged out. Credentials removed.");
	console.log();
}
