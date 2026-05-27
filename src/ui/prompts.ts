import * as readline from "node:readline/promises";

export async function input(opts: {
	message: string;
	default?: string;
	validate?: (value: string) => true | string;
}): Promise<string> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	const suffix = opts.default ? ` \x1b[2m(${opts.default})\x1b[0m` : "";

	try {
		while (true) {
			const answer = await rl.question(
				`  \x1b[32m?\x1b[0m ${opts.message}${suffix}: `,
			);
			const value = answer.trim() || opts.default || "";

			if (opts.validate) {
				const result = opts.validate(value);
				if (result !== true) {
					console.log(`    \x1b[31m${result}\x1b[0m`);
					continue;
				}
			}

			return value;
		}
	} finally {
		rl.close();
	}
}

export async function confirm(opts: {
	message: string;
	default?: boolean;
}): Promise<boolean> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	const hint = opts.default === false ? "y/N" : "Y/n";

	try {
		while (true) {
			const answer = await rl.question(
				`  \x1b[32m?\x1b[0m ${opts.message} \x1b[2m(${hint})\x1b[0m: `,
			);
			const val = answer.trim().toLowerCase();

			if (val === "") return opts.default ?? true;
			if (val === "y" || val === "yes") return true;
			if (val === "n" || val === "no") return false;

			console.log("    Please answer y or n");
		}
	} finally {
		rl.close();
	}
}

export async function search<T>(opts: {
	message: string;
	source: (
		term: string | undefined,
	) =>
		| Array<{ name: string; value: T; description?: string }>
		| Promise<Array<{ name: string; value: T; description?: string }>>;
	validate?: (value: T) => true | string;
}): Promise<T> {
	const stdin = process.stdin;
	const stdout = process.stdout;

	if (typeof stdin.setRawMode !== "function") {
		throw new Error("search prompt requires a TTY");
	}

	stdin.setRawMode(true);
	stdin.resume();
	stdin.setEncoding("utf8");

	let inputBuf = "";
	let selectedIndex = 0;
	let items: Array<{ name: string; value: T; description?: string }> = [];
	let prevLines = 0;
	let errorMsg = "";

	items = await Promise.resolve(opts.source(undefined));

	function clearBelow(): void {
		for (let i = 0; i < prevLines; i++) {
			stdout.write("\n\x1b[2K");
		}
		if (prevLines > 0) {
			stdout.write(`\x1b[${prevLines}A`);
		}
	}

	function render(): void {
		clearBelow();
		stdout.write("\r\x1b[2K");

		stdout.write(`  \x1b[32m?\x1b[0m ${opts.message}: ${inputBuf}`);

		let linesBelow = 0;

		if (errorMsg) {
			stdout.write(`\n\x1b[2K    \x1b[31m${errorMsg}\x1b[0m`);
			linesBelow++;
		}

		const maxShow = Math.min(items.length, 7);
		for (let i = 0; i < maxShow; i++) {
			const item = items[i];
			const cursor = i === selectedIndex ? "\x1b[36m❯\x1b[0m" : " ";
			const name =
				i === selectedIndex
					? `\x1b[36m${item.name}\x1b[0m`
					: item.name;
			const desc = item.description
				? `  \x1b[2m${item.description}\x1b[0m`
				: "";
			stdout.write(`\n\x1b[2K  ${cursor} ${name}${desc}`);
			linesBelow++;
		}

		if (linesBelow > 0) {
			stdout.write(`\x1b[${linesBelow}A`);
		}

		prevLines = linesBelow;

		const col = 6 + opts.message.length + inputBuf.length;
		stdout.write(`\r\x1b[${col}C`);
	}

	render();

	return new Promise<T>((resolve) => {
		function cleanup(): void {
			stdin.removeListener("data", onData);
			stdin.setRawMode(false);
			stdin.pause();
		}

		function finalize(value: T, display: string): void {
			cleanup();
			clearBelow();
			stdout.write(
				`\r\x1b[2K  \x1b[32m?\x1b[0m ${opts.message}: \x1b[36m${display}\x1b[0m\n`,
			);
			resolve(value);
		}

		async function onData(key: string): Promise<void> {
			if (key === "\x03") {
				cleanup();
				clearBelow();
				stdout.write("\r\x1b[2K\n");
				process.exit(0);
			}

			if (key === "\r" || key === "\n") {
				if (items.length > 0 && selectedIndex < items.length) {
					const selected = items[selectedIndex];
					if (opts.validate) {
						const result = opts.validate(selected.value);
						if (result !== true) {
							errorMsg = result;
							render();
							return;
						}
					}
					finalize(selected.value, String(selected.value));
					return;
				}
				return;
			}

			if (key === "\x7f" || key === "\b") {
				inputBuf = inputBuf.slice(0, -1);
				selectedIndex = 0;
			} else if (key === "\x1b[A") {
				selectedIndex = Math.max(0, selectedIndex - 1);
				render();
				return;
			} else if (key === "\x1b[B") {
				selectedIndex = Math.min(
					Math.max(0, items.length - 1),
					selectedIndex + 1,
				);
				render();
				return;
			} else if (key.length === 1 && key >= " ") {
				inputBuf += key;
				selectedIndex = 0;
			} else {
				return;
			}

			errorMsg = "";
			items = await Promise.resolve(opts.source(inputBuf || undefined));
			if (selectedIndex >= items.length) {
				selectedIndex = Math.max(0, items.length - 1);
			}
			render();
		}

		stdin.on("data", onData);
	});
}
