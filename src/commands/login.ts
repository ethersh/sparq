import chalk from "chalk";
import { ensureAuth } from "../auth/ensure.js";
import { printBanner, printBox, printError } from "../ui/format.js";

export async function loginCommand(): Promise<void> {
	printBanner();

	try {
		const auth = await ensureAuth();

		console.log();
		printBox(
			"authenticated",
			[
				`${chalk.dim("email")}    ${auth.email}`,
				`${chalk.dim("account")}  ${auth.account_name ?? auth.account_id}`,
			],
			chalk.green,
		);
		console.log();
	} catch (err: any) {
		printError(`Login failed: ${err.message}`);
		process.exit(1);
	}
}
