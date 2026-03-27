import { input, search } from "@inquirer/prompts";
import chalk from "chalk";
import type { Zone } from "../cf/zones.js";

function fuzzyScore(query: string, target: string): number {
	const q = query.toLowerCase();
	const t = target.toLowerCase();

	if (t === q) return 100;
	if (t.startsWith(q)) return 90;

	const idx = t.indexOf(q);
	if (idx >= 0) return Math.max(1, 80 - idx);

	// Character-by-character fuzzy
	let qi = 0;
	let score = 0;
	let prevMatch = -1;
	for (let ti = 0; ti < t.length && qi < q.length; ti++) {
		if (t[ti] === q[qi]) {
			score += 10;
			if (prevMatch === ti - 1) score += 5;
			if (ti === 0 || t[ti - 1] === ".") score += 3;
			prevMatch = ti;
			qi++;
		}
	}

	return qi === q.length ? score : -1;
}

function buildSuggestions(
	typed: string,
	zones: Zone[],
): Array<{ name: string; value: string; description?: string }> {
	if (!typed.trim()) {
		return zones.map((z) => ({
			name: z.name,
			value: z.name,
			description: "type a subdomain prefix",
		}));
	}

	const results: Array<{ value: string; score: number; zone: string }> = [];
	const dotIndex = typed.indexOf(".");

	if (dotIndex >= 0) {
		// User typed "subdomain.partial-zone" — match the zone part
		const subdomain = typed.slice(0, dotIndex);
		const zonePart = typed.slice(dotIndex + 1);

		for (const zone of zones) {
			const score = zonePart ? fuzzyScore(zonePart, zone.name) : 50;
			if (score >= 0) {
				results.push({
					value: `${subdomain}.${zone.name}`,
					score,
					zone: zone.name,
				});
			}
		}
	} else {
		// No dot yet — show typed.<zone> for each zone
		for (const zone of zones) {
			results.push({
				value: `${typed}.${zone.name}`,
				score: 50,
				zone: zone.name,
			});
		}
	}

	results.sort((a, b) => b.score - a.score);

	return results.map((r) => ({
		name: r.value,
		value: r.value,
		description: r.zone,
	}));
}

export async function promptDomainWithAutocomplete(
	zones: Zone[],
): Promise<string> {
	const zoneNames = zones.map((z) => z.name);

	console.log(
		chalk.dim(
			`  Your zones: ${zones.map((z) => chalk.cyan(z.name)).join(chalk.dim(", "))}`,
		),
	);

	const domain = await search({
		message: "Domain",
		source: (term) => {
			const typed = term ?? "";
			return buildSuggestions(typed, zones);
		},
		validate: (value) => {
			if (!value) return "Domain is required";

			const dotIndex = value.indexOf(".");
			if (dotIndex < 0) return "Enter a full domain (e.g. app.example.com)";

			const zonePart = value.slice(dotIndex + 1);
			const matched = zoneNames.find(
				(z) => z === zonePart || zonePart.endsWith(z),
			);
			if (!matched) {
				return `Zone "${zonePart}" not found in your account`;
			}

			return true;
		},
	});

	return domain;
}
