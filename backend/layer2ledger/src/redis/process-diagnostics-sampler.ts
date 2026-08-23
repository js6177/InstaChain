import { getReplicaId } from "@openl2/openl2-logger";
import {
	ProcessDiagnosticsSample,
	ProcessDiagnosticsService,
} from "@openl2/stress-results";
import type Redis from "ioredis";
import { monitorEventLoopDelay } from "node:perf_hooks";

/** Redis LIST on `redis-diagnostics` holding JSON {@link ProcessDiagnosticsSample} rows. */
export const PROCESS_DIAGNOSTICS_SAMPLES_KEY =
	"Layer2Diagnostics:process_samples";

const SAMPLE_INTERVAL_MS = 500;
/** Keep a bounded ring so long-running processes cannot grow Redis unbounded. */
const MAX_STORED_SAMPLES = 50_000;
/** Cap backdating so a single catch-up tick cannot jump hours. */
const MAX_BACKDATE_MS = 60_000;

interface RedisWithCommandQueue {
	commandQueue?: unknown[];
}

function commandQueueLength(redis: Redis): number {
	const queue = (redis as Redis & RedisWithCommandQueue).commandQueue;
	return Array.isArray(queue) ? queue.length : 0;
}

function nanosecondsToMs(value: number): number {
	if (!Number.isFinite(value) || value < 0) {
		return 0;
	}
	return Number((value / 1e6).toFixed(3));
}

export interface ProcessDiagnosticsSamplerOptions {
	service: ProcessDiagnosticsService;
	redisTransaction: Redis;
	redisAddressBalance: Redis;
	/** Where samples are written (`redis-diagnostics` when configured). */
	redisDiagnostics: Redis;
}

interface ActiveSampler {
	options: ProcessDiagnosticsSamplerOptions;
	histogram: ReturnType<typeof monitorEventLoopDelay>;
	pending: ProcessDiagnosticsSample[];
	flushInFlight: boolean;
	lastHotPathSampleAtUnixMs: number;
	stopTimer: () => void;
}

let activeSampler: ActiveSampler | null = null;

function captureSample(
	sampler: ActiveSampler,
	options: {
		/** When true, reset the event-loop histogram after reading (timer ticks). */
		resetHistogram: boolean;
		/**
		 * Place the point earlier by the observed max delay so starved timers still
		 * land inside the blocked window instead of after load ends.
		 */
		backdateByMaxDelay: boolean;
	},
): ProcessDiagnosticsSample {
	const meanMs = nanosecondsToMs(sampler.histogram.mean);
	const maxMs = nanosecondsToMs(Number(sampler.histogram.max));
	const p99Ms = nanosecondsToMs(Number(sampler.histogram.percentile(99)));
	if (options.resetHistogram) {
		sampler.histogram.reset();
	}

	const nowUnixMs = Date.now();
	const backdateMs = options.backdateByMaxDelay
		? Math.min(Math.round(maxMs), MAX_BACKDATE_MS)
		: 0;

	return new ProcessDiagnosticsSample({
		service: sampler.options.service,
		replicaId: getReplicaId() ?? "unknown",
		capturedAtUnixMs: nowUnixMs - backdateMs,
		transactionsCommandQueueLength: commandQueueLength(
			sampler.options.redisTransaction,
		),
		addressBalanceCommandQueueLength: commandQueueLength(
			sampler.options.redisAddressBalance,
		),
		eventLoopDelayMeanMs: meanMs,
		eventLoopDelayMaxMs: maxMs,
		eventLoopDelayP99Ms: p99Ms,
	});
}

function enqueueSample(
	sampler: ActiveSampler,
	sample: ProcessDiagnosticsSample,
): void {
	sampler.pending.push(sample);
	void flushPending(sampler);
}

