import { writeFile } from "node:fs/promises";
import {
	getCloudflaredConfigPath,
	getCredentialsPath,
} from "../config/project.js";
import type { ProjectConfig } from "../config/schema.js";

export async function generateCloudflaredConfig(
	config: ProjectConfig,
	cwd?: string,
): Promise<string> {
	const configPath = getCloudflaredConfigPath(cwd);
	const credentialsFile = getCredentialsPath(cwd);

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
