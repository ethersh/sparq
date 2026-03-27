import { z } from "zod/v4";

export const RouteSchema = z.object({
	hostname: z.string(),
	port: z.number().int().min(1).max(65535),
	protocol: z.enum(["http", "https"]).default("http"),
});

export const ProjectConfigSchema = z.object({
	tunnel_id: z.string().uuid(),
	tunnel_name: z.string(),
	account_id: z.string(),
	routes: z.array(RouteSchema),
});

export const TunnelCredentialsSchema = z.object({
	AccountTag: z.string(),
	TunnelSecret: z.string(),
	TunnelID: z.string(),
});

export const AuthTokenSchema = z.object({
	api_token: z.string(),
	email: z.string().email().optional(),
	account_id: z.string().optional(),
	account_name: z.string().optional(),
});

export const TunnelRegistryEntrySchema = z.object({
	path: z.string(),
	tunnel_id: z.string().uuid(),
	tunnel_name: z.string(),
	routes: z.array(RouteSchema),
});

export const TunnelRegistrySchema = z.object({
	tunnels: z.array(TunnelRegistryEntrySchema),
});

export type Route = z.infer<typeof RouteSchema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type TunnelCredentials = z.infer<typeof TunnelCredentialsSchema>;
export type AuthToken = z.infer<typeof AuthTokenSchema>;
export type TunnelRegistryEntry = z.infer<typeof TunnelRegistryEntrySchema>;
export type TunnelRegistry = z.infer<typeof TunnelRegistrySchema>;
