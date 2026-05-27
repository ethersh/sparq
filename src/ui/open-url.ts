import { execFile } from "node:child_process";

export default function openUrl(url: string): Promise<void> {
	return new Promise((resolve) => {
		let cmd: string;
		let args: string[];

		if (process.platform === "darwin") {
			cmd = "open";
			args = [url];
		} else if (process.platform === "win32") {
			cmd = "cmd";
			args = ["/c", "start", "", url];
		} else {
			cmd = "xdg-open";
			args = [url];
		}

		execFile(cmd, args, () => resolve());
	});
}
