import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function readConfig<T>(configPath: string): T {
	const contents = readFileSync(configPath, "utf-8");
	return JSON.parse(contents) as T;
}

export function writeConfig(configPath: string, data: unknown): void {
	mkdirSync(dirname(configPath), { recursive: true });
	writeFileSync(configPath, `${JSON.stringify(data, null, 4)}\n`, "utf-8");
}
