import axios, { type AxiosInstance } from "axios";
import { getAuth } from "../config/global.js";

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

let clientInstance: AxiosInstance | null = null;

export async function getCfClient(): Promise<AxiosInstance> {
	if (clientInstance) return clientInstance;

	const auth = await getAuth();
	if (!auth) {
		throw new Error("Not authenticated. Run `sparq login` first.");
	}

	clientInstance = axios.create({
		baseURL: CF_API_BASE,
		headers: {
			Authorization: `Bearer ${auth.api_token}`,
			"Content-Type": "application/json",
		},
	});

	return clientInstance;
}

export function resetClient(): void {
	clientInstance = null;
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
