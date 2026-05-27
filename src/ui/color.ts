type StyleFn = {
	(text: string): string;
	bold: StyleFn;
};

function hexToRgb(hex: string): [number, number, number] {
	const h = hex.replace("#", "");
	return [
		parseInt(h.slice(0, 2), 16),
		parseInt(h.slice(2, 4), 16),
		parseInt(h.slice(4, 6), 16),
	];
}

function makeStyle(codes: string[]): StyleFn {
	const fn = ((text: string): string => {
		const open = codes.map((c) => `\x1b[${c}m`).join("");
		return `${open}${text}\x1b[0m`;
	}) as StyleFn;

	Object.defineProperty(fn, "bold", {
		get: () => makeStyle(["1", ...codes]),
	});

	return fn;
}

const chalk = {
	green: makeStyle(["32"]),
	yellow: makeStyle(["33"]),
	red: makeStyle(["31"]),
	white: makeStyle(["37"]),
	dim: makeStyle(["2"]),
	bold: makeStyle(["1"]),
	hex(color: string): StyleFn {
		const [r, g, b] = hexToRgb(color);
		return makeStyle([`38;2;${r};${g};${b}`]);
	},
};

export default chalk;
export type { StyleFn };
