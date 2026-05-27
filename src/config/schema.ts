export interface Route {
	hostname: string;
	port: number;
	protocol: "http" | "https";
}

export interface ProjectConfig {
	tunnel_id: string;
	tunnel_name: string;
	account_id: string;
	routes: Route[];
}

export interface TunnelCredentials {
	AccountTag: string;
	TunnelSecret: string;
	TunnelID: string;
}

export interface AuthToken {
	api_token: string;
	refresh_token?: string;
	expires_at?: number;
	email?: string;
	account_id?: string;
	account_name?: string;
}

export interface TunnelRegistryEntry {
	path: string;
	tunnel_id: string;
	tunnel_name: string;
	routes: Route[];
}

export interface TunnelRegistry {
	tunnels: TunnelRegistryEntry[];
}

function parseRoute(data: any): Route {
	if (
		!data ||
		typeof data.hostname !== "string" ||
		typeof data.port !== "number"
	) {
		throw new Error("Invalid route");
	}
	if (data.port < 1 || data.port > 65535 || !Number.isInteger(data.port)) {
		throw new Error("Invalid port");
	}
	return {
		hostname: data.hostname,
		port: data.port,
		protocol: data.protocol === "https" ? "https" : "http",
	};
}

export const RouteSchema = { parse: parseRoute };

export const ProjectConfigSchema = {
	parse(data: any): ProjectConfig {
		if (
			!data ||
			typeof data.tunnel_id !== "string" ||
			typeof data.tunnel_name !== "string" ||
			typeof data.account_id !== "string"
		) {
			throw new Error("Invalid project config");
		}
		return {
			tunnel_id: data.tunnel_id,
			tunnel_name: data.tunnel_name,
			account_id: data.account_id,
			routes: Array.isArray(data.routes)
				? data.routes.map(parseRoute)
				: [],
		};
	},
};

export const TunnelCredentialsSchema = {
	parse(data: any): TunnelCredentials {
		if (
			!data ||
			typeof data.AccountTag !== "string" ||
			typeof data.TunnelSecret !== "string" ||
			typeof data.TunnelID !== "string"
		) {
			throw new Error("Invalid tunnel credentials");
		}
		return {
			AccountTag: data.AccountTag,
			TunnelSecret: data.TunnelSecret,
			TunnelID: data.TunnelID,
		};
	},
};

export const AuthTokenSchema = {
	parse(data: any): AuthToken {
		if (!data || typeof data.api_token !== "string") {
			throw new Error("Invalid auth token");
		}
		return {
			api_token: data.api_token,
			refresh_token: data.refresh_token,
			expires_at: data.expires_at,
			email: data.email,
			account_id: data.account_id,
			account_name: data.account_name,
		};
	},
};

export const TunnelRegistryEntrySchema = {
	parse(data: any): TunnelRegistryEntry {
		if (
			!data ||
			typeof data.path !== "string" ||
			typeof data.tunnel_id !== "string" ||
			typeof data.tunnel_name !== "string"
		) {
			throw new Error("Invalid tunnel registry entry");
		}
		return {
			path: data.path,
			tunnel_id: data.tunnel_id,
			tunnel_name: data.tunnel_name,
			routes: Array.isArray(data.routes)
				? data.routes.map(parseRoute)
				: [],
		};
	},
};

export const TunnelRegistrySchema = {
	parse(data: any): TunnelRegistry {
		if (!data || !Array.isArray(data.tunnels)) {
			throw new Error("Invalid tunnel registry");
		}
		return {
			tunnels: data.tunnels.map(TunnelRegistryEntrySchema.parse),
		};
	},
};
