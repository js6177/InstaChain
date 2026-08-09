import { isStructuredObject } from "./json";

/** Counts of API failures keyed by a stable reason string. */
export class StressApiErrorCounts {
	total: number;
	byReason: Record<string, number>;

	constructor(init?: Partial<StressApiErrorCounts>) {
		this.total = init?.total ?? 0;
		this.byReason = { ...(init?.byReason ?? {}) };
	}

	record(reason: string): void {
		this.total += 1;
		this.byReason[reason] = (this.byReason[reason] ?? 0) + 1;
	}

	static empty(): StressApiErrorCounts {
		return new StressApiErrorCounts();
	}

	static parse(
		data: StressApiErrorCounts | null,
	): StressApiErrorCounts | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const { total, byReason } = data;
		if (typeof total !== "number" || !isStructuredObject(byReason ?? null)) {
			return null;
		}
		const parsedReasons: Record<string, number> = {};
		for (const [key, count] of Object.entries(byReason)) {
			if (typeof count === "number") {
				parsedReasons[key] = count;
			}
		}
		return new StressApiErrorCounts({ total, byReason: parsedReasons });
	}
}

export class StressApiErrors {
	readonly push: StressApiErrorCounts;
	readonly settle: StressApiErrorCounts;
	readonly seed: StressApiErrorCounts;

	constructor(init?: Partial<StressApiErrors>) {
		this.push = init?.push ?? StressApiErrorCounts.empty();
		this.settle = init?.settle ?? StressApiErrorCounts.empty();
		this.seed = init?.seed ?? StressApiErrorCounts.empty();
	}

	static empty(): StressApiErrors {
		return new StressApiErrors();
	}

	static parse(data: StressApiErrors | null): StressApiErrors | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const push = StressApiErrorCounts.parse(data.push ?? null);
		const settle = StressApiErrorCounts.parse(data.settle ?? null);
		const seed = StressApiErrorCounts.parse(data.seed ?? null);
		if (!push || !settle || !seed) {
			return null;
		}
		return new StressApiErrors({ push, settle, seed });
	}
}

export function emptyApiErrorCounts(): StressApiErrorCounts {
	return StressApiErrorCounts.empty();
}

export function emptyApiErrors(): StressApiErrors {
	return StressApiErrors.empty();
}

export function recordApiError(
	bucket: StressApiErrorCounts,
	reason: string,
): void {
	bucket.record(reason);
}
