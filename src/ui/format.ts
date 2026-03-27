import chalk from "chalk";
import type { Route } from "../config/schema.js";

export function printBanner(): void {
	console.log();
	console.log(chalk.bold("  sparq"));
	console.log(chalk.dim("  Cloudflare Tunnels, simplified."));
	console.log();
}

export function printRoutes(routes: Route[], running: boolean): void {
	const status = running
		? chalk.green("● running")
		: chalk.red("● stopped");

	console.log(`  ${status}`);
	console.log();

	for (const route of routes) {
		console.log(
			`  ${chalk.cyan(route.hostname)} ${chalk.dim("→")} ${chalk.white(`localhost:${route.port}`)}`,
		);
	}
	console.log();
}

export function printSuccess(msg: string): void {
	console.log(chalk.green(`  ✓ ${msg}`));
}

export function printWarning(msg: string): void {
	console.log(chalk.yellow(`  ⚠ ${msg}`));
}

export function printError(msg: string): void {
	console.log(chalk.red(`  ✗ ${msg}`));
}

export function printDim(msg: string): void {
	console.log(chalk.dim(`  ${msg}`));
}

export function printHint(msg: string): void {
	console.log(chalk.dim(`  ${msg}`));
}
