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
		const typed = data as StressCacheStats;
		return new StressCacheStats({
			hits: typed.hits,
			misses: typed.misses,
		});
	}
}
