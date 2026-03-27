import chalk from "chalk";
import type { Route } from "../config/schema.js";

// Brand colors
const brand = chalk.hex("#FF8C00");
const brandBold = chalk.hex("#FF8C00").bold;
const success = chalk.hex("#FFD700");
const warn = chalk.hex("#FFA500");
const err = chalk.red;
const dim = chalk.dim;
const bold = chalk.bold;

const BOLT = "⚡";

export function printBanner(): void {
	console.log();
	console.log(
		`  ${brand(BOLT)} ${brandBold("sparq")} ${dim("— fast tunnelling")}`,
	);
	console.log();
}

export function printBox(
	title: string,
	lines: string[],
	color: typeof chalk = brand,
): void {
	const contentWidth = Math.max(
		title.length + 4,
		...lines.map((l) => stripAnsi(l).length + 4),
		50,
	);

	const top = `  ${color("╭")}${color("─")} ${color.bold(title)} ${color("─".repeat(Math.max(0, contentWidth - title.length - 3)))}${color("╮")}`;
	const bottom = `  ${color("╰")}${color("─".repeat(contentWidth))}${color("╯")}`;

	console.log(top);
	for (const line of lines) {
		const padding = contentWidth - stripAnsi(line).length - 2;
		console.log(
			`  ${color("│")} ${line}${" ".repeat(Math.max(0, padding))} ${color("│")}`,
		);
	}
	console.log(bottom);
}

export function printRoutes(routes: Route[], running: boolean): void {
	const status = running
		? `${success("●")} ${success("running")}`
		: `${err("●")} ${err("stopped")}`;

	const lines = [status, ""];

	for (const route of routes) {
		lines.push(
			`${brand(route.hostname)} ${dim("→")} ${chalk.white(`localhost:${route.port}`)}`,
		);
	}

	if (routes.length === 0) {
		lines.push(dim("no routes configured"));
	}

	printBox("tunnel", lines);
	console.log();
}

export function printSuccess(msg: string): void {
	console.log(`  ${success("✓")} ${msg}`);
}

export function printWarning(msg: string): void {
	console.log(`  ${warn("⚠")} ${msg}`);
}

export function printError(msg: string): void {
	console.log(`  ${err("✗")} ${msg}`);
}

export function printDim(msg: string): void {
	console.log(`  ${dim(msg)}`);
}

export function printHint(msg: string): void {
	console.log(`  ${dim(msg)}`);
}

export function printStep(label: string): void {
	console.log(`\n  ${brandBold(label)}`);
}

// Strip ANSI escape codes for width calculation
function stripAnsi(str: string): string {
	return str.replace(
		// eslint-disable-next-line no-control-regex
		/\u001b\[[0-9;]*m/g,
		"",
	);
}
