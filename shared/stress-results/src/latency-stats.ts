import { isStructuredObject } from "./json";

/** Client-side latency distribution in milliseconds. */
export class LatencyStatsMs {
	readonly average: number;
	readonly shortest: number;
	readonly longest: number;
	readonly bottomQuartile: number;
	readonly upperQuartile: number;

	constructor(init: LatencyStatsMs) {
		this.average = init.average;
		this.shortest = init.shortest;
		this.longest = init.longest;
		this.bottomQuartile = init.bottomQuartile;
		this.upperQuartile = init.upperQuartile;
	}

	static parse(data: LatencyStatsMs | null): LatencyStatsMs | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as LatencyStatsMs;
		return new LatencyStatsMs({
			average: typed.average,
			shortest: typed.shortest,
			longest: typed.longest,
			bottomQuartile: typed.bottomQuartile,
			upperQuartile: typed.upperQuartile,
		});
	}
}

function roundMs(value: number): number {
	return Number(value.toFixed(2));
}

function percentile(sortedAscending: readonly number[], p: number): number {
	if (sortedAscending.length === 0) {
		return 0;
	}
	if (sortedAscending.length === 1) {
		return sortedAscending[0] ?? 0;
	}
	const index = (sortedAscending.length - 1) * p;
	const lower = Math.floor(index);
	const upper = Math.ceil(index);
	const lowerValue = sortedAscending[lower] ?? 0;
	const upperValue = sortedAscending[upper] ?? lowerValue;
	if (lower === upper) {
		return lowerValue;
	}
	const weight = index - lower;
	return lowerValue * (1 - weight) + upperValue * weight;
}

export function computeLatencyStats(
	latenciesMs: readonly number[],
): LatencyStatsMs {
	if (latenciesMs.length === 0) {
		return new LatencyStatsMs({
			average: 0,
			shortest: 0,
			longest: 0,
			bottomQuartile: 0,
			upperQuartile: 0,
		});
	}

	const sorted = [...latenciesMs].sort((a, b) => a - b);
	const sum = sorted.reduce((total, value) => total + value, 0);
	return new LatencyStatsMs({
		average: roundMs(sum / sorted.length),
		shortest: roundMs(sorted[0] ?? 0),
		longest: roundMs(sorted[sorted.length - 1] ?? 0),
		bottomQuartile: roundMs(percentile(sorted, 0.25)),
		upperQuartile: roundMs(percentile(sorted, 0.75)),
	});
}
