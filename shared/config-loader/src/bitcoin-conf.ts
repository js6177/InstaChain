import { readFileSync, writeFileSync } from "node:fs";

/**
 * Minimal INI-style parser for bitcoin.conf (supports [sections] and key=value).
 */
export interface BitcoinConfDocument {
	globals: Record<string, string>;
	sections: Record<string, Record<string, string>>;
}

export function parseBitcoinConf(contents: string): BitcoinConfDocument {
	const globals: Record<string, string> = {};
	const sections: Record<string, Record<string, string>> = {};
	let currentSection: string | null = null;

	for (const rawLine of contents.split("\n")) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) {
			continue;
		}

		const sectionMatch = line.match(/^\[([^\]]+)\]$/);
		if (sectionMatch?.[1]) {
			currentSection = sectionMatch[1].trim();
			sections[currentSection] ??= {};
			continue;
		}

		const separatorIndex = line.indexOf("=");
		if (separatorIndex === -1) {
			continue;
		}

		const key = line.slice(0, separatorIndex).trim();
		const value = line.slice(separatorIndex + 1).trim();
		if (currentSection === null) {
			globals[key] = value;
		} else {
			const section = sections[currentSection] ?? {};
			section[key] = value;
			sections[currentSection] = section;
		}
	}

	return { globals, sections };
}

export function readBitcoinConf(path: string): BitcoinConfDocument {
	return parseBitcoinConf(readFileSync(path, "utf-8"));
}

export function writeBitcoinConf(path: string, doc: BitcoinConfDocument): void {
	const lines: string[] = [];

	for (const [key, value] of Object.entries(doc.globals)) {
		lines.push(`${key}=${value}`);
	}

	for (const [sectionName, sectionValues] of Object.entries(doc.sections)) {
		if (lines.length > 0) {
			lines.push("");
		}
		lines.push(`[${sectionName}]`);
		for (const [key, value] of Object.entries(sectionValues)) {
			lines.push(`${key}=${value}`);
		}
	}

	lines.push("");
	writeFileSync(path, lines.join("\n"), "utf-8");
}
