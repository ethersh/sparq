import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
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
import { destroyCommand } from "./commands/destroy.js";
import { printError } from "./ui/format.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));

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
	.version(pkg.version)
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

program
	.command("destroy")
	.description("Permanently destroy tunnel, DNS records, and all config")
	.action(withErrorHandler(destroyCommand));

program.parse();
