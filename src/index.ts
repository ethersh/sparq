import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { defaultCommand } from "./commands/default.js";
import { headlessUp } from "./commands/headless.js";
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

const HEADLESS_USAGE = `
Usage: sparq --headless --domain <domain> --route <label:port>... [--seed <seed>] [--json]

Required:
  --domain <domain>       Parent domain on Cloudflare (e.g. t.useautumn.com)
  --route <label:port>    App route(s). Repeat for each service in a monorepo.
                          Format: label:port (e.g. api:3000) or just port for single app

Optional:
  --seed <seed>           Subdomain prefix. Deterministic — same seed always gets same
                          subdomain. Omit for a random 4-char hex.
                          Tip: use person-worktree as seed (e.g. amir-wt1)
  --json                  Output JSON to stdout instead of human-readable text

Examples:

  # Monorepo with API + web app (seeded for worktree)
  sparq --headless --domain dev.example.com --seed team1-wt2 --route api:3000 --route web:5173
  # → team1-wt2-api.dev.example.com → localhost:3000
  # → team1-wt2-web.dev.example.com → localhost:5173

  # Single app
  sparq --headless --domain dev.example.com --seed my-feature --route 8080
  # → my-feature.dev.example.com → localhost:8080

  # Random subdomain (ephemeral)
  sparq --headless --domain dev.example.com --route api:3000 --route web:5173
  # → x7f2-api.dev.example.com → localhost:3000
  # → x7f2-web.dev.example.com → localhost:5173

  # JSON output for scripting / CI / AI agents
  sparq --headless --domain dev.example.com --seed ci-pr-42 --route api:3000 --json

Auth:
  For headless environments (CI, containers, cloud workspaces), set these
  env vars instead of running \`sparq login\`:

  CLOUDFLARE_API_TOKEN    Cloudflare API token (Zone:Read, DNS:Edit, Tunnel:Edit)
  CLOUDFLARE_ACCOUNT_ID   Cloudflare account ID

  Or use the CF_ prefix: CF_API_TOKEN, CF_ACCOUNT_ID

  In interactive environments, run \`sparq login\` once instead.

Notes:
  - Seeded tunnels are idempotent: re-running the same command reuses the tunnel
  - Cleanup: run \`sparq destroy\` from the same directory
`.trim();

function validateHeadlessOpts(opts: any): void {
	const missing: string[] = [];
	if (!opts.domain) missing.push("--domain");
	if (!opts.route || opts.route.length === 0) missing.push("--route");
	if (missing.length > 0) {
		console.error(HEADLESS_USAGE);
		console.error();
		throw new Error(`Missing required flags: ${missing.join(", ")}`);
	}
}

program
	.name("sparq")
	.description("Cloudflare Tunnels, simplified.")
	.version(pkg.version)
	.option("--headless", "Non-interactive mode (no prompts)")
	.option("--domain <domain>", "Parent domain (e.g. t.useautumn.com)")
	.option("--seed <seed>", "Subdomain prefix (e.g. amir-wt1). Random if omitted")
	.option("--route <routes...>", "Routes as label:port or port (e.g. api:3000 web:5173)")
	.option("--json", "Output JSON instead of human-readable text")
	.action(
		withErrorHandler(async (opts) => {
			if (opts.headless) {
				validateHeadlessOpts(opts);
				await headlessUp(opts);
			} else {
				await defaultCommand();
			}
		}),
	);

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
	.option("--headless", "Non-interactive mode (no prompts)")
	.option("--domain <domain>", "Parent domain (e.g. t.useautumn.com)")
	.option("--seed <seed>", "Subdomain prefix (e.g. amir-wt1). Random if omitted")
	.option("--route <routes...>", "Routes as label:port or port (e.g. api:3000 web:5173)")
	.option("--json", "Output JSON instead of human-readable text")
	.action(
		withErrorHandler(async (opts) => {
			if (opts.headless) {
				validateHeadlessOpts(opts);
				await headlessUp(opts);
			} else {
				await defaultCommand();
			}
		}),
	);

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
