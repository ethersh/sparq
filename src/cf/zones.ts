import { getCfClient, type CfApiResponse } from "./client.js";

export interface Zone {
	id: string;
	name: string;
	status: string;
	account: {
		id: string;
		name: string;
	};
}

export async function listZones(): Promise<Zone[]> {
	const client = await getCfClient();
	const zones: Zone[] = [];
	let page = 1;

	while (true) {
		const res = await client.get<CfApiResponse<Zone[]>>("/zones", {
			params: { page, per_page: 50, status: "active" },
		});

		zones.push(...res.data.result);

		const info = res.data.result_info;
		if (!info || page >= info.total_pages) break;
		page++;
	}

	return zones;
}

export async function getZoneByName(name: string): Promise<Zone | null> {
	const client = await getCfClient();
	const res = await client.get<CfApiResponse<Zone[]>>("/zones", {
		params: { name },
	});
	return res.data.result[0] ?? null;
}

export function extractZoneFromHostname(
	hostname: string,
	zones: Zone[],
): Zone | undefined {
	// Sort zones by name length descending to match most specific first
	const sorted = [...zones].sort((a, b) => b.name.length - a.name.length);
	return sorted.find((z) => hostname === z.name || hostname.endsWith(`.${z.name}`));
}
