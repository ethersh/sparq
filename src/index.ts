import { Command } from "commander";
import { defaultCommand } from "./commands/default.js";
import { downCommand } from "./commands/down.js";
import { statusCommand } from "./commands/status.js";
import { addCommand } from "./commands/add.js";
import { rmCommand } from "./commands/rm.js";
import { lsCommand } from "./commands/ls.js";
import { loginCommand } from "./commands/login.js";
import { printError } from "./ui/format.js";

const program = new Command();

program
	.name("sparq")
	.description("Cloudflare Tunnels, simplified.")
	.version("0.1.0")
	.action(async () => {
		try {
			await defaultCommand();
		} catch (err: any) {
			printError(err.message);
			process.exit(1);
		}
	});

program
	.command("down")
	.description("Stop the tunnel for this directory")
	.action(async () => {
		try {
			await downCommand();
		} catch (err: any) {
			printError(err.message);
			process.exit(1);
		}
	});

program
	.command("status")
	.description("Show tunnel status")
	.action(async () => {
		try {
			await statusCommand();
		} catch (err: any) {
			printError(err.message);
			process.exit(1);
		}
	});

program
	.command("add")
	.description("Add a new route to the tunnel")
	.action(async () => {
		try {
			await addCommand();
		} catch (err: any) {
			printError(err.message);
			process.exit(1);
		}
	});

program
	.command("rm <hostname>")
	.description("Remove a route and its DNS record")
	.action(async (hostname: string) => {
		try {
			await rmCommand(hostname);
		} catch (err: any) {
			printError(err.message);
			process.exit(1);
		}
	});

program
	.command("ls")
	.description("List all sparq-managed tunnels")
	.action(async () => {
		try {
			await lsCommand();
		} catch (err: any) {
			printError(err.message);
			process.exit(1);
		}
	});

program
	.command("login")
	.description("Authenticate with Cloudflare")
	.action(async () => {
		try {
			await loginCommand();
		} catch (err: any) {
			printError(err.message);
			process.exit(1);
		}
	});

program.parse();
