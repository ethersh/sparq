import { parseArgs } from "node:util";
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

const HELP = `sparq v${pkg.version} — Cloudflare Tunnels, simplified.

Usage:
  sparq                         Interactive setup & start
  sparq up                      Start tunnel (alias for default)
  sparq down                    Stop the tunnel
  sparq status                  Show tunnel status
  sparq add                     Add a new route
  sparq rm <hostname>           Remove a route and DNS record
  sparq ls                      List all sparq-managed tunnels
  sparq logs [-f]               Show tunnel logs
  sparq login                   Authenticate with Cloudflare
  sparq import [path]           Import config from another directory
  sparq logout                  Remove stored credentials
  sparq destroy                 Permanently destroy tunnel

Options:
  --headless                    Non-interactive mode
  --domain <domain>             Parent domain
  --seed <seed>                 Subdomain prefix
  --route <label:port>          Route (repeatable)
  --json                        JSON output
  -f, --follow                  Follow log output
  -V, --version                 Show version
  -h, --help                    Show help
`;

async function main(): Promise<void> {
	const { values, positionals } = parseArgs({
		options: {
			headless: { type: "boolean", default: false },
			domain: { type: "string" },
			seed: { type: "string" },
			route: { type: "string", multiple: true },
			json: { type: "boolean", default: false },
			follow: { type: "boolean", short: "f", default: false },
			version: { type: "boolean", short: "V", default: false },
			help: { type: "boolean", short: "h", default: false },
		},
		allowPositionals: true,
		strict: false,
	});

	if (values.version) {
		console.log(pkg.version);
		return;
	}

	if (values.help) {
		console.log(HELP);
		return;
	}

	const command = positionals[0];

	switch (command) {
		case undefined:
		case "up":
			if (values.headless) {
				validateHeadlessOpts(values);
				await headlessUp(values as any);
			} else {
				await defaultCommand();
			}
			break;
		case "down":
			await downCommand();
			break;
		case "status":
			await statusCommand();
			break;
		case "add":
			await addCommand();
			break;
		case "rm": {
			const hostname = positionals[1];
			if (!hostname) {
				printError("Usage: sparq rm <hostname>");
				process.exit(1);
			}
			await rmCommand(hostname);
			break;
		}
		case "ls":
			await lsCommand();
			break;
		case "logs":
			await logsCommand({ follow: !!values.follow });
			break;
		case "login":
			await loginCommand();
			break;
		case "import":
			await importCommand(positionals[1]);
			break;
		case "logout":
			await logoutCommand();
			break;
		case "destroy":
			await destroyCommand();
			break;
		default:
			console.error(`Unknown command: ${command}`);
			console.log(HELP);
			process.exit(1);
	}
}

main().catch((err: any) => {
	printError(err.message);
	process.exit(1);
});
