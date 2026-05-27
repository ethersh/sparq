const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface Spinner {
	start(): Spinner;
	success(text?: string): void;
	error(text?: string): void;
	warning(text?: string): void;
}

export default function yoctoSpinner(opts: { text: string }): Spinner {
	let interval: ReturnType<typeof setInterval> | null = null;
	let frameIdx = 0;
	const text = opts.text;

	function clear(): void {
		process.stderr.write("\r\x1b[2K");
	}

	function render(): void {
		clear();
		process.stderr.write(`  ${FRAMES[frameIdx]} ${text}`);
		frameIdx = (frameIdx + 1) % FRAMES.length;
	}

	function stop(symbol: string, msg?: string): void {
		if (interval) {
			clearInterval(interval);
			interval = null;
		}
		clear();
		process.stderr.write(`  ${symbol} ${msg ?? text}\n`);
	}

	return {
		start() {
			render();
			interval = setInterval(render, 80);
			return this;
		},
		success(msg?: string) {
			stop("\x1b[32m✓\x1b[0m", msg);
		},
		error(msg?: string) {
			stop("\x1b[31m✗\x1b[0m", msg);
		},
		warning(msg?: string) {
			stop("\x1b[33m⚠\x1b[0m", msg);
		},
	};
}
