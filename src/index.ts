import { Command } from "commander";
import { defaultCommand } from "./commands/default.js";
import { downCommand } from "./commands/down.js";
import { statusCommand } from "./commands/status.js";
import { addCommand } from "./commands/add.js";
import { rmCommand } from "./commands/rm.js";
import { lsCommand } from "./commands/ls.js";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { logsCommand } from "./commands/logs.js";
import { importCommand } from "./commands/import.js";
import { printError } from "./ui/format.js";

const program = new Command();

function withErrorHandler(fn: (...args: any[]) => Promise<void>) {
	return async (...args: any[]) => {
		try {
			await fn(...args);
		} catch (err: any) {
			printError(err.message);
			process.exit(1);
		}
	};
}

program
	.name("sparq")
	.description("Cloudflare Tunnels, simplified.")
	.version("0.1.0")
	.action(withErrorHandler(defaultCommand));

program
	.command("down")
	.description("Stop the tunnel for this directory")
	.action(withErrorHandler(downCommand));

program
	.command("status")
	.description("Show tunnel status")
	.action(withErrorHandler(statusCommand));

program
	.command("add")
	.description("Add a new route to the tunnel")
	.action(withErrorHandler(addCommand));

program
	.command("rm <hostname>")
	.description("Remove a route and its DNS record")
	.action(withErrorHandler(rmCommand));

program
	.command("ls")
	.description("List all sparq-managed tunnels")
	.action(withErrorHandler(lsCommand));

program
	.command("up")
	.description("Start the tunnel (alias for default)")
	.action(withErrorHandler(defaultCommand));

program
	.command("logs")
	.description("Show tunnel logs")
	.option("-f, --follow", "Follow log output", false)
	.action(
		withErrorHandler(async (opts: { follow: boolean }) => {
			await logsCommand(opts);
		}),
	);

program
	.command("login")
	.description("Authenticate with Cloudflare")
	.action(withErrorHandler(loginCommand));

program
	.command("import [path]")
	.description("Import tunnel config from another directory (e.g. worktree)")
	.action(withErrorHandler(importCommand));

program
	.command("logout")
	.description("Remove stored Cloudflare credentials")
	.action(withErrorHandler(logoutCommand));

program.parse();
