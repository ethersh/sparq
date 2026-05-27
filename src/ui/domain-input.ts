import { search } from "./prompts.js";
import chalk from "./color.js";
import type { Zone } from "../cf/zones.js";

function fuzzyScore(query: string, target: string): number {
	const q = query.toLowerCase();
	const t = target.toLowerCase();

	if (t === q) return 100;
	if (t.startsWith(q)) return 90;

	const idx = t.indexOf(q);
	if (idx >= 0) return Math.max(1, 80 - idx);

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

/**
 * Given a typed hostname and the set of zones, return the longest zone that
 * is either equal to the hostname (apex) or a suffix (subdomain or wildcard).
 */
function matchZone(hostname: string, zones: Zone[]): Zone | null {
	const sorted = [...zones].sort((a, b) => b.name.length - a.name.length);
	return (
		sorted.find(
			(z) => hostname === z.name || hostname.endsWith(`.${z.name}`),
		) ?? null
	);
}

function buildSuggestions(
	typed: string,
	zones: Zone[],
): Array<{ name: string; value: string; description?: string }> {
	if (!typed.trim()) {
		// Nothing typed — offer each zone as an apex suggestion.
		return zones.map((z) => ({
			name: z.name,
			value: z.name,
			description: "apex",
		}));
	}

	const results: Array<{ value: string; score: number; label: string }> = [];

	for (const zone of zones) {
		// Apex suggestion
		if (zone.name === typed || zone.name.startsWith(typed)) {
			results.push({ value: zone.name, score: 100, label: "apex" });
		}

		// Wildcard suggestion
		const wildcard = `*.${zone.name}`;
		if (wildcard.startsWith(typed)) {
			results.push({ value: wildcard, score: 70, label: "wildcard" });
		}

		// Subdomain suggestions — only when a dot is present
		const dotIndex = typed.indexOf(".");
		if (dotIndex > 0) {
			const subdomain = typed.slice(0, dotIndex);
			const zonePart = typed.slice(dotIndex + 1);
			const subValue = `${subdomain}.${zone.name}`;
			const score = zonePart ? fuzzyScore(zonePart, zone.name) : 60;
			if (score >= 0 && subValue !== zone.name) {
				results.push({ value: subValue, score, label: "subdomain" });
			}
		}
	}

	// If user typed a full apex or a subdomain that matches a zone, surface it.
	if (matchZone(typed, zones)) {
		results.unshift({ value: typed, score: 200, label: "use as typed" });
	}

	// Dedupe by value, keeping highest score
	const seen = new Map<string, { value: string; score: number; label: string }>();
	for (const r of results) {
		const prev = seen.get(r.value);
		if (!prev || r.score > prev.score) seen.set(r.value, r);
	}

	const out = [...seen.values()].sort((a, b) => b.score - a.score);

	if (out.length === 0) {
		return [
			{
				name: chalk.dim(`No matching zones for "${typed}"`),
				value: typed,
				description: "",
			},
		];
	}

	return out.map((r) => ({
		name: r.value,
		value: r.value,
		description: r.label,
	}));
}

export async function promptDomainWithAutocomplete(
	zones: Zone[],
): Promise<string> {
	const domain = await search({
		message: "Domain",
		source: (term) => buildSuggestions(term ?? "", zones),
		validate: (value) => {
			if (!value) return "Domain is required";

			const zone = matchZone(value, zones);
			if (!zone) {
				return `No zone in your account covers "${value}"`;
			}

			// Reject trailing dot, whitespace, empty labels
			if (value.startsWith(".") || value.endsWith(".") || value.includes("..")) {
				return "Invalid hostname format";
			}

			return true;
		},
	});

	return domain;
}
