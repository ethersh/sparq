import { getCfClient, type CfApiResponse } from "./client.js";

export interface DnsRecord {
	id: string;
	type: string;
	name: string;
	content: string;
	proxied: boolean;
	ttl: number;
}

export async function getDnsRecord(
	zoneId: string,
	hostname: string,
): Promise<DnsRecord | null> {
	const client = await getCfClient();
	const res = await client.get<CfApiResponse<DnsRecord[]>>(
		`/zones/${zoneId}/dns_records`,
		{
			params: { name: hostname, type: "CNAME" },
		},
	);
	return res.data.result[0] ?? null;
}

export async function createDnsRecord(
	zoneId: string,
	hostname: string,
	tunnelId: string,
): Promise<DnsRecord> {
	const client = await getCfClient();
	const res = await client.post<CfApiResponse<DnsRecord>>(
		`/zones/${zoneId}/dns_records`,
		{
			type: "CNAME",
			name: hostname,
			content: `${tunnelId}.cfargotunnel.com`,
			proxied: true,
			ttl: 1, // auto
		},
	);
	return res.data.result;
}

export async function updateDnsRecord(
	zoneId: string,
	recordId: string,
	hostname: string,
	tunnelId: string,
): Promise<DnsRecord> {
	const client = await getCfClient();
	const res = await client.put<CfApiResponse<DnsRecord>>(
		`/zones/${zoneId}/dns_records/${recordId}`,
		{
			type: "CNAME",
			name: hostname,
			content: `${tunnelId}.cfargotunnel.com`,
			proxied: true,
			ttl: 1,
		},
	);
	return res.data.result;
}

export async function deleteDnsRecord(
	zoneId: string,
	recordId: string,
): Promise<void> {
	const client = await getCfClient();
	await client.delete(`/zones/${zoneId}/dns_records/${recordId}`);
}
