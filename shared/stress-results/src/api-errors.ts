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
		const typed = data as StressApiErrorCounts;
		if (!isStructuredObject(typed.byReason ?? null)) {
			return null;
		}
		return new StressApiErrorCounts({
			total: typed.total,
			byReason: { ...typed.byReason },
		});
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
		const typed = data as StressApiErrors;
		const push = StressApiErrorCounts.parse(typed.push ?? null);
		const settle = StressApiErrorCounts.parse(typed.settle ?? null);
		const seed = StressApiErrorCounts.parse(typed.seed ?? null);
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
