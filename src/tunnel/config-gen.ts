import { writeFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import {
	getCloudflaredConfigPath,
	getCredentialsPath,
} from "../config/project.js";
import type { ProjectConfig } from "../config/schema.js";

export async function generateCloudflaredConfig(
	config: ProjectConfig,
): Promise<string> {
	const configPath = getCloudflaredConfigPath(config.tunnel_id);
	const credentialsFile = getCredentialsPath(config.tunnel_id);

	const dir = dirname(configPath);
	if (!existsSync(dir)) {
		await mkdir(dir, { recursive: true });
	}

	const ingress = config.routes
		.map(
			(r) =>
				`  - hostname: ${r.hostname}\n    service: ${r.protocol}://localhost:${r.port}`,
		)
		.join("\n");

	const yaml = `tunnel: ${config.tunnel_id}
credentials-file: ${credentialsFile}
ingress:
${ingress}
  - service: http_status:404
`;

	await writeFile(configPath, yaml, "utf-8");
	return configPath;
}
