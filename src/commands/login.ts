import { ensureAuth } from "../auth/ensure.js";
import { printBanner, printSuccess, printError } from "../ui/format.js";

export async function loginCommand(): Promise<void> {
	printBanner();

	try {
		const auth = await ensureAuth();
		console.log();
		printSuccess(`Authenticated as ${auth.email}`);
		if (auth.account_name) {
			printSuccess(`Account: ${auth.account_name}`);
		}
	} catch (err: any) {
		printError(`Login failed: ${err.message}`);
		process.exit(1);
	}
}
