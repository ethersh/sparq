import { randomBytes } from "node:crypto";
import { getCfClient, type CfApiResponse } from "./client.js";
import type { TunnelCredentials } from "../config/schema.js";

export interface CfTunnel {
	id: string;
	name: string;
	status: string;
	created_at: string;
	connections: Array<{
		colo_name: string;
		id: string;
		is_pending_reconnect: boolean;
	}>;
}

export async function listTunnels(accountId: string): Promise<CfTunnel[]> {
	const client = await getCfClient();
	const res = await client.get<CfApiResponse<CfTunnel[]>>(
		`/accounts/${accountId}/cfd_tunnel`,
		{
			params: { is_deleted: false, per_page: 100 },
		},
	);
	return res.data.result;
}

export async function createTunnel(
	accountId: string,
	name: string,
): Promise<{ tunnel: CfTunnel; credentials: TunnelCredentials }> {
	const client = await getCfClient();
	const secret = randomBytes(32).toString("base64");

	const res = await client.post<CfApiResponse<CfTunnel>>(
		`/accounts/${accountId}/cfd_tunnel`,
		{
			name,
			tunnel_secret: secret,
			config_src: "local",
		},
	);

	const tunnel = res.data.result;
	const credentials: TunnelCredentials = {
		AccountTag: accountId,
		TunnelSecret: secret,
		TunnelID: tunnel.id,
	};

	return { tunnel, credentials };
}

export async function deleteTunnel(
	accountId: string,
	tunnelId: string,
): Promise<void> {
	const client = await getCfClient();
	await client.delete(`/accounts/${accountId}/cfd_tunnel/${tunnelId}`);
}

export async function getTunnel(
	accountId: string,
	tunnelId: string,
): Promise<CfTunnel | null> {
	try {
		const client = await getCfClient();
		const res = await client.get<CfApiResponse<CfTunnel>>(
			`/accounts/${accountId}/cfd_tunnel/${tunnelId}`,
		);
		return res.data.result;
	} catch {
		return null;
	}
}
