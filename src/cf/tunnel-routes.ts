import axios from "axios";

const CF_API = "https://api.cloudflare.com/client/v4";

/**
 * Route DNS using cloudflared's tunnel-specific endpoint.
 * This is NOT the standard /zones/{id}/dns_records endpoint.
 * It's the endpoint cloudflared itself uses: PUT /zones/{zoneID}/tunnels/{tunnelID}/routes
 * The cert.pem token has permission for this.
 */
export async function routeTunnelDns(
	token: string,
	zoneId: string,
	tunnelId: string,
	hostname: string,
	overwrite: boolean = false,
): Promise<{ result: string }> {
	const res = await axios.put(
		`${CF_API}/zones/${zoneId}/tunnels/${tunnelId}/routes`,
		{
			type: "dns",
			user_hostname: hostname,
			overwrite_existing: overwrite,
		},
		{
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
				Accept: "application/json;version=1",
			},
		},
	);
	return res.data;
}

/**
 * List tunnels using the cert.pem token.
 */
export async function listTunnelsWithCert(
	token: string,
	accountId: string,
	name?: string,
): Promise<Array<{ id: string; name: string; status: string }>> {
	const params: Record<string, any> = { is_deleted: false, per_page: 100 };
	if (name) params.name = name;
	const res = await axios.get(
		`${CF_API}/accounts/${accountId}/cfd_tunnel`,
		{
			params,
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: "application/json;version=1",
			},
		},
	);
	return res.data.result;
}

/**
 * Create a tunnel using the cert.pem token.
 * Uses /accounts/{accountID}/cfd_tunnel — same as cloudflared.
 */
export async function createTunnelWithCert(
	token: string,
	accountId: string,
	name: string,
	secret: string,
): Promise<{ id: string; name: string }> {
	const res = await axios.post(
		`${CF_API}/accounts/${accountId}/cfd_tunnel`,
		{
			name,
			tunnel_secret: secret,
			config_src: "local",
		},
		{
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
				Accept: "application/json;version=1",
			},
		},
	);
	return res.data.result;
}

/**
 * Delete a tunnel using the cert.pem token.
 */
export async function deleteTunnelWithCert(
	token: string,
	accountId: string,
	tunnelId: string,
): Promise<void> {
	await axios.delete(
		`${CF_API}/accounts/${accountId}/cfd_tunnel/${tunnelId}`,
		{
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: "application/json;version=1",
			},
		},
	);
}

/**
 * Find a CNAME DNS record for a hostname using the cert.pem token.
 */
export async function getDnsRecordWithToken(
	token: string,
	zoneId: string,
	hostname: string,
): Promise<{ id: string; name: string } | null> {
	const res = await axios.get(
		`${CF_API}/zones/${zoneId}/dns_records`,
		{
			params: { name: hostname, type: "CNAME" },
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: "application/json;version=1",
			},
		},
	);
	return res.data.result?.[0] ?? null;
}

/**
 * Delete a DNS record using the cert.pem token.
 */
export async function deleteDnsRecordWithToken(
	token: string,
	zoneId: string,
	recordId: string,
): Promise<void> {
	await axios.delete(
		`${CF_API}/zones/${zoneId}/dns_records/${recordId}`,
		{
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: "application/json;version=1",
			},
		},
	);
}
