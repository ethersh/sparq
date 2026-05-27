const CF_API = "https://api.cloudflare.com/client/v4";

class HttpError extends Error {
	response: { status: number; data: any };
	constructor(status: number, data: any) {
		super(data?.errors?.[0]?.message ?? `HTTP ${status}`);
		this.response = { status, data };
	}
}

async function request(
	method: string,
	url: string,
	headers: Record<string, string>,
	body?: any,
	params?: Record<string, any>,
): Promise<any> {
	const u = new URL(url);
	if (params) {
		for (const [k, v] of Object.entries(params)) {
			if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
		}
	}

	const init: RequestInit = { method, headers };
	if (body !== undefined) {
		init.body = JSON.stringify(body);
	}

	const res = await fetch(u, init);
	const data = await res.json().catch(() => ({}));

	if (!res.ok) {
		throw new HttpError(res.status, data);
	}

	return data;
}

function authHeaders(
	token: string,
	extra?: Record<string, string>,
): Record<string, string> {
	return {
		Authorization: `Bearer ${token}`,
		"Content-Type": "application/json",
		Accept: "application/json;version=1",
		...extra,
	};
}

export async function routeTunnelDns(
	token: string,
	zoneId: string,
	tunnelId: string,
	hostname: string,
	overwrite: boolean = false,
): Promise<{ result: string }> {
	return request(
		"PUT",
		`${CF_API}/zones/${zoneId}/tunnels/${tunnelId}/routes`,
		authHeaders(token),
		{
			type: "dns",
			user_hostname: hostname,
			overwrite_existing: overwrite,
		},
	);
}

export async function listTunnelsWithCert(
	token: string,
	accountId: string,
	name?: string,
): Promise<Array<{ id: string; name: string; status: string }>> {
	const params: Record<string, any> = { is_deleted: false, per_page: 100 };
	if (name) params.name = name;
	const data = await request(
		"GET",
		`${CF_API}/accounts/${accountId}/cfd_tunnel`,
		authHeaders(token),
		undefined,
		params,
	);
	return data.result;
}

export async function createTunnelWithCert(
	token: string,
	accountId: string,
	name: string,
	secret: string,
): Promise<{ id: string; name: string }> {
	const data = await request(
		"POST",
		`${CF_API}/accounts/${accountId}/cfd_tunnel`,
		authHeaders(token),
		{
			name,
			tunnel_secret: secret,
			config_src: "local",
		},
	);
	return data.result;
}

export async function deleteTunnelWithCert(
	token: string,
	accountId: string,
	tunnelId: string,
): Promise<void> {
	await request(
		"DELETE",
		`${CF_API}/accounts/${accountId}/cfd_tunnel/${tunnelId}`,
		authHeaders(token),
	);
}

export async function getDnsRecordWithToken(
	token: string,
	zoneId: string,
	hostname: string,
): Promise<{ id: string; name: string } | null> {
	const data = await request(
		"GET",
		`${CF_API}/zones/${zoneId}/dns_records`,
		authHeaders(token),
		undefined,
		{ name: hostname, type: "CNAME" },
	);
	return data.result?.[0] ?? null;
}

export async function deleteDnsRecordWithToken(
	token: string,
	zoneId: string,
	recordId: string,
): Promise<void> {
	await request(
		"DELETE",
		`${CF_API}/zones/${zoneId}/dns_records/${recordId}`,
		authHeaders(token),
	);
}
