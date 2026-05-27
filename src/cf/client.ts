import { getAuth } from "../config/global.js";

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

interface RequestOpts {
	params?: Record<string, any>;
	headers?: Record<string, string>;
}

export interface CfClient {
	get<T = any>(path: string, opts?: RequestOpts): Promise<{ data: T }>;
}

export interface CfApiResponse<T> {
	success: boolean;
	errors: Array<{ code: number; message: string }>;
	messages: Array<{ code: number; message: string }>;
	result: T;
	result_info?: {
		page: number;
		per_page: number;
		total_pages: number;
		count: number;
		total_count: number;
	};
}

let clientToken: string | null = null;

export async function getCfClient(): Promise<CfClient> {
	if (!clientToken) {
		const envToken =
			process.env.CLOUDFLARE_API_TOKEN ?? process.env.CF_API_TOKEN;
		const auth = envToken ? { api_token: envToken } : await getAuth();
		if (!auth) {
			throw new Error("Not authenticated. Run `sparq login` first.");
		}
		clientToken = auth.api_token;
	}

	const token = clientToken;

	return {
		async get<T>(path: string, opts?: RequestOpts): Promise<{ data: T }> {
			const url = new URL(`${CF_API_BASE}${path}`);
			if (opts?.params) {
				for (const [k, v] of Object.entries(opts.params)) {
					if (v !== undefined && v !== null)
						url.searchParams.set(k, String(v));
				}
			}

			const res = await fetch(url, {
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
					...opts?.headers,
				},
			});

			const data = await res.json();

			if (!res.ok) {
				if (data.errors?.length > 0) {
					const cfErrors = data.errors
						.map((e: any) => e.message)
						.join(", ");
					throw new Error(`Cloudflare API: ${cfErrors}`);
				}
				throw new Error(`HTTP ${res.status}: ${res.statusText}`);
			}

			return { data: data as T };
		},
	};
}

export function resetClient(): void {
	clientToken = null;
}
