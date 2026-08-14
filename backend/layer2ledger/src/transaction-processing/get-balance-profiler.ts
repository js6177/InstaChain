import type { OpenL2Logger } from "@openl2/openl2-logger";
import type Redis from "ioredis";
import { log as defaultLog } from "../logger";
import { ProfilerApiName } from "../redis/profiler-session-models";
import {
	PushTransactionProfiler,
	type PushTransactionProfilerSpan,
} from "./push-transaction-profiler";

export {
	GetBalanceProfilerTimeseries,
} from "../redis/profiler-session-models";

/**
 * Records getBalance handler entry/exit into the active profiler session.
 * Spans feed {@link GetBalanceProfilerTimeseries} (avg latency + throughput).
 */
export class GetBalanceProfiler {
	private readonly inner: PushTransactionProfiler;

	constructor(redis: Redis, logger: OpenL2Logger = defaultLog) {
		this.inner = new PushTransactionProfiler(
			ProfilerApiName.GetBalance,
			redis,
			logger,
		);
	}

	begin(): Promise<PushTransactionProfilerSpan> {
		return this.inner.begin();
	}
}
