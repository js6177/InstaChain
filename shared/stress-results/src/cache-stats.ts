import { isStructuredObject } from "./json";

export class StressCacheStats {
	readonly hits: number;
	readonly misses: number;

	constructor(init: StressCacheStats) {
		this.hits = init.hits;
		this.misses = init.misses;
	}

	static parse(data: StressCacheStats | null): StressCacheStats | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const { hits, misses } = data;
		if (typeof hits !== "number" || typeof misses !== "number") {
			return null;
		}
		return new StressCacheStats({ hits, misses });
	}
}