async function flushPending(sampler: ActiveSampler): Promise<void> {
	if (sampler.flushInFlight || sampler.pending.length === 0) {
		return;
	}
	sampler.flushInFlight = true;
	try {
		while (sampler.pending.length > 0) {
			const batch = sampler.pending.splice(0, 64);
			await sampler.options.redisDiagnostics.rpush(
				PROCESS_DIAGNOSTICS_SAMPLES_KEY,
				...batch.map((sample) => JSON.stringify(sample)),
			);
			await sampler.options.redisDiagnostics.ltrim(
				PROCESS_DIAGNOSTICS_SAMPLES_KEY,
				-MAX_STORED_SAMPLES,
				-1,
			);
		}
	} catch {
		// Best-effort; never fail the host process. Drop on failure to avoid unbounded RAM.
		sampler.pending.length = 0;
	} finally {
		sampler.flushInFlight = false;
		if (sampler.pending.length > 0) {
			void flushPending(sampler);
		}
	}
}

/**
 * Samples ioredis `commandQueue.length` and Bun event-loop delay every 500ms.
 *
 * Under heavy load `setInterval` is starved by the Bun event loop — samples then
 * only fire after the wave. We backdate by histogram max so those catch-up ticks
 * still plot inside the blocked window. Prefer {@link noteProcessDiagnosticsHotPathSample}
 * on request paths so command-queue depth is observed while work is in flight.
 */
export function startProcessDiagnosticsSampler(
	options: ProcessDiagnosticsSamplerOptions,
): () => void {
	if (activeSampler !== null) {
		activeSampler.stopTimer();
		activeSampler = null;
	}

	const histogram = monitorEventLoopDelay({ resolution: 10 });
	histogram.enable();

	const sampler: ActiveSampler = {
		options,
		histogram,
		pending: [],
		flushInFlight: false,
		lastHotPathSampleAtUnixMs: 0,
		stopTimer: () => {
			/* set below */
		},
	};
	activeSampler = sampler;

	const timer = setInterval(() => {
		if (activeSampler !== sampler) {
			return;
		}
		// Capture synchronously; never await Redis on the timer path so the next
		// tick is not skipped while a flush is in flight.
		enqueueSample(
			sampler,
			captureSample(sampler, {
				resetHistogram: true,
				backdateByMaxDelay: true,
			}),
		);
	}, SAMPLE_INTERVAL_MS);
	timer.unref?.();

	sampler.stopTimer = () => {
		clearInterval(timer);
	};

	return () => {
		if (activeSampler === sampler) {
			activeSampler = null;
		}
		sampler.stopTimer();
		histogram.disable();
		void flushPending(sampler);
	};
}

/**
 * Sync sample from a request path (while commandQueue is still non-empty).
 * Rate-limited to ~500ms so hot paths stay cheap.
 */
export function noteProcessDiagnosticsHotPathSample(): void {
	const sampler = activeSampler;
	if (sampler === null) {
		return;
	}
	const nowUnixMs = Date.now();
	if (nowUnixMs - sampler.lastHotPathSampleAtUnixMs < SAMPLE_INTERVAL_MS) {
		return;
	}
	sampler.lastHotPathSampleAtUnixMs = nowUnixMs;
	enqueueSample(
		sampler,
		captureSample(sampler, {
			// Keep the interval histogram continuous; the timer tick owns reset.
			resetHistogram: false,
			backdateByMaxDelay: false,
		}),
	);
}

export async function clearProcessDiagnosticsSamples(
	redisDiagnostics: Redis,
): Promise<void> {
	await redisDiagnostics.del(PROCESS_DIAGNOSTICS_SAMPLES_KEY);
}

export async function loadProcessDiagnosticsSamples(
	redisDiagnostics: Redis,
): Promise<ProcessDiagnosticsSample[]> {
	const rows = await redisDiagnostics.lrange(
		PROCESS_DIAGNOSTICS_SAMPLES_KEY,
		0,
		-1,
	);
	const samples: ProcessDiagnosticsSample[] = [];
	for (const row of rows) {
		try {
			const parsed = ProcessDiagnosticsSample.parse(JSON.parse(row));
			if (parsed !== null) {
				samples.push(parsed);
			}
		} catch {
			// Skip corrupt rows.
		}
	}
	return samples;
}
