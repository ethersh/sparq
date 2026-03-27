import { input, select, confirm } from "@inquirer/prompts";
import chalk from "chalk";
import type { Zone } from "../cf/zones.js";

function fuzzyMatch(query: string, target: string): boolean {
	const q = query.toLowerCase();
	const t = target.toLowerCase();

	// Direct substring match
	if (t.includes(q)) return true;

	// Character-by-character fuzzy match
	let qi = 0;
	for (let ti = 0; ti < t.length && qi < q.length; ti++) {
		if (t[ti] === q[qi]) qi++;
	}
	return qi === q.length;
}

function scoreFuzzyMatch(query: string, target: string): number {
	const q = query.toLowerCase();
	const t = target.toLowerCase();

	// Exact match
	if (t === q) return 100;

	// Starts with
	if (t.startsWith(q)) return 90;

	// Contains as substring
	const idx = t.indexOf(q);
	if (idx >= 0) return 80 - idx;

	// Fuzzy match score
	let qi = 0;
	let score = 0;
	let prevMatch = -1;
	for (let ti = 0; ti < t.length && qi < q.length; ti++) {
		if (t[ti] === q[qi]) {
			score += 10;
			// Bonus for consecutive matches
			if (prevMatch === ti - 1) score += 5;
			// Bonus for matching after separator
			if (ti === 0 || t[ti - 1] === ".") score += 3;
			prevMatch = ti;
			qi++;
		}
	}

	return qi === q.length ? score : -1;
}

function generateSuggestions(
	typed: string,
	zones: Zone[],
): Array<{ value: string; score: number }> {
	if (!typed) {
		return zones.map((z) => ({
			value: z.name,
			score: 50,
		}));
	}

	const results: Array<{ value: string; score: number }> = [];

	// Check if the user has typed a dot (indicating subdomain.zone pattern)
	const dotIndex = typed.indexOf(".");
	if (dotIndex >= 0) {
		const subdomain = typed.slice(0, dotIndex);
		const zonePart = typed.slice(dotIndex + 1);

		for (const zone of zones) {
			if (!zonePart || fuzzyMatch(zonePart, zone.name)) {
				const suggestion = `${subdomain}.${zone.name}`;
				const score = scoreFuzzyMatch(zonePart || "", zone.name);
				if (score >= 0) {
					results.push({ value: suggestion, score });
				}
			}
		}
	} else {
		// No dot yet — show <typed>.<zone> for all zones
		for (const zone of zones) {
			results.push({
				value: `${typed}.${zone.name}`,
				score: 50,
			});
		}
	}

	return results.sort((a, b) => b.score - a.score);
}

export async function promptDomain(zones: Zone[]): Promise<string> {
	const zoneNames = zones.map((z) => z.name);

	const domain = await input({
		message: "Domain",
		transformer: (value: string) => {
			if (!value) return chalk.dim("subdomain.yourdomain.com");
			return value;
		},
		validate: (value: string) => {
			if (!value) return "Domain is required";

			const dotIndex = value.indexOf(".");
			if (dotIndex < 0) return "Enter a full domain (e.g. app.example.com)";

			const zonePart = value.slice(dotIndex + 1);
			const matchedZone = zoneNames.find(
				(z) => z === zonePart || zonePart.endsWith(z),
			);
			if (!matchedZone) {
				return `Zone not found. Available: ${zoneNames.join(", ")}`;
			}

			return true;
		},
	});

	return domain;
}

export async function promptDomainWithAutocomplete(
	zones: Zone[],
): Promise<string> {
	// Show available zones upfront
	console.log(
		chalk.dim(
			`  Available zones: ${zones.map((z) => chalk.cyan(z.name)).join(", ")}`,
		),
	);

	return promptDomain(zones);
}
