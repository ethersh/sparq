import { search } from "@inquirer/prompts";
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
	// Nothing typed yet — show hint, no suggestions
	if (!typed.trim()) {
		return [
			{
				name: chalk.dim("Type a domain (e.g. api.example.com)"),
				value: "",
				description: "",
			},
		];
	}

	const dotIndex = typed.indexOf(".");

	// No dot yet — user is still typing subdomain, don't autocomplete zones
	if (dotIndex < 0) {
		return [
			{
				name: chalk.dim(`${typed}. ...`),
				value: typed,
				description: "type a dot to see your zones",
			},
		];
	}

	// Has dot — now autocomplete the zone part
	const subdomain = typed.slice(0, dotIndex);
	const zonePart = typed.slice(dotIndex + 1);

	if (!subdomain) {
		return [
			{
				name: chalk.dim("Type a subdomain before the dot"),
				value: "",
				description: "",
			},
		];
	}

	const results: Array<{ value: string; score: number; zone: string }> = [];

	for (const zone of zones) {
		// If zone part is empty (just typed the dot), show all zones
		if (!zonePart) {
			results.push({
				value: `${subdomain}.${zone.name}`,
				score: 50,
				zone: zone.name,
			});
			continue;
		}

		// Fuzzy match the zone part
		const score = fuzzyScore(zonePart, zone.name);
		if (score >= 0) {
			results.push({
				value: `${subdomain}.${zone.name}`,
				score,
				zone: zone.name,
			});
		}
	}

	results.sort((a, b) => b.score - a.score);

	// If the user typed something that exactly matches (subdomain.zone), put it first
	const exactMatch = results.find((r) => r.value === typed);
	if (!exactMatch && zonePart) {
		// Allow custom domain even if zone doesn't match perfectly
		// (they might be typing it out)
	}

	if (results.length === 0) {
		return [
			{
				name: chalk.dim(`No matching zones for "${zonePart}"`),
				value: typed,
				description: "",
			},
		];
	}

	return results.map((r) => ({
		name: r.value,
		value: r.value,
	}));
}

export async function promptDomainWithAutocomplete(
	zones: Zone[],
): Promise<string> {
	const zoneNames = zones.map((z) => z.name);

	const domain = await search({
		message: "Domain",
		source: (term) => {
			return buildSuggestions(term ?? "", zones);
		},
		validate: (value) => {
			if (!value) return "Domain is required";

			const dotIndex = value.indexOf(".");
			if (dotIndex < 0) return "Enter a full domain (e.g. app.example.com)";

			const subdomain = value.slice(0, dotIndex);
			if (!subdomain) return "Enter a subdomain before the dot";

			const zonePart = value.slice(dotIndex + 1);
			if (!zonePart) return "Enter a zone after the dot";

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
